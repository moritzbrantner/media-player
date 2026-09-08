# Media Player roadmap

Media Player is a local-first cross-platform audio player. The hosted web build must remain useful without a native backend, while Tauri is the extension point for capabilities that genuinely require operating-system integration.

## Product boundaries

- Local media stays local. Do not introduce uploads, remote libraries, accounts, telemetry, or network dependencies without an explicit product requirement.
- The visible queue remains authoritative for playback order and current-track identity.
- Browser/WebView playback remains authoritative for ordinary playback unless a concrete platform gap demonstrates that a narrow native playback abstraction is required.
- `audio-analysis` remains authoritative for reusable DSP and music-analysis semantics such as tempo, beat-grid/rhythm, key, levels, waveform, and related analysis.
- Native persistence may copy media explicitly imported by the user into the application's private sandbox. Do not scan broad device storage or persist arbitrary browser-selected files implicitly.
- Every platform claim needs deterministic build evidence or explicit real-device acceptance evidence.

## Current foundation

Already implemented:

- local multi-format audio selection and queue playback
- MP3 ID3 metadata and embedded artwork
- previous/next, seeking, volume, playback speed, and Media Session integration
- deterministic blue-noise shuffle and visible-queue Auto-DJ policy
- touch-first mobile layout, safe-area handling, and coarse-pointer targets
- Android APK/AAB and iOS simulator CI artifacts
- local browser/desktop/Android/iOS playback-acceptance harness
- GitHub Pages static player

## Priority 1 — Persistent native music library

Goal: on installed Tauri applications, let a user import music once and keep it available across application restarts without broad filesystem access.

### Slice 1A — Native library storage and import

- Add a versioned Rust-owned library index in the application data directory.
- Copy only explicitly imported media into an application-private media directory.
- Use stable content-derived track identity so repeated imports are idempotent rather than creating duplicates.
- Write imports transactionally through a temporary file and atomic commit where supported.
- Keep browser/Pages behavior unchanged and make native-library capability progressive enhancement.
- Expose only narrow Tauri commands needed to import, list, resolve, and remove library entries.
- Keep format admission and playback compatibility claims separate: admitting/importing a file does not promise that every WebView decodes it.

### Slice 1B — Persistent-library UI

- Add a native-only Library surface listing persisted tracks after restart.
- Allow adding a library track to the visible queue, playing it now, or removing the imported copy.
- Keep metadata/artwork compatible with the existing queue model.
- Add search/filter once the persistent library is established.

### Slice 1C — Scale and integrity

- Add bounded/chunked import so large files are not copied through one unbounded IPC payload.
- Recover safely from interrupted imports and stale temporary files.
- Detect missing/corrupt entries without damaging the rest of the library.
- Add deterministic migration tests for future library-index versions.

## Priority 2 — Background and lock-screen playback

Goal: make installed Android/iOS builds behave like real mobile music players when the app is backgrounded or the display is locked.

- Test the existing WebView playback path first; do not add a second playback engine pre-emptively.
- Configure the narrow Android/iOS host capabilities needed for background audio and system media controls.
- Keep queue/current-track authority in Media Player.
- Integrate lock-screen/notification/Control Center transport and metadata where the platform requires native host participation.
- Introduce a `PlaybackBackend` boundary only if real-device evidence shows WebView playback cannot satisfy the required lifecycle semantics.
- Preserve hosted-web behavior as a fallback-capable portable player.

## Priority 3 — Expanded physical-device lifecycle acceptance

Extend issue #4 beyond basic audible playback. Real Android and iOS acceptance should cover:

- lock-screen playback
- app background/foreground transitions
- process suspension/resume where observable
- incoming-call and other audio interruptions
- audio-focus loss/gain
- Bluetooth connect/disconnect and route changes
- wired-headphone removal where supported
- notification/lock-screen play, pause, previous, and next
- seeking after background/resume
- app relaunch with persisted library/state
- graceful decode failure and unsupported-codec fallback

CI packaging remains build evidence, not audible or lifecycle evidence.

## Priority 4 — Persist useful playback state

After stable native track identities exist:

- persist the visible queue by stable track ID
- persist current track and bounded playback position
- restore volume, playback speed, shuffle/Auto-DJ policy, and recent-history inputs
- make state writes transactional/idempotent so crashes cannot corrupt the library
- never autoplay unexpectedly on application launch; restore state without starting audio until platform/user policy permits it

## Priority 5 — Mobile information architecture

Evolve the narrow-screen UI into clear mobile surfaces without forking the underlying product model:

- Library
- Now Playing
- Queue

Add a persistent mini-player for navigation between surfaces. Keep URL/query state meaningful on the hosted build where practical. Do not make drag gestures the only queue-editing mechanism; retain explicit touch-friendly move controls.

## Priority 6 — Mobile-aware Auto-DJ and shared analysis

Build issue #8 on shared `audio-analysis` rather than duplicating DSP in this repository.

- cache analysis by stable content fingerprint plus `audio-analysis` version/provenance
- analyze upcoming tracks lazily instead of scanning a whole library at launch
- bound worker/WASM concurrency for CPU, thermals, memory, and battery
- cancel analysis when work is no longer relevant
- use confidence-aware fallbacks to ordinary queue playback
- keep the chosen next track visible before playback
- add audible crossfade/transition acceptance on real devices

## Priority 7 — OS file handoff and import intents

Make local-file use feel native:

- accept audio opened/shared from Files/Downloads and compatible Android/iOS document providers
- offer explicit actions such as Play now, Add next, or Import to Library
- reuse the same stable import path as the library rather than creating a second ingestion implementation
- do not request broad storage permissions merely for convenience

## Priority 8 — Accessibility and mobile ergonomics acceptance

Treat accessibility as a release gate rather than cosmetic polish:

- VoiceOver and TalkBack labels/navigation
- system text-size / dynamic-type resilience
- meaningful names and states for transport, queue, shuffle, and Auto-DJ controls
- usable seek/volume controls with assistive technology
- contrast and visible focus
- portrait and landscape layouts
- safe areas and one-handed reachability
- minimum coarse-pointer targets retained across every new surface

## Recommended implementation order

1. Persistent native music library
2. Background/lock-screen playback
3. Expanded real-device lifecycle acceptance
4. Persisted queue/current-track/playback state
5. Library / Now Playing / Queue mobile surfaces
6. Mobile-aware beat/key Auto-DJ using shared `audio-analysis`
7. OS Open With / Share / import integration
8. Accessibility and mobile ergonomics acceptance hardening

The order intentionally puts mobile correctness, persistence, and lifecycle behavior ahead of more sophisticated Auto-DJ features.