import { createNativeLibraryApi, queueItemFromLibraryTrack } from "./native-library.js";
import {
  normalizePersistedPlaybackState,
  PLAYBACK_STATE_RESTORE_EVENT,
  PLAYBACK_STATE_SNAPSHOT_EVENT,
} from "./playback-state.js";

const SAVE_DELAY_MS = 2_000;

function tauriCore(tauri = globalThis.__TAURI__) {
  const core = tauri?.core;
  return typeof core?.invoke === "function" ? core : null;
}

export function createNativePlaybackStateApi(tauri = globalThis.__TAURI__) {
  const core = tauriCore(tauri);
  if (!core) return null;

  return {
    async load() {
      return core.invoke("load_playback_state");
    },

    async save(state) {
      await core.invoke("save_playback_state", { state });
    },
  };
}

export async function hydratePersistedPlaybackState(stateApi, libraryApi) {
  if (!stateApi || !libraryApi) return null;
  const state = normalizePersistedPlaybackState(await stateApi.load());
  if (!state || state.queueTrackIds.length === 0) return null;

  const tracks = await libraryApi.listTracks();
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const items = [];

  for (const trackId of state.queueTrackIds) {
    const track = tracksById.get(trackId);
    if (!track) continue;
    try {
      const sourceUrl = await libraryApi.resolveSource(trackId);
      items.push(queueItemFromLibraryTrack(track, sourceUrl));
    } catch {
      // Missing/corrupt entries remain visible to the Library integrity flow,
      // but cannot be restored into a playable queue.
    }
  }

  if (items.length === 0) return null;
  const restoredIds = new Set(items.map((item) => item.libraryTrackId));
  const currentTrackId = restoredIds.has(state.currentTrackId) ? state.currentTrackId : null;
  return {
    items,
    currentTrackId,
    positionSeconds: currentTrackId ? state.positionSeconds : 0,
  };
}

export function setupNativePlaybackState(win = globalThis.window) {
  if (!win) return null;
  const stateApi = createNativePlaybackStateApi(win.__TAURI__);
  const libraryApi = createNativeLibraryApi(win.__TAURI__);
  if (!stateApi || !libraryApi) return null;

  let latestState = null;
  let timer = null;
  let saveChain = Promise.resolve();

  function enqueueSave(state) {
    saveChain = saveChain
      .catch(() => undefined)
      .then(() => stateApi.save(state))
      .catch((error) => {
        console.warn("Could not persist playback state", error);
      });
  }

  function flush() {
    if (timer !== null) {
      win.clearTimeout(timer);
      timer = null;
    }
    if (!latestState) return;
    const state = latestState;
    latestState = null;
    enqueueSave(state);
  }

  function handleSnapshot(event) {
    const state = normalizePersistedPlaybackState(event.detail?.state);
    if (!state) return;
    latestState = state;

    if (event.detail?.immediate) {
      flush();
      return;
    }

    if (timer === null) {
      timer = win.setTimeout(flush, SAVE_DELAY_MS);
    }
  }

  win.addEventListener(PLAYBACK_STATE_SNAPSHOT_EVENT, handleSnapshot);

  void (async () => {
    try {
      const restored = await hydratePersistedPlaybackState(stateApi, libraryApi);
      if (!restored) return;
      win.dispatchEvent(
        new CustomEvent(PLAYBACK_STATE_RESTORE_EVENT, {
          detail: restored,
        }),
      );
    } catch (error) {
      console.warn("Could not restore playback state", error);
    }
  })();

  return {
    flush,
    destroy() {
      if (timer !== null) win.clearTimeout(timer);
      timer = null;
      latestState = null;
      win.removeEventListener(PLAYBACK_STATE_SNAPSHOT_EVENT, handleSnapshot);
    },
  };
}

if (globalThis.window) setupNativePlaybackState(globalThis.window);
