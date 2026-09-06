import assert from "node:assert/strict";
import test from "node:test";

import { formatBytes, formatTime, isMp3File, MP3_ACCEPT } from "../web/player.js";

test("MP3 accept list covers the extension and common MIME types", () => {
  assert.match(MP3_ACCEPT, /\.mp3/);
  assert.match(MP3_ACCEPT, /audio\/mpeg/);
});

test("MP3 detection accepts extension or MIME type", () => {
  assert.equal(isMp3File({ name: "track.MP3", type: "" }), true);
  assert.equal(isMp3File({ name: "track", type: "audio/mpeg" }), true);
  assert.equal(isMp3File({ name: "track.wav", type: "audio/wav" }), false);
});

test("time formatting handles tracks shorter and longer than one hour", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(3_661), "1:01:01");
  assert.equal(formatTime(Number.NaN), "0:00");
});

test("byte formatting stays compact", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1_024), "1.0 KB");
  assert.equal(formatBytes(12 * 1_024 * 1_024), "12 MB");
});
