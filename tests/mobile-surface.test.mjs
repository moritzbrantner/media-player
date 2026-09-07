import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
const nativeWorkflow = await readFile(
  new URL("../.github/workflows/native.yml", import.meta.url),
  "utf8",
);
const tauriConfig = JSON.parse(
  await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);

test("mobile viewport keeps safe-area rendering enabled", () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});

test("mobile controls retain comfortable touch targets", () => {
  assert.match(styles, /@media \(pointer: coarse\)/);
  assert.match(styles, /min-height:\s*48px/);
  assert.match(styles, /#previous-button\s*\{[\s\S]*grid-area:\s*previous/);
  assert.match(styles, /#play-button\s*\{[\s\S]*grid-area:\s*play/);
  assert.match(styles, /grid-template-areas:[\s\S]*"previous play next"/);
});

test("native CI validates Android APK and AAB package shapes", () => {
  assert.match(nativeWorkflow, /--apk/);
  assert.match(nativeWorkflow, /--aab/);
});

test("Tauri mobile baseline is explicit", () => {
  assert.equal(tauriConfig.identifier, "com.moenarch.mediaplayer");
  assert.equal(tauriConfig.bundle.android.minSdkVersion, 24);
  assert.equal(tauriConfig.bundle.iOS.minimumSystemVersion, "15.0");
});
