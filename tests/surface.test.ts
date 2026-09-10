import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/app.ts", import.meta.url), "utf8");

test("the player exposes queue, metadata, transport, and multi-format input surfaces", () => {
  assert.match(html, /id="queue-list"/);
  assert.match(html, /id="cover-art"/);
  assert.match(html, /id="previous-button"/);
  assert.match(html, /id="next-button"/);
  assert.match(html, /id="playback-rate"/);
  assert.match(html, /multiple/);
  assert.match(html, /\.flac/);
  assert.match(html, /\.m4a/);
  assert.match(html, /audio\/webm/);
});

test("browser media integration remains optional and local", () => {
  assert.match(app, /URL\.createObjectURL/);
  assert.match(app, /mediaSession/);
  assert.match(app, /isSupportedAudioFile/);
  assert.match(app, /metadataStatus: isMp3File\(file\)/);
  assert.doesNotMatch(app, /fetch\(/);
});
