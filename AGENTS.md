# Media Player agent guidance

## Product boundary

- The MVP plays local MP3 files only.
- Local files stay local. Do not introduce uploads, remote media libraries, accounts, telemetry, or network dependencies without an explicit product requirement.
- Browser/WebView playback is authoritative for the MVP. Do not add a second native playback engine unless a concrete platform gap is demonstrated.
- Rust/Tauri owns native application integration and is the extension point for future native capabilities.
- Reuse the existing `audio-analysis` Rust surfaces for future decoding, metadata, waveform, or analysis work where appropriate instead of duplicating those capabilities here.

## Cross-platform rules

- Keep the portable player in `web/` working without Tauri.
- Tauri-specific code belongs in `src-tauri/`.
- Mobile support must not require desktop-only APIs.
- Prefer browser `File`/blob URLs for user-selected local media because they work on web and in WebViews without broad filesystem permissions.

## Verification

Run before opening or updating a pull request:

```bash
npm run verify:web
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

For visual changes, capture the affected player surface when practical.
