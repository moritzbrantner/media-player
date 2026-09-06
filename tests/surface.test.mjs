import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

test("the player exposes queue, metadata, and transport surfaces", () => {
  assert.match(html, /id="queue-list"/);
  assert.match(html, /id="cover-art"/);
  assert.match(html, /id="previous-button"/);
  assert.match(html, /id="next-button"/);
  assert.match(html, /id="playback-rate"/);
  assert.match(html, /multiple/);
});

test("browser media integration remains optional and local", () => {
  assert.match(app, /URL\.createObjectURL/);
  assert.match(app, /mediaSession/);
  assert.doesNotMatch(app, /fetch\(/);
});
