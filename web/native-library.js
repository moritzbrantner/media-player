export const LIBRARY_ADD_EVENT = "media-player:add-native-track";
export const LIBRARY_REMOVE_EVENT = "media-player:remove-native-track";

function tauriCore(tauri = globalThis.__TAURI__) {
  const core = tauri?.core;
  if (typeof core?.invoke !== "function" || typeof core?.convertFileSrc !== "function") {
    return null;
  }
  return core;
}

export function createNativeLibraryApi(tauri = globalThis.__TAURI__) {
  const core = tauriCore(tauri);
  if (!core) return null;

  return {
    async listTracks() {
      return core.invoke("list_library_tracks");
    },

    async resolveSource(trackId) {
      const path = await core.invoke("resolve_library_track", { id: trackId });
      return core.convertFileSrc(path);
    },

    async removeTrack(trackId) {
      await core.invoke("remove_library_track", { id: trackId });
    },

    async importFile(file) {
      if (!file || !Number.isFinite(file.size) || file.size <= 0) {
        throw new Error("Choose a non-empty audio file to import.");
      }

      let sessionId = null;
      try {
        const started = await core.invoke("begin_library_import", {
          name: file.name,
          mimeType: file.type || null,
          expectedSize: file.size,
        });
        sessionId = started.sessionId;
        const maxChunkBytes = Number(started.maxChunkBytes);
        if (!sessionId || !Number.isInteger(maxChunkBytes) || maxChunkBytes <= 0) {
          throw new Error("Native library returned an invalid import session.");
        }

        for (let offset = 0; offset < file.size; offset += maxChunkBytes) {
          const end = Math.min(file.size, offset + maxChunkBytes);
          const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
          await core.invoke("append_library_import", {
            sessionId,
            chunk: Array.from(bytes),
          });
        }

        return await core.invoke("commit_library_import", { sessionId });
      } catch (error) {
        if (sessionId) {
          try {
            await core.invoke("abort_library_import", { sessionId });
          } catch {
            // Preserve the original import failure; stale-temp recovery belongs to Slice 1C.
          }
        }
        throw error;
      }
    },
  };
}

export function queueItemFromLibraryTrack(track, sourceUrl) {
  if (!track?.id || !track?.name || !Number.isFinite(track?.size) || !sourceUrl) {
    throw new Error("Cannot create a queue item from an incomplete library track.");
  }

  return {
    id: `library:${track.id}`,
    libraryTrackId: track.id,
    sourceUrl,
    file: {
      name: track.name,
      size: track.size,
      type: track.mimeType || "",
      lastModified: 0,
    },
    metadata: { title: null, artist: null, album: null, picture: null },
    metadataStatus: "unavailable",
  };
}

export function dispatchLibraryQueueAdd(target, item, { autoplay = false } = {}) {
  target.dispatchEvent(
    new CustomEvent(LIBRARY_ADD_EVENT, {
      detail: { item, autoplay },
    }),
  );
}

export function dispatchLibraryQueueRemove(target, trackId) {
  target.dispatchEvent(
    new CustomEvent(LIBRARY_REMOVE_EVENT, {
      detail: { trackId },
    }),
  );
}
