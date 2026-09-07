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

test("named transport placement is scoped to the narrow-screen grid", () => {
  const mobileQuery = mobileStyles.indexOf("@media (max-width: 700px)");
  const previousPlacement = mobileStyles.indexOf("#previous-button");
  const nextMediaQuery = mobileStyles.indexOf("@media (max-width: 440px)");

  assert.ok(mobileQuery >= 0);
  assert.ok(previousPlacement > mobileQuery);
  assert.ok(previousPlacement < nextMediaQuery);
  assert.doesNotMatch(mobileStyles.slice(0, mobileQuery), /grid-area:/);
});

test("native CI validates Android APK and AAB package shapes", () => {
  assert.match(nativeWorkflow, /--apk/);
  assert.match(nativeWorkflow, /--aab/);
  assert.match(nativeWorkflow, /Build debug Android App Bundle/);
});

test("native CI retains confirmed mobile package outputs", () => {
  assert.match(nativeWorkflow, /actions\/upload-artifact@v7/);
  assert.match(nativeWorkflow, /name: media-player-android-debug-apk/);
  assert.match(
    nativeWorkflow,
    /src-tauri\/gen\/android\/app\/build\/outputs\/apk\/universal\/debug\/app-universal-debug\.apk/,
  );
  assert.match(nativeWorkflow, /name: media-player-android-debug-aab/);
  assert.match(
    nativeWorkflow,
    /src-tauri\/gen\/android\/app\/build\/outputs\/bundle\/universalDebug\/app-universal-debug\.aab/,
  );
  assert.match(nativeWorkflow, /name: Archive iOS simulator app/);
  assert.match(
    nativeWorkflow,
    /tar -czf media-player-ios-arm64-simulator\.tar\.gz -C src-tauri\/gen\/apple\/build\/arm64-sim "Media Player\.app"/,
  );
  assert.match(nativeWorkflow, /name: media-player-ios-arm64-simulator/);
  assert.match(nativeWorkflow, /path: media-player-ios-arm64-simulator\.tar\.gz/);
  assert.equal((nativeWorkflow.match(/if-no-files-found: error/g) ?? []).length, 3);
});

test("Tauri mobile baseline and bundling are explicit", () => {
  assert.equal(tauriConfig.identifier, "com.moenarch.mediaplayer");
  assert.equal(tauriConfig.bundle.active, true);
  assert.deepEqual(tauriConfig.bundle.icon, ["icons/icon.png", "icons/icon.ico"]);
  assert.equal(tauriConfig.bundle.android.minSdkVersion, 24);
  assert.equal(tauriConfig.bundle.android.autoIncrementVersionCode, false);
  assert.equal(tauriConfig.bundle.iOS.minimumSystemVersion, "15.0");
});
