import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_ACCEPT,
  audioFormatForFile,
  clamp,
  displaySubtitle,
  displayTitle,
  formatBytes,
  formatTime,
  isMp3File,
  isSupportedAudioFile,
} from "../web/player.ts";

test("audio accept list covers the supported format families", () => {
  for (const token of [
    ".mp3",
    ".wav",
    ".flac",
    ".ogg",
    ".opus",
    ".m4a",
    ".aac",
    ".webm",
    "audio/mpeg",
    "audio/wav",
    "audio/flac",
    "audio/ogg",
    "audio/mp4",
    "audio/webm",
  ]) {
    assert.match(AUDIO_ACCEPT, new RegExp(token.replace(".", "\\.")));
  }
});

test("audio format detection accepts extensions or MIME types", () => {
  const cases = [
    ["track.MP3", "", "mp3"],
    ["track.wav", "", "wav"],
    ["track.flac", "", "flac"],
    ["track.opus", "", "ogg"],
    ["track.m4a", "", "mp4-audio"],
    ["track.weba", "", "webm-audio"],
    ["track", "audio/ogg", "ogg"],
    ["track", "audio/mp4; codecs=mp4a.40.2", "mp4-audio"],
  ];

  for (const [name, type, expectedId] of cases) {
    const file = { name, type };
    assert.equal(isSupportedAudioFile(file), true);
    assert.equal(audioFormatForFile(file)?.id, expectedId);
  }
});

test("audio format detection rejects unrelated and explicit video inputs", () => {
  assert.equal(isSupportedAudioFile({ name: "cover.jpg", type: "image/jpeg" }), false);
  assert.equal(isSupportedAudioFile({ name: "movie.mp4", type: "video/mp4" }), false);
  assert.equal(isSupportedAudioFile({ name: "movie.webm", type: "video/webm" }), false);
  assert.equal(isSupportedAudioFile({ name: "notes.txt", type: "" }), false);
});

test("MP3 detection stays narrow for ID3 metadata parsing", () => {
  assert.equal(isMp3File({ name: "track.MP3", type: "" }), true);
  assert.equal(isMp3File({ name: "track", type: "audio/mpeg" }), true);
  assert.equal(isMp3File({ name: "track.wav", type: "audio/wav" }), false);
});

test("file extension takes precedence over a conflicting audio MIME type", () => {
  assert.equal(audioFormatForFile({ name: "track.flac", type: "audio/mpeg" })?.id, "flac");
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

test("clamp handles invalid and out-of-range values", () => {
  assert.equal(clamp(Number.NaN, 0, 1), 0);
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(1.5, 0, 1), 1);
  assert.equal(clamp(0.4, 0, 1), 0.4);
});

test("display helpers prefer metadata and fall back to the file", () => {
  const file = { name: "file.mp3", size: 1_024 };
  assert.equal(displayTitle({ file, metadata: { title: "Song" } }), "Song");
  assert.equal(displayTitle({ file, metadata: {} }), "file.mp3");
  assert.equal(
    displaySubtitle({ file, metadata: { artist: "Artist", album: "Album" } }),
    "Artist · Album",
  );
  assert.equal(displaySubtitle({ file, metadata: {} }), "1.0 KB");
});
