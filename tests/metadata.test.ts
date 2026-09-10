import assert from "node:assert/strict";
import test from "node:test";

import { parseId3Metadata } from "../web/metadata.ts";

function synchsafe(value) {
  return Uint8Array.from([
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function uint32(value) {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function bytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function ascii(value) {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function textFrame(id, value) {
  const payload = bytes(Uint8Array.of(3), new TextEncoder().encode(value));
  return bytes(ascii(id), uint32(payload.length), Uint8Array.of(0, 0), payload);
}

function id3v23(frames) {
  const body = bytes(...frames);
  return bytes(
    ascii("ID3"),
    Uint8Array.of(3, 0, 0),
    synchsafe(body.length),
    body,
  );
}

test("ID3v2.3 text metadata is parsed", () => {
  const tag = id3v23([
    textFrame("TIT2", "Track title"),
    textFrame("TPE1", "Artist name"),
    textFrame("TALB", "Album name"),
  ]);

  const metadata = parseId3Metadata(tag);
  assert.equal(metadata.title, "Track title");
  assert.equal(metadata.artist, "Artist name");
  assert.equal(metadata.album, "Album name");
  assert.equal(metadata.picture, null);
});

test("ID3v2.3 attached picture is parsed without decoding the image", () => {
  const image = Uint8Array.of(0x89, 0x50, 0x4e, 0x47);
  const payload = bytes(
    Uint8Array.of(3),
    ascii("image/png"),
    Uint8Array.of(0),
    Uint8Array.of(3),
    Uint8Array.of(0),
    image,
  );
  const frame = bytes(ascii("APIC"), uint32(payload.length), Uint8Array.of(0, 0), payload);
  const metadata = parseId3Metadata(id3v23([frame]));

  assert.equal(metadata.picture?.mimeType, "image/png");
  assert.deepEqual(metadata.picture?.data, image);
});

test("invalid or missing ID3 tags return empty metadata", () => {
  assert.deepEqual(parseId3Metadata(new Uint8Array()), {
    title: null,
    artist: null,
    album: null,
    picture: null,
  });
  assert.deepEqual(parseId3Metadata(ascii("not an id3 tag")), {
    title: null,
    artist: null,
    album: null,
    picture: null,
  });
});
