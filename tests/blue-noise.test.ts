import assert from "node:assert/strict";
import test from "node:test";

import {
  blueNoiseOrder,
  blueNoiseReorderUpcoming,
  normalizeBlueNoiseSettings,
} from "../web/blue-noise.ts";

function track(id, artist, album = "") {
  return {
    id,
    file: { name: `${id}.mp3`, size: id.length * 100, lastModified: 1 },
    metadata: { title: id, artist, album },
  };
}

test("blue-noise settings are bounded and normalized", () => {
  assert.deepEqual(
    normalizeBlueNoiseSettings({ spacing: 99, artistWeight: -2, albumWeight: 4, seed: " x " }),
    { spacing: 12, artistWeight: 0, albumWeight: 1, seed: "x" },
  );
});

test("fixed seed and settings produce deterministic permutations", () => {
  const input = [track("a", "A"), track("b", "B"), track("c", "C"), track("d", "D")];
  const options = { seed: "fixed", spacing: 3, artistWeight: 0.8, albumWeight: 0.4 };
  const first = blueNoiseOrder(input, options);
  const second = blueNoiseOrder(input, options);

  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.deepEqual([...first].map((item) => item.id).sort(), input.map((item) => item.id).sort());
  assert.notEqual(first, input);
});

test("different seeds can produce different orders", () => {
  const input = Array.from({ length: 10 }, (_, index) => track(`t${index}`, `artist-${index}`));
  const first = blueNoiseOrder(input, { seed: "one" }).map((item) => item.id);
  const second = blueNoiseOrder(input, { seed: "two" }).map((item) => item.id);
  assert.notDeepEqual(first, second);
});

test("upcoming reorder preserves the played prefix and current track", () => {
  const input = [track("played", "A"), track("current", "B"), track("c", "C"), track("d", "D")];
  const result = blueNoiseReorderUpcoming(input, 1, { seed: "fixed", spacing: 4 });
  assert.equal(result[0], input[0]);
  assert.equal(result[1], input[1]);
  assert.deepEqual(result.slice(2).map((item) => item.id).sort(), ["c", "d"]);
});

test("artist repulsion avoids an adjacent repeat when alternatives exist", () => {
  const input = [
    track("a1", "Same"),
    track("a2", "Same"),
    track("b1", "Other"),
    track("c1", "Third"),
  ];
  const result = blueNoiseOrder(input.slice(1), {
    seed: "artist-gap",
    spacing: 3,
    artistWeight: 1,
    albumWeight: 0,
    history: [input[0]],
  });
  assert.notEqual(result[0].metadata.artist, "Same");
});
