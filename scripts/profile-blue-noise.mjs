import { blueNoiseOrder } from "../web/blue-noise.js";

const TRACK_COUNT = 1_200;
const ROUNDS = 3;

const tracks = Array.from({ length: TRACK_COUNT }, (_, index) => ({
  id: `track-${index}`,
  file: {
    name: `track-${String(index).padStart(4, "0")}.flac`,
    size: 4_000_000 + ((index * 104_729) % 7_000_000),
    lastModified: 1_700_000_000_000 + index * 1_003,
  },
  metadata: {
    title: `Track ${index}`,
    artist: `Artist ${index % 37}`,
    album: `Album ${index % 113}`,
  },
}));

let checksum = 0;
for (let round = 0; round < ROUNDS; round += 1) {
  const ordered = blueNoiseOrder(tracks, {
    spacing: 7,
    artistWeight: 0.9,
    albumWeight: 0.5,
    seed: `runtime-profiler-${round}`,
  });

  if (ordered.length !== TRACK_COUNT) {
    throw new Error(`expected ${TRACK_COUNT} tracks, got ${ordered.length}`);
  }

  for (let index = 0; index < ordered.length; index += 41) {
    checksum = (checksum * 33 + Number(ordered[index].id.slice(6))) >>> 0;
  }
}

console.log(`blue-noise-checksum=${checksum}`);
