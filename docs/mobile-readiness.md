# Mobile readiness

The portable web player is the application UI on Android and iOS as well as desktop. Mobile readiness therefore requires both native Tauri packaging evidence and touch-first browser/WebView behavior.

## Automated gates

- `npm run verify:web` covers the portable player and mobile surface contracts.
- Android CI initializes the Tauri Android project, builds an aarch64 debug APK, and builds a debug Android App Bundle (AAB).
- iOS CI initializes the Tauri iOS project and builds the Apple Silicon simulator app without signing.
- Desktop CI continues to build the Tauri host on Windows, macOS, and Linux.
- Mobile jobs fail if the expected Tauri package output disappears, and successful outputs are retained as GitHub Actions artifacts for 14 days.

## Retained artifacts

Successful Native workflow runs expose these testing artifacts:

- `media-player-android-debug-apk`: installable Android debug APK from `app-universal-debug.apk`.
- `media-player-android-debug-aab`: Android debug App Bundle from `app-universal-debug.aab`, useful for validating the Play bundle shape.
- `media-player-ios-arm64-simulator`: unsigned Apple Silicon iOS Simulator `.app` bundle.

These artifacts are deliberately debug/unsigned outputs. Retaining them makes installation and simulator testing reproducible; it does not turn them into store releases.

The Android AAB gate validates the package shape used for Google Play distribution, but it does not replace signing or store submission. The iOS simulator gate validates build compatibility, but App Store distribution still requires signing and real-device acceptance.

## Manual gates

For Android and iOS, run `acceptance.html?target=android` or `acceptance.html?target=ios` in the built app and accept a known-good MP3 only after metadata, playback, time progression, seeking, pause, and audible output all pass on the actual device.

## UI requirements

- Respect display safe areas.
- Keep primary and transport touch targets at least 48 CSS pixels on coarse pointers.
- Keep Previous, Play, and Next as the primary mobile transport row; seek-back/forward actions live on a secondary row.
- Queue reorder/remove actions remain directly tappable without hover state.
- Local audio stays local; mobile polish must not introduce uploads, accounts, telemetry, or a second playback engine.
