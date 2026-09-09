import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  boundedRestorePosition,
  MAX_PERSISTED_QUEUE_TRACKS,
  normalizePersistedPlaybackState,
  playbackStateSnapshot,
  restoredCurrentIndex,
} from "../web/playback-state.js";
import {
  createNativePlaybackStateApi,
  hydratePersistedPlaybackState,
} from "../web/native-playback-state.js";

function id(character) {
  return character.repeat(64);
}

function nativeItem(character) {
  return {
    id: `library:${id(character)}`,
    libraryTrackId: id(character),
    file: { name: `${character}.mp3`, size: 1, type: "audio/mpeg" },
  };
}

test("snapshot persists only the stable imported subsequence", () => {
  const queue = [
    { id: "browser-1", file: { name: "local.mp3" } },
    nativeItem("a"),
    { id: "browser-2", file: { name: "temporary.wav" } },
    nativeItem("b"),
  ];

  assert.deepEqual(playbackStateSnapshot(queue, 3, 12.5), {
    queueTrackIds: [id("a"), id("b")],
    currentTrackId: id("b"),
    positionSeconds: 12.5,
  });

  assert.deepEqual(playbackStateSnapshot(queue, 0, 99), {
    queueTrackIds: [id("a"), id("b")],
    currentTrackId: null,
    positionSeconds: 0,
  });
});

test("snapshot refuses to silently truncate an oversized durable queue", () => {
  const queue = Array.from({ length: MAX_PERSISTED_QUEUE_TRACKS + 1 }, (_, index) => ({
    id: `library:${index}`,
    libraryTrackId: index.toString(16).padStart(64, "0"),
  }));
  assert.equal(playbackStateSnapshot(queue, 0, 0), null);
});

test("persisted state rejects duplicate or detached current identities", () => {
  assert.equal(
    normalizePersistedPlaybackState({
      queueTrackIds: [id("a"), id("a")],
      currentTrackId: id("a"),
      positionSeconds: 0,
    }),
    null,
  );
  assert.equal(
    normalizePersistedPlaybackState({
      queueTrackIds: [id("a")],
      currentTrackId: id("b"),
      positionSeconds: 0,
    }),
    null,
  );
});

test("restore selection and position are bounded without autoplay semantics", () => {
  const items = [nativeItem("a"), nativeItem("b")];
  assert.equal(restoredCurrentIndex(items, id("b")), 1);
  assert.equal(restoredCurrentIndex(items, id("c")), 0);
  assert.equal(boundedRestorePosition(90, 60), 59.95);
  assert.equal(boundedRestorePosition(-5, 60), 0);
});

test("native playback state API is progressive enhancement", async () => {
  assert.equal(createNativePlaybackStateApi(undefined), null);
  const calls = [];
  const api = createNativePlaybackStateApi({
    core: {
      async invoke(command, args = {}) {
        calls.push({ command, args });
        if (command === "load_playback_state") return null;
        return null;
      },
    },
  });
  assert.equal(await api.load(), null);
  await api.save({ queueTrackIds: [], currentTrackId: null, positionSeconds: 0 });
  assert.deepEqual(calls.map(({ command }) => command), ["load_playback_state", "save_playback_state"]);
});

test("restore hydrates only library entries that still resolve", async () => {
  const stateApi = {
    async load() {
      return {
        queueTrackIds: [id("a"), id("b"), id("c")],
        currentTrackId: id("b"),
        positionSeconds: 42,
      };
    },
  };
  const libraryApi = {
    async listTracks() {
      return [
        { id: id("a"), name: "a.mp3", mimeType: "audio/mpeg", size: 1 },
        { id: id("b"), name: "b.mp3", mimeType: "audio/mpeg", size: 1 },
      ];
    },
    async resolveSource(trackId) {
      if (trackId === id("b")) throw new Error("missing file");
      return `asset:${trackId}`;
    },
  };

  const restored = await hydratePersistedPlaybackState(stateApi, libraryApi);
  assert.deepEqual(restored.items.map((item) => item.libraryTrackId), [id("a")]);
  assert.equal(restored.currentTrackId, null);
  assert.equal(restored.positionSeconds, 0);
});

test("app restoration stays non-autoplaying and snapshot-driven", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
  assert.match(app, /PLAYBACK_STATE_RESTORE_EVENT/);
  assert.match(app, /PLAYBACK_STATE_SNAPSHOT_EVENT/);
  assert.match(app, /autoplay:\s*false/);
  assert.match(app, /playbackStateSnapshot\(queue, currentIndex, audio\.currentTime\)/);
});
