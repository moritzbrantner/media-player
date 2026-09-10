import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/app.ts", import.meta.url), "utf8");
const blueNoise = await readFile(new URL("../web/blue-noise.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../web/dj.css", import.meta.url), "utf8");

test("player exposes blue-noise shuffle, Auto DJ, and policy settings", () => {
  assert.match(html, /id="randomize-queue-button"/);
  assert.match(html, /id="auto-dj-toggle"/);
  assert.match(html, /id="blue-noise-spacing"/);
  assert.match(html, /id="blue-noise-artist"/);
  assert.match(html, /id="blue-noise-album"/);
  assert.match(html, /id="blue-noise-seed"/);
  assert.match(html, /href="\.\/dj\.css"/);
});

test("Auto DJ mutates the visible queue rather than introducing a hidden playback order", () => {
  assert.match(app, /queue = blueNoiseReorderUpcoming\(queue, currentIndex/);
  assert.match(app, /renderQueue\(\)/);
  assert.match(app, /if \(autoDjToggle\.checked\) rebalanceUpcomingQueue\(\)/);
  assert.doesNotMatch(app, /fetch\(/);
});

test("playback progression keeps the already-ordered visible tail without quadratic rebalancing", () => {
  const goNext = app.match(/async function goNext\(\)[\s\S]*?function moveQueueItem/)?.[0] ?? "";
  const ended =
    app.match(/audio\.addEventListener\("ended"[\s\S]*?audio\.addEventListener\("error"/)?.[0] ?? "";

  assert.match(goNext, /loadTrack\(index, \{ autoplay: true \}\)/);
  assert.doesNotMatch(goNext, /rebalanceUpcomingQueue/);
  assert.match(ended, /loadTrack\(index, \{ autoplay: true \}\)/);
  assert.doesNotMatch(ended, /rebalanceUpcomingQueue/);
});

test("Auto DJ remains queue policy and does not duplicate audio-analysis DSP", () => {
  const implementation = `${app}\n${blueNoise}`;
  assert.doesNotMatch(
    implementation,
    /\b(?:bpm|beat-grid|beatGrid|musicalKey|waveform|crossfade)\b/i,
  );
});

test("new DJ controls retain coarse-pointer touch targets", () => {
  assert.match(styles, /@media \(pointer: coarse\)/);
  assert.match(styles, /\.auto-dj-toggle[\s\S]*min-height:\s*48px/);
  assert.match(styles, /\.seed-control input[\s\S]*min-height:\s*48px/);
});
