# Mobile readiness

The portable web player is the application UI on Android and iOS as well as desktop. Mobile readiness still requires native package evidence, touch-first browser/WebView behavior, and real-device playback evidence.

## Hosted gates

- `npm run verify:web` continues to cover the portable player and deterministic mobile-surface contracts.
- Native CI continues to build the Tauri host on Windows, macOS, and Linux.
- Android and iOS hosted package jobs are intentionally paused for now.

A missing hosted Android/iOS job is **not** mobile-green evidence. It means mobile packaging and device acceptance are currently performed explicitly on a developer machine instead of blocking pull requests.

## Local mobile package checks

The repository keeps the same Tauri commands so mobile validation can be run locally without changing the product or build contract.

Android:

```bash
npm install
npm run tauri:android:init -- --ci
npm run tauri:android:build -- --debug --target aarch64 --apk
npm run tauri:android:build -- --debug --aab
```

Confirm that the APK and AAB are actually produced and install/test the APK on the intended device when practical.

iOS on macOS:

```bash
npm install
npm run tauri:ios:init -- --ci
npm run tauri:ios:build -- --debug --target aarch64-sim --no-sign
```

Confirm that the simulator app is actually produced. Signing and real-device iOS acceptance remain separate.

## Real-device playback gates

For Android and iOS, run `acceptance.html?target=android` or `acceptance.html?target=ios` in the built app and accept a known-good MP3 only after metadata, playback, time progression, seeking, pause, and audible output all pass on the actual device.

Lifecycle claims such as background/lock-screen playback, audio focus, Bluetooth routing, interruptions, and relaunch recovery also require explicit device evidence. Hosted desktop/web success must not be substituted for those checks.

## Re-enabling hosted mobile CI

When hosted mobile validation becomes useful again, restore Android APK/AAB and iOS simulator jobs in `.github/workflows/native.yml`, restore artifact publication, and only then make those checks required merge gates again. Keep package failure fail-closed rather than adding placeholder green jobs.

## UI requirements

- Respect display safe areas.
- Keep primary and transport touch targets at least 48 CSS pixels on coarse pointers.
- Keep Previous, Play, and Next as the primary mobile transport row; seek-back/forward actions live on a secondary row.
- Queue reorder/remove actions remain directly tappable without hover state.
- Local audio stays local; mobile polish must not introduce uploads, accounts, telemetry, or a second playback engine.
