# Media Player

Cross-platform media player built with web platform APIs, Rust, and Tauri 2.

The first milestone is intentionally small: choose a local MP3 file and play it. The same browser-native audio path is used on the web and inside Tauri WebViews on desktop and mobile, so the MVP does not need broad filesystem permissions or a platform-specific playback backend.

## MVP

- Open a local `.mp3` file.
- Play and pause it.
- Seek through the track.
- Change volume.
- Show elapsed time, duration, file name, and file size.
- Run as a normal web app or inside Tauri on Windows, macOS, Linux, Android, and iOS.

## Architecture

- `web/`: portable UI and browser/WebView playback logic.
- `src-tauri/`: minimal Rust/Tauri host. Rust remains the home for future native capabilities rather than duplicating the browser playback path.
- Local media is represented by an in-memory blob URL. The selected file is not uploaded anywhere.

This boundary leaves room to reuse the existing `audio-analysis` Rust crates later for metadata, waveform generation, analysis, or native decoding where it is actually needed.

## Development

### Web

```bash
npm run dev:web
```

Open `http://127.0.0.1:1420`.

### Desktop

Install dependencies once, then run Tauri:

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

### iOS

On macOS with the Tauri iOS prerequisites installed:

```bash
npm install
npm run tauri:ios:init
npm run tauri:ios:dev
```

## Verification

```bash
npm run verify:web
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```
