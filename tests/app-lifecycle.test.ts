import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as player from "../web/player.ts";
import * as queue from "../web/queue.ts";
import * as blueNoise from "../web/blue-noise.ts";

// Execute the application, not a copied controller or source-text assertion.
// Only browser/metadata boundaries are controlled; queue and ranking code are real.
const source = (await readFile(new URL("../web/app.ts", import.meta.url), "utf8"))
  .replace(/^import\s[\s\S]*?;\n/gm, "");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  // A test can also inspect a rejected promise that the old app never handled.
  void promise.catch(() => {});
  return { promise, resolve, reject };
}

function element() {
  const listeners = new Map();
  return {
    value: "", textContent: "", src: "", hidden: true, disabled: false,
    checked: false, dataset: {}, attributes: {}, children: [], options: [],
    addEventListener(name, handler) {
      const handlers = listeners.get(name) ?? [];
      handlers.push(handler);
      listeners.set(name, handlers);
    },
    emit(name, detail = {}) {
      for (const handler of listeners.get(name) ?? []) {
        handler({ target: this, preventDefault() {}, ...detail });
      }
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; if (name === "src") this.src = ""; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
  };
}

function harness(settings = {}) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const audio = node("audio");
  const plays = [];
  const metadata = [];
  const actions = new Map();
  const revoked = [];
  let rankingCalls = 0;
  let nextId = 0;
  let nextUrl = 0;
  audio.paused = true;
  audio.playbackRate = 1;
  audio.defaultPlaybackRate = 1;
  audio.currentTime = 0;
  audio.duration = 100;
  audio.play = () => {
    const pending = deferred();
    plays.push(pending);
    audio.paused = false;
    audio.emit("play");
    return pending.promise;
  };
  audio.pause = () => { audio.paused = true; audio.emit("pause"); };
  audio.load = () => {
    // HTML's media-element load algorithm restores defaultPlaybackRate.
    audio.playbackRate = audio.defaultPlaybackRate;
    queueMicrotask(() => audio.emit("ratechange"));
  };
  node("playback-rate").options = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
    .map((value) => ({ value: String(value) }));
  const storage = new Map(Object.entries({
    "media-player.blue-noise.seed": "lifecycle-test",
    ...settings,
  }));
  const window = element();
  runInNewContext(source, {
    ...player,
    ...queue,
    ...blueNoise,
    blueNoiseReorderUpcoming(...args) {
      rankingCalls += 1;
      return blueNoise.blueNoiseReorderUpcoming(...args);
    },
    readId3Metadata(file) {
      const pending = deferred();
      metadata.push({ file, ...pending });
      return pending.promise;
    },
    document: {
      ...element(), querySelector: (selector) => node(selector.slice(1)), createElement: element,
    },
    window,
    navigator: { mediaSession: { setActionHandler: (name, handler) => actions.set(name, handler) } },
    MediaMetadata: function (metadata) { Object.assign(this, metadata); },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID: () => `track-${++nextId}` },
    URL: { createObjectURL: () => `blob:test-${++nextUrl}`, revokeObjectURL: (url) => revoked.push(url) },
    Blob,
  }, { filename: "web/app.ts" });
  return {
    node, audio, plays, metadata, actions, window, revoked,
    get rankingCalls() { return rankingCalls; },
    rows: () => node("queue-list").children,
    titles: () => node("queue-list").children.map((row) => row.children[0].textContent),
    click: (id) => node(id).emit("click"),
    add(names) {
      node("file-input").files = names.map((name) => ({ name, size: 100, lastModified: 1, type: "" }));
      node("file-input").emit("change");
    },
    autoDj(checked) { node("auto-dj-toggle").checked = checked; node("auto-dj-toggle").emit("change"); },
    remove(index) { this.rows()[index].children[1].children[2].emit("click"); },
    select(index) { this.rows()[index].children[0].emit("click"); },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const abort = () => Object.assign(new Error("Superseded"), { name: "AbortError" });
const denied = () => Object.assign(new Error("Playback denied"), { name: "NotAllowedError" });

function resolveMetadata(h) {
  for (const pending of h.metadata) pending.resolve({ title: pending.file.name, artist: "Artist" });
}

test("Auto-DJ removal renders the queue even when no upcoming tail remains", () => {
  const h = harness();
  h.add(["active.wav", "next.wav"]);
  h.autoDj(true);
  const source = h.audio.src;
  const rankingCalls = h.rankingCalls;
  h.remove(1);
  assert.deepEqual(h.titles(), ["active.wav"]);
  assert.equal(h.node("next-button").disabled, true);
  assert.equal(h.rows()[0].dataset.active, "true");
  assert.equal(h.audio.src, source);
  assert.equal(h.rankingCalls, rankingCalls);
});

test("Auto-DJ removal before the last active track updates controls without reloading it", () => {
  const h = harness();
  h.add(["played.wav", "active.wav"]);
  h.select(1);
  h.autoDj(true);
  const source = h.audio.src;
  h.remove(0);
  assert.deepEqual(h.titles(), ["active.wav"]);
  assert.equal(h.node("previous-button").disabled, true);
  assert.equal(h.rows()[0].dataset.active, "true");
  assert.equal(h.audio.src, source);
});

test("metadata completion cannot rerank after Auto-DJ is disabled", async () => {
  const h = harness({ "media-player.auto-dj": "true" });
  h.add(["a.mp3", "b.mp3", "c.mp3"]);
  h.autoDj(false);
  const rankingCalls = h.rankingCalls;
  const titles = h.titles();
  resolveMetadata(h);
  await flush();
  assert.equal(h.rankingCalls, rankingCalls);
  assert.deepEqual(h.titles(), titles);
});

test("enabling Auto-DJ during metadata reads uses the completed metadata once", async () => {
  const h = harness();
  h.add(["a.mp3", "b.mp3", "c.mp3"]);
  h.autoDj(true);
  const rankingCalls = h.rankingCalls;
  const source = h.audio.src;
  resolveMetadata(h);
  await flush();
  assert.equal(h.rankingCalls, rankingCalls + 1);
  assert.equal(h.audio.src, source);
  assert.equal(h.rows()[0].dataset.active, "true");
});

test("a cleared metadata batch cannot rerank a replacement queue", async () => {
  const h = harness({ "media-player.auto-dj": "true" });
  h.add(["old-a.mp3", "old-b.mp3"]);
  h.click("clear-queue-button");
  h.add(["new-a.wav", "new-b.wav", "new-c.wav"]);
  const rankingCalls = h.rankingCalls;
  const titles = h.titles();
  resolveMetadata(h);
  await flush();
  assert.equal(h.rankingCalls, rankingCalls);
  assert.deepEqual(h.titles(), titles);
});

test("already-hydrated but subsequently removed items cannot validate an old metadata batch", async () => {
  const h = harness({ "media-player.auto-dj": "true" });
  h.add(["old-a.mp3", "old-b.mp3"]);
  h.metadata[0].resolve({ title: "old-a.mp3" });
  await flush();
  h.click("clear-queue-button");
  h.add(["new-a.wav", "new-b.wav", "new-c.wav"]);
  const rankingCalls = h.rankingCalls;
  h.metadata[1].resolve({ title: "old-b.mp3" });
  await flush();
  assert.equal(h.rankingCalls, rankingCalls);
});

for (const rate of [0.75, 1.5, 2]) {
  test(`saved ${rate}x speed survives initial load, Next, and ratechange`, async () => {
    const h = harness({ "media-player.playback-rate": String(rate) });
    h.add(["first.wav", "second.wav"]);
    await flush();
    assert.equal(h.audio.playbackRate, rate);
    assert.equal(h.node("playback-rate").value, String(rate));
    h.click("next-button");
    await flush();
    assert.equal(h.audio.playbackRate, rate);
    assert.equal(h.node("playback-rate").value, String(rate));
  });
}

test("changing speed survives clearing and importing another track", async () => {
  const h = harness();
  h.add(["old.wav"]);
  h.node("playback-rate").value = "1.5";
  h.node("playback-rate").emit("change");
  h.click("clear-queue-button");
  await flush();
  h.add(["new.wav"]);
  await flush();
  assert.equal(h.audio.playbackRate, 1.5);
  assert.equal(h.node("playback-rate").value, "1.5");
});

test("an old play rejection cannot overwrite successful playback of the next track", async () => {
  const h = harness();
  h.add(["first.wav", "second.wav"]);
  h.click("play-button");
  h.click("next-button");
  h.plays[1].resolve();
  await flush();
  h.plays[0].reject(denied());
  await flush();
  assert.equal(h.node("error-message").textContent, "");
  assert.equal(h.node("track-title").textContent, "second.wav");
});

test("an old play success cannot erase the newest request's failure", async () => {
  const h = harness();
  h.add(["first.wav", "second.wav"]);
  h.click("play-button");
  h.click("next-button");
  h.plays[1].reject(denied());
  await flush();
  const error = h.node("error-message").textContent;
  assert.match(error, /Playback could not start/);
  h.plays[0].resolve();
  await flush();
  assert.equal(h.node("error-message").textContent, error);
});

for (const cancel of ["pause", "clear", "remove-last"]) {
  test(`${cancel} cancels pending playback without displaying a failure`, async () => {
    const h = harness();
    h.add(["only.wav"]);
    h.click("play-button");
    if (cancel === "pause") h.click("play-button");
    else if (cancel === "clear") h.click("clear-queue-button");
    else h.remove(0);
    h.plays[0].reject(abort());
    await flush();
    assert.equal(h.node("error-message").textContent, "");
    if (cancel !== "pause") assert.equal(h.rows().length, 0);
  });
}

test("the current play request still reports a real failure after its track is reordered", async () => {
  const h = harness();
  h.add(["active.wav", "other.wav"]);
  h.click("play-button");
  const source = h.audio.src;
  h.rows()[0].children[1].children[1].emit("click");
  h.plays[0].reject(denied());
  await flush();
  assert.match(h.node("error-message").textContent, /Playback could not start/);
  assert.equal(h.audio.src, source);
  assert.equal(h.rows()[1].dataset.active, "true");
});

test("Media Session play handles failures through the same playback path", async () => {
  const h = harness();
  h.add(["only.wav"]);
  h.actions.get("play")();
  h.plays[0].reject(denied());
  await flush();
  assert.match(h.node("error-message").textContent, /Playback could not start/);
});

test("Media Session play with an empty queue does not ask the media element to play", () => {
  const h = harness();
  h.actions.get("play")();
  assert.equal(h.plays.length, 0);
});

test("Next and ended consume the visible queue without reranking", () => {
  const h = harness();
  h.add(["one.wav", "two.wav", "three.wav", "four.wav"]);
  h.autoDj(true);
  const titles = h.titles();
  const rankingCalls = h.rankingCalls;
  h.click("next-button");
  assert.equal(h.node("track-title").textContent, titles[1]);
  h.audio.emit("ended");
  assert.equal(h.node("track-title").textContent, titles[2]);
  assert.deepEqual(h.titles(), titles);
  assert.equal(h.rankingCalls, rankingCalls);
});

// Issue 1: no-op ranking must not skip rendering, including native queue events.
test("native-track removal renders the final active row and then clears the queue", () => {
  const h = harness();
  for (const id of ["native-one", "native-two"]) {
    h.window.emit("media-player:add-native-track", { detail: { item: {
      id, libraryTrackId: id, sourceUrl: `asset:${id}`,
      file: { name: `${id}.wav`, size: 100, type: "audio/wav" },
    } } });
  }
  h.autoDj(true);
  const rankingCalls = h.rankingCalls;
  h.window.emit("media-player:remove-native-track", { detail: { trackId: "native-two" } });
  assert.deepEqual(h.titles(), ["native-one.wav"]);
  assert.equal(h.node("next-button").disabled, true);
  assert.equal(h.rankingCalls, rankingCalls);
  h.window.emit("media-player:remove-native-track", { detail: { trackId: "native-one" } });
  assert.equal(h.rows().length, 0);
  assert.equal(h.node("player").hidden, true);
  assert.equal(h.node("play-button").disabled, true);
  assert.equal(h.audio.src, "");
});

test("removing the active track preserves a playing replacement and its identity", async () => {
  const h = harness();
  h.add(["first.wav", "second.wav"]);
  h.click("play-button");
  h.plays[0].resolve();
  await flush();
  h.autoDj(true);
  h.remove(0);
  assert.deepEqual(h.titles(), ["second.wav"]);
  assert.equal(h.rows()[0].dataset.active, "true");
  assert.equal(h.node("next-button").disabled, true);
  assert.equal(h.plays.length, 2);
  h.plays[1].resolve();
  await flush();
  assert.equal(h.audio.paused, false);
});

// Issue 2: batches may contain failures or a mix of live and retired identities.
test("a mixed metadata batch reranks once for surviving tracks without reviving removed items", async () => {
  const h = harness({ "media-player.auto-dj": "true" });
  h.add(["a.mp3", "b.mp3", "c.mp3", "d.mp3"]);
  const removedName = h.titles()[2];
  h.remove(2);
  const rankingCalls = h.rankingCalls;
  const source = h.audio.src;
  for (const pending of h.metadata) {
    if (pending.file.name === removedName) pending.reject(new Error("File no longer readable"));
    else pending.resolve({ title: pending.file.name, artist: "Artist" });
  }
  await flush();
  assert.equal(h.rows().length, 3);
  assert.equal(h.titles().includes(removedName), false);
  assert.equal(h.rankingCalls, rankingCalls + 1);
  assert.equal(h.audio.src, source);
});

test("failed metadata reads after disabling Auto-DJ cannot rerank the queue", async () => {
  const h = harness({ "media-player.auto-dj": "true" });
  h.add(["a.mp3", "b.mp3", "c.mp3"]);
  h.autoDj(false);
  const titles = h.titles();
  const rankingCalls = h.rankingCalls;
  for (const pending of h.metadata) pending.reject(new Error("Unreadable metadata"));
  await flush();
  assert.deepEqual(h.titles(), titles);
  assert.equal(h.rankingCalls, rankingCalls);
  assert.equal(h.node("error-message").textContent, "");
});

// Issue 3: all source-changing routes must retain the user's selected rate.
test("selected speed survives Previous, ended, and active-track replacement", async () => {
  const h = harness();
  h.add(["one.wav", "two.wav", "three.wav"]);
  h.node("playback-rate").value = "1.25";
  h.node("playback-rate").emit("change");
  for (const advance of [
    () => h.click("next-button"),
    () => h.click("previous-button"),
    () => h.audio.emit("ended"),
    () => h.remove(1),
  ]) {
    advance();
    h.plays.at(-1)?.resolve();
    await flush();
    assert.equal(h.audio.playbackRate, 1.25);
    assert.equal(h.audio.defaultPlaybackRate, 1.25);
    assert.equal(h.node("playback-rate").value, "1.25");
  }
  assert.equal(h.node("track-title").textContent, "three.wav");
});

test("unsupported saved speed falls back safely and remains stable after loading", async () => {
  const h = harness({ "media-player.playback-rate": "500" });
  h.add(["one.wav"]);
  await flush();
  assert.equal(h.audio.playbackRate, 1);
  assert.equal(h.audio.defaultPlaybackRate, 1);
  assert.equal(h.node("playback-rate").value, "1");
});

// Issue 4: request generations must work on the same source and every pause path.
test("a superseded request on the same track cannot overwrite the newest success", async () => {
  const h = harness();
  h.add(["one.wav"]);
  h.actions.get("play")();
  h.actions.get("play")();
  h.plays[1].resolve();
  await flush();
  h.plays[0].reject(denied());
  await flush();
  assert.equal(h.node("error-message").textContent, "");
});

test("Media Session pause fences late non-AbortError rejections", async () => {
  const h = harness();
  h.add(["one.wav"]);
  h.actions.get("play")();
  h.actions.get("pause")();
  h.plays[0].reject(denied());
  await flush();
  assert.equal(h.audio.paused, true);
  assert.equal(h.node("error-message").textContent, "");
});

test("active removal fences a previous success from erasing the replacement failure", async () => {
  const h = harness();
  h.add(["first.wav", "replacement.wav"]);
  h.click("play-button");
  h.remove(0);
  h.plays[1].reject(denied());
  await flush();
  h.plays[0].resolve();
  await flush();
  assert.match(h.node("error-message").textContent, /Playback could not start/);
  assert.equal(h.node("track-title").textContent, "replacement.wav");
});
