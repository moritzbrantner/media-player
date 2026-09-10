import assert from "node:assert/strict";
import test from "node:test";

import { moveItem, nextIndex, previousIndex, removeItem } from "../web/queue.ts";

test("queue navigation stops cleanly at either end", () => {
  assert.equal(nextIndex(0, -1), -1);
  assert.equal(nextIndex(3, -1), 0);
  assert.equal(nextIndex(3, 0), 1);
  assert.equal(nextIndex(3, 2), -1);

  assert.equal(previousIndex(0, -1), -1);
  assert.equal(previousIndex(3, -1), 0);
  assert.equal(previousIndex(3, 2), 1);
  assert.equal(previousIndex(3, 0), -1);
});

test("queue movement is immutable and deterministic", () => {
  const input = ["a", "b", "c"];
  assert.deepEqual(moveItem(input, 0, 2), ["b", "c", "a"]);
  assert.deepEqual(input, ["a", "b", "c"]);
  assert.deepEqual(moveItem(input, 4, 0), input);
});

test("removing a queue item does not mutate the input", () => {
  const input = ["a", "b", "c"];
  assert.deepEqual(removeItem(input, 1), ["a", "c"]);
  assert.deepEqual(input, ["a", "b", "c"]);
});
