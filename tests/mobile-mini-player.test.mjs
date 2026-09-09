import assert from "node:assert/strict";
import test from "node:test";
import {
  mobileControlSnapshot,
  shouldShowMobileMiniPlayer,
} from "../web/mobile-mini-player.js";

test("mobile control mirrors existing transport authority", () => {
  const source = {
    disabled: true,
    textContent: "Pause",
    getAttribute(name) {
      return name === "aria-label" ? "Pause playback" : null;
    },
  };

  assert.deepEqual(mobileControlSnapshot(source), {
    disabled: true,
    text: "Pause",
    ariaLabel: "Pause playback",
  });
});

test("mobile mini-player only appears for an active player source", () => {
  assert.equal(shouldShowMobileMiniPlayer({ playerHidden: false, audioSource: "blob:track" }), true);
  assert.equal(shouldShowMobileMiniPlayer({ playerHidden: true, audioSource: "blob:track" }), false);
  assert.equal(shouldShowMobileMiniPlayer({ playerHidden: false, audioSource: "" }), false);
});
