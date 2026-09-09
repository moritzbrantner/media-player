# Media Player

Cross-platform local media player built with web platform APIs, Rust, and Tauri 2.

The current product slice is a usable local audio player rather than only a playback proof: add multiple local tracks, read MP3 ID3 metadata and artwork, arrange a queue, and control playback. The same browser-native media path is used on GitHub Pages and inside Tauri WebViews, so local files stay on the device and the app does not need broad filesystem permissions.

## Current capabilities

- Add one or more local MP3, WAV, FLAC, Ogg/Opus, M4A/AAC, or WebM audio files.
- Let the browser/WebView remain authoritative for decoding; exact codec/container playback support can vary by platform.
- Read ID3 title, artist, album, and embedded cover art from MP3 files in the browser/WebView.
- Fall back to the local filename and file size when a format does not use the app's bounded ID3 parser.
- Play/pause, seek, jump ±10 seconds, and move to previous/next tracks.
- Reorder and remove queue entries; automatically continue to the next track.
- Persist volume and playback speed locally.
- Integrate with browser/WebView media-session controls where supported.
- Run as a static web app and as a Tauri application on Windows, macOS, Linux, Android, and iOS.
- Use a touch-first mobile layout with safe-area padding and coarse-pointer targets.
- Run a local real-playback acceptance flow for browser, desktop, Android, and iOS targets.
- Deploy the static player to GitHub Pages from `main`.

Hosted web player: <https://moritzbrantner.github.io/media-player/>

## Architecture

- `web/`: portable player, queue, bounded ID3 parser, format admission, playback acceptance, and browser/WebView integration.
- `src-tauri/`: minimal Rust/Tauri host and the extension point for capabilities that genuinely need native integration.
- `.github/workflows/verify.yml`: fast web and Rust checks.
- `.github/workflows/native.yml`: Windows, macOS, and Linux Tauri build validation; hosted Android/iOS jobs are temporarily paused.
- `.github/workflows/pages.yml`: static build, deployment, and hosted smoke test.
- `docs/mobile-readiness.md`: hosted/local evidence boundaries for Android/iOS readiness.

### Ownership boundary

The Web Media API is authoritative for basic playback and codec/container support. The queue owns playback order. File-format admission is intentionally a small browser-local registry based on file extensions and MIME types; it does not claim that every admitted codec decodes on every WebView. ID3 parsing stays MP3-specific because the browser already owns the selected `File` objects and no native bridge is needed for this bounded metadata work.

For heavier decoding, waveform generation, signal analysis, richer cross-format metadata extraction, or capabilities that need a native backend, reuse the existing `audio-analysis` Rust surfaces rather than creating a second audio stack in this repository.

## Mobile / Tauri readiness

The Android and iOS apps use the same portable player as the hosted web build, with `web/mobile.css` adding mobile-specific layout rather than forking the application UI. The mobile transport keeps Previous, Play, and Next in the primary row and moves ±10-second seeking to a secondary row. Coarse-pointer controls use at least 48 CSS-pixel targets, and the existing safe-area insets remain active.

Tauri's mobile baseline is explicit in `src-tauri/tauri.conf.json`: Android currently targets minimum SDK 24 and iOS minimum system version 15.0. Bundling is enabled and uses the checked-in application icons.

Hosted Native CI currently validates Windows, macOS, and Linux desktop hosts only. Android APK/AAB and iOS simulator package checks are intentionally local-only for now. Their absence from a pull request is not a successful mobile validation result. See `docs/mobile-readiness.md` for the local package and real-device gates.

## Playback acceptance

Use `acceptance.html?target=...` with one known-good MP3 on each target. The target is explicit in the URL so evidence is not confused between runtimes:

- `?target=browser`
- `?target=desktop`
- `?target=android`
- `?target=ios`

The acceptance runner checks that metadata exposes a finite duration, playback starts from a user action, current time advances, seeking reaches the requested position, and pause works. It then requires a human to confirm audible output. Files are loaded with a local blob URL and are never uploaded.

A successful CI build is build evidence, not audible-playback evidence. Do not mark a target accepted until the mechanical checks pass on that target and audible output is explicitly confirmed there.

On the hosted build, open <https://moritzbrantner.github.io/media-player/acceptance.html?target=browser>. In a packaged desktop or mobile build, use the `Playback acceptance` link in the player footer and select the matching target.

## Development

### Web

```bash
npm run dev:web
```

Open `http://127.0.0.1:1420`.

### Desktop

```bash
npm install
npm run tauri:dev
```

### Android

After installing the Tauri Android prerequisites:

```bash
npm install
npm run tauri:android:init
npm run tauri:android:dev
```

Run the local package checks with:

```bash
npm run tauri:android:build -- --debug --target aarch64 --apk
npm run tauri:android:build -- --debug --aab
```

### iOS

On macOS with the Tauri iOS prerequisites installed:

```bash
npm install
npm run tauri:ios:init
npm run tauri:ios:dev
```

Run the local simulator package check with:

```bash
npm run tauri:ios:build -- --debug --target aarch64-sim --no-sign
```

## Verification

```bash
npm run verify:web
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

Pull requests additionally compile the Tauri host on Windows, macOS, and Linux. Android/iOS packaging and device acceptance are local-only until the hosted mobile jobs are deliberately restored.
