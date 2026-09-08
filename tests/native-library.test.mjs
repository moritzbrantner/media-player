import assert from "node:assert/strict";
import test from "node:test";
import { createNativeLibraryApi, queueItemFromLibraryTrack } from "../web/native-library.js";

function mockTauri() {
  const calls = [];
  const core = {
    async invoke(command, args = {}) {
      calls.push({ command, args });
      if (command === "begin_library_import") {
        return { sessionId: "session-1", maxChunkBytes: 3 };
      }
      if (command === "commit_library_import") {
        return {
          id: "a".repeat(64),
          name: "song.mp3",
          mimeType: "audio/mpeg",
          size: 7,
          relativePath: `media/${"a".repeat(64)}.mp3`,
        };
      }
      if (command === "resolve_library_track") return "/app/media/song.mp3";
      if (command === "list_library_tracks") return [];
      return null;
    },
    convertFileSrc(path) {
      return `asset:${path}`;
    },
  };
  return { tauri: { core }, calls };
}

test("native library is progressive enhancement", () => {
  assert.equal(createNativeLibraryApi(undefined), null);
  assert.equal(createNativeLibraryApi({ core: {} }), null);
});

test("native import follows backend chunk bound and commits once", async () => {
  const { tauri, calls } = mockTauri();
  const api = createNativeLibraryApi(tauri);
  const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7]);
  const file = {
    name: "song.mp3",
    type: "audio/mpeg",
    size: bytes.length,
    slice(start, end) {
      return new Blob([bytes.slice(start, end)]);
    },
  };

  const track = await api.importFile(file);

  assert.equal(track.name, "song.mp3");
  assert.deepEqual(
    calls.filter(({ command }) => command === "append_library_import").map(({ args }) => args.chunk),
    [[1, 2, 3], [4, 5, 6], [7]],
  );
  assert.equal(calls.filter(({ command }) => command === "commit_library_import").length, 1);
  assert.equal(calls.some(({ command }) => command === "abort_library_import"), false);
});

test("native import aborts its session when a chunk fails", async () => {
  const { tauri, calls } = mockTauri();
  tauri.core.invoke = async (command, args = {}) => {
    calls.push({ command, args });
    if (command === "begin_library_import") return { sessionId: "failed", maxChunkBytes: 2 };
    if (command === "append_library_import") throw new Error("write failed");
    return null;
  };
  const api = createNativeLibraryApi(tauri);
  const file = {
    name: "broken.mp3",
    type: "audio/mpeg",
    size: 3,
    slice() {
      return new Blob([Uint8Array.from([1, 2])]);
    },
  };

  await assert.rejects(api.importFile(file), /write failed/);
  assert.equal(calls.at(-1).command, "abort_library_import");
  assert.equal(calls.at(-1).args.sessionId, "failed");
});

test("persisted track produces stable queue identity and asset source", async () => {
  const { tauri } = mockTauri();
  const api = createNativeLibraryApi(tauri);
  const track = {
    id: "b".repeat(64),
    name: "saved.flac",
    mimeType: "audio/flac",
    size: 1234,
  };
  const sourceUrl = await api.resolveSource(track.id);
  const item = queueItemFromLibraryTrack(track, sourceUrl);

  assert.equal(item.id, `library:${track.id}`);
  assert.equal(item.libraryTrackId, track.id);
  assert.equal(item.sourceUrl, "asset:/app/media/song.mp3");
  assert.equal(item.file.name, "saved.flac");
  assert.equal(item.file.size, 1234);
});
