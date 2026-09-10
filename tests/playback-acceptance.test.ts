import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ACCEPTANCE_TARGETS,
  acceptanceTargetFromSearch,
  acceptanceTargetUrl,
  seekTarget,
  summarizeAcceptance,
} from "../web/playback-acceptance.ts";

test("acceptance target is URL-addressable and defaults safely", () => {
  assert.deepEqual(ACCEPTANCE_TARGETS, ["browser", "desktop", "android", "ios"]);
  assert.equal(acceptanceTargetFromSearch("?target=android"), "android");
  assert.equal(acceptanceTargetFromSearch("?target=unknown"), "browser");
  assert.equal(acceptanceTargetFromSearch(""), "browser");
  assert.equal(acceptanceTargetUrl("ios"), "./acceptance.html?target=ios");
});

test("acceptance summary distinguishes pending, failed, and passed evidence", () => {
  assert.equal(summarizeAcceptance({}).status, "pending");
  assert.deepEqual(
    summarizeAcceptance({ metadata: true, play: false }).failed,
    ["play"],
  );

  const passing = {
    metadata: true,
    play: true,
    advance: true,
    seek: true,
    pause: true,
    audible: true,
  };
  assert.deepEqual(summarizeAcceptance(passing), { status: "pass", failed: [], pending: [] });
});

test("seek target stays inside the decoded track", () => {
  assert.equal(seekTarget(Number.NaN, 0), null);
  assert.equal(seekTarget(0, 0), null);

  const middle = seekTarget(10, 1);
  assert.ok(middle > 1);
  assert.ok(middle < 10);

  const nearEnd = seekTarget(1, 0.99);
  assert.ok(nearEnd >= 0);
  assert.ok(nearEnd < 1);
});

test("acceptance surface exercises real media-element behavior locally", async () => {
  const html = await readFile(new URL("../web/acceptance.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../web/acceptance.ts", import.meta.url), "utf8");

  assert.match(html, /id="acceptance-file"/);
  assert.match(html, /accept="\.mp3,audio\/mpeg,audio\/mp3"/);
  assert.match(html, /id="acceptance-audio"/);
  assert.match(html, /id="heard-audio"/);
  assert.match(html, /data-target="browser"/);
  assert.match(html, /data-target="desktop"/);
  assert.match(html, /data-target="android"/);
  assert.match(html, /data-target="ios"/);

  assert.match(app, /URL\.createObjectURL/);
  assert.match(app, /audio\.play\(\)/);
  assert.match(app, /audio\.currentTime/);
  assert.match(app, /audio\.pause\(\)/);
  assert.doesNotMatch(app, /fetch\(/);
});
