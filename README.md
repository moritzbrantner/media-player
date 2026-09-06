# Media Player

Cross-platform media player built with React, TypeScript, Rust, and Tauri 2.

The first milestone is intentionally small: choose a local MP3 file and play it. The same browser-native audio path is used on the web and inside Tauri WebViews on desktop and mobile, so the MVP does not need broad filesystem permissions or a platform-specific playback backend.

## MVP

- Open a local `.mp3` file.
- Play and pause it.
- Seek through the track.
- Change volume.
- Show elapsed time, duration, file name, and file size.
- Run as a normal web app or inside Tauri on Windows, macOS, Linux, Android, and iOS.

## Architecture

- `src/`: portable React UI and browser/WebView playback logic.
- `src-tauri/`: minimal Rust/Tauri host. Rust remains the home for future native capabilities rather than duplicating the browser playback path.
- Local media is represented by an in-memory blob URL. The selected file is not uploaded anywhere.

Future media decoding, metadata, waveform, or analysis work can reuse the existing Rust audio repositories without making them a prerequisite for basic playback.
