# Media Player agent guidance

## Product boundary

- Local files stay local. Do not introduce uploads, remote media libraries, accounts, telemetry, or network dependencies without an explicit product requirement.
- Browser/WebView playback is authoritative for normal playback. Do not add a second native playback engine unless a concrete platform gap is demonstrated.
- The queue is authoritative for playback order and current-track identity.
- ID3 title, artist, album, and embedded artwork are currently parsed from the user-selected browser `File`; keep this bounded and local.
- Rust/Tauri owns native application integration and is the extension point for capabilities that actually need native code.
- Reuse existing `audio-analysis` Rust surfaces for heavier decoding, waveform, analysis, or other audio-domain work instead of duplicating those capabilities here.

## Cross-platform rules

- Keep the portable player in `web/` working without Tauri.
- Tauri-specific code belongs in `src-tauri/`.
- Mobile support must not require desktop-only APIs.
- Prefer browser `File`/blob URLs for user-selected local media because they work on web and in WebViews without broad filesystem permissions.
- Any new platform claim must be backed by CI or an explicit documented limitation.
- Keep the Tauri identifier compatible with Android package naming and iOS bundle identifiers.

## Playback rules

- Queue operations must be deterministic and preserve the active track by identity when reordering.
- End-of-track advances to the next queue entry when one exists.
- Persist only harmless player preferences such as volume and playback speed; do not persist local file contents.
- Media Session integration is progressive enhancement and must not be required for playback.
- Cover-art object URLs must be revoked when replaced.
- A successful native build is not real-playback evidence. Browser, desktop, Android, and iOS playback acceptance requires the local acceptance runner's mechanical checks plus explicit audible-output confirmation on that target.
- Keep playback acceptance local and URL-addressable through `acceptance.html?target=...`; do not upload fixtures or acceptance telemetry.

## Verification

Run before opening or updating a pull request:

```bash
npm run verify:web
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

CI also validates desktop builds on Windows/macOS/Linux and debug mobile builds for Android/iOS.

For visual changes, capture the affected player surface when practical.
