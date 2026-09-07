import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const acceptanceHtml = await readFile(
  new URL("../web/acceptance.html", import.meta.url),
  "utf8",
);
const baseStyles = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
const mobileStyles = await readFile(new URL("../web/mobile.css", import.meta.url), "utf8");
const nativeWorkflow = await readFile(
  new URL("../.github/workflows/native.yml", import.meta.url),
  "utf8",
);
const tauriConfig = JSON.parse(
  await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);

test("mobile viewport keeps safe-area rendering enabled", () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(baseStyles, /env\(safe-area-inset-top\)/);
  assert.match(mobileStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(html, /href="\.\/mobile\.css"/);
  assert.match(acceptanceHtml, /href="\.\/mobile\.css"/);
});

test("mobile controls retain comfortable touch targets", () => {
  assert.match(mobileStyles, /@media \(pointer: coarse\)/);
  assert.match(mobileStyles, /min-height:\s*48px/);
  assert.match(mobileStyles, /#previous-button\s*\{[\s\S]*grid-area:\s*previous/);
  assert.match(mobileStyles, /#play-button\s*\{[\s\S]*grid-area:\s*play/);
  assert.match(mobileStyles, /grid-template-areas:[\s\S]*"previous play next"/);
});

test("native CI validates Android APK and AAB package shapes", () => {
  assert.match(nativeWorkflow, /--apk/);
  assert.match(nativeWorkflow, /--aab/);
  assert.match(nativeWorkflow, /Build debug Android App Bundle/);
});

test("Tauri mobile baseline and bundling are explicit", () => {
  assert.equal(tauriConfig.identifier, "com.moenarch.mediaplayer");
  assert.equal(tauriConfig.bundle.active, true);
  assert.deepEqual(tauriConfig.bundle.icon, ["icons/icon.png", "icons/icon.ico"]);
  assert.equal(tauriConfig.bundle.android.minSdkVersion, 24);
  assert.equal(tauriConfig.bundle.android.autoIncrementVersionCode, false);
  assert.equal(tauriConfig.bundle.iOS.minimumSystemVersion, "15.0");
});
