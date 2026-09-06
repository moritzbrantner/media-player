# Media Player

Cross-platform local media player built with web platform APIs, Rust, and Tauri 2.

The current product slice is a usable MP3 player rather than only a playback proof: add multiple local tracks, read their embedded metadata and artwork, arrange a queue, and control playback. The same browser-native media path is used on GitHub Pages and inside Tauri WebViews, so local files stay on the device and the app does not need broad filesystem permissions.

## Current capabilities

- Add one or more local `.mp3` files.
- Read ID3 title, artist, album, and embedded cover art in the browser/WebView.
- Play/pause, seek, jump ±10 seconds, and move to previous/next tracks.
- Reorder and remove queue entries; automatically continue to the next track.
- Persist volume and playback speed locally.
- Integrate with browser/WebView media-session controls where supported.
- Run as a static web app and as a Tauri application on Windows, macOS, Linux, Android, and iOS.
- Deploy the static player to GitHub Pages from `main`.

Hosted web player: <https://moritzbrantner.github.io/media-player/>

## Architecture

- `web/`: portable player, queue, ID3 parser, and browser/WebView integration.
- `src-tauri/`: minimal Rust/Tauri host and the extension point for capabilities that genuinely need native integration.
- `.github/workflows/verify.yml`: fast web and Rust checks.
- `.github/workflows/native.yml`: Windows, macOS, Linux, Android, and iOS build validation.
- `.github/workflows/pages.yml`: static build, deployment, and hosted smoke test.

### Ownership boundary

The Web Media API is authoritative for basic playback. The queue owns playback order. ID3 parsing is intentionally browser-local because the browser already owns the selected `File` objects and no native bridge is needed for this bounded metadata work.

For heavier decoding, waveform generation, signal analysis, or capabilities that need a native backend, reuse the existing `audio-analysis` Rust surfaces rather than creating a second audio stack in this repository.

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

A CI-style debug build can be run with:

```bash
npm run tauri:android:build -- --debug --target aarch64 --apk
```

### iOS

On macOS with the Tauri iOS prerequisites installed:

```bash
npm install
npm run tauri:ios:init
npm run tauri:ios:dev
```

A simulator build can be run with:

```bash
npm run tauri:ios:build -- --debug --target aarch64-sim --no-sign
```

## Verification

```bash
npm run verify:web
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

Pull requests additionally compile the Tauri host on Windows, macOS, and Linux and build Android/iOS debug targets.
