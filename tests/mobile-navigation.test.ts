import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MOBILE_VIEWS,
  mobileViewFromSearch,
  mobileViewSearch,
  mobileViewUrl,
  resolveMobileView,
} from "../web/mobile-navigation.ts";

const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const mobileStyles = await readFile(new URL("../web/mobile.css", import.meta.url), "utf8");
const miniPlayer = await readFile(new URL("../web/mobile-mini-player.ts", import.meta.url), "utf8");
const navigation = await readFile(new URL("../web/mobile-navigation.ts", import.meta.url), "utf8");

test("mobile views are URL-addressable without discarding other query state", () => {
  assert.deepEqual(MOBILE_VIEWS, ["library", "now-playing", "queue"]);
  assert.equal(mobileViewFromSearch("?target=browser&view=queue"), "queue");
  assert.equal(mobileViewFromSearch("?view=unknown"), null);

  const params = new URLSearchParams(mobileViewSearch("?target=browser", "now-playing"));
  assert.equal(params.get("target"), "browser");
  assert.equal(params.get("view"), "now-playing");
  assert.equal(
    mobileViewUrl({ pathname: "/media-player/", search: "?target=browser", hash: "#track" }, "queue"),
    "/media-player/?target=browser&view=queue#track",
  );
});

test("unavailable deep links fall back without inventing playback state", () => {
  assert.equal(resolveMobileView("queue", ["library"]), "library");
  assert.equal(resolveMobileView("queue", ["library", "queue"]), "queue");
  assert.equal(resolveMobileView("unknown", ["now-playing", "queue"]), "now-playing");
});

test("narrow-screen navigation reuses the existing Library, player, and queue surfaces", () => {
  assert.match(html, /id="mobile-view-nav"/);
  assert.match(html, /data-mobile-view-target="library"/);
  assert.match(html, /data-mobile-view-target="now-playing"/);
  assert.match(html, /data-mobile-view-target="queue"/);
  assert.match(html, /id="drop-target"[^>]*data-mobile-surface="library"/);
  assert.match(html, /id="player"[^>]*data-mobile-surface="now-playing"/);
  assert.match(html, /id="queue-section"[^>]*data-mobile-surface="queue"/);
  assert.match(html, /src="\.\/mobile-navigation\.js"/);

  assert.match(mobileStyles, /html\[data-mobile-view="library"\]/);
  assert.match(mobileStyles, /html\[data-mobile-view="now-playing"\]/);
  assert.match(mobileStyles, /html\[data-mobile-view="queue"\]/);
  assert.match(navigation, /historyLike\.pushState/);
  assert.match(navigation, /"popstate"/);
});

test("mini-player summary opens the shared Now Playing surface", () => {
  assert.match(miniPlayer, /media-player:navigate-mobile/);
  assert.match(miniPlayer, /view:\s*"now-playing"/);
  assert.match(mobileStyles, /data-mobile-view="now-playing"[^\n]*\.mobile-mini-player/);
});
