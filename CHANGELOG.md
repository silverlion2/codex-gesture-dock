# Changelog

All notable changes to Codex Gesture Dock are documented here.

## [Unreleased]

### Added

- A public code-signing policy and a SignPath Foundation onboarding path for
  HSM-backed Authenticode releases without repository-stored private keys.
- Live and file-based QR/barcode scanning, batch result export, and local QR
  creation for text, HTTP(S), Wi-Fi, and vCard payloads.
- Camera/photo/PDF document scanning with page management, perspective repair,
  quality guidance, permanent redaction, multilingual OCR, receipt and MRZ
  extraction, document search, and searchable scanned PDF output.
- File, batch, and business-card OCR with editable vCard data, word-confidence
  review, human corrections, conservative table extraction, and JSON, CSV,
  hOCR 1.2, and ALTO 4.4 layout exports.
- Local image tools for comparison, duplicate discovery, optimization, crop and
  rotation, inspection, annotation, contact sheets, long-image workflows,
  adjustments, batch processing, watermarking, and screenshot beautification.
- Privacy and creative image tools for face redaction, metadata-free export,
  person/background separation, chroma keying, signature/ink extraction,
  sticker outlines, color palettes, WCAG contrast checks, and color-vision
  simulation.
- Expression-responsive face masks and bounded local object detection.
- English and Chinese project descriptions plus a commit-linked development log.
- An opt-in air-pointer mode for index-finger cursor movement, pinch click, and
  open-palm scrolling, guarded by the existing Windows emergency stop.
- Opt-in, session-only local Windows speech control with 19 fixed Chinese or
  English wake-word commands, bounded IPC, rate limits, startup timeout, and
  no free dictation, audio storage, network recognition, or approval actions.

### Changed

- The default test gate now includes every Electron/helper regression suite,
  with separate renderer/unit and Electron-only commands for fast diagnosis.
- Camera, OCR, document, and image runtimes now load on demand through isolated
  local boundaries so unrelated visual inference packages are not preloaded.
- Posture and gesture processing now pause while the page is hidden, lower
  posture sampling in compact/air-pointer use, skip hidden overlay drawing, and
  keep high-frequency pointer coordinates out of React render state.
- Heavy tool panels now use route-level code splitting; minimized or hidden
  views stop invisible scanning, face-mask, and audio-meter work, while posture
  UI and live mask updates use lower bounded refresh rates.
- Product, architecture, privacy, design, testing, workspace, user, and
  third-party-license documentation now cover the expanded visual toolset.

### Fixed

- Require a stable unpinched pointing dwell before air-pointer clicks, fully
  disarm after tracking or visibility loss, and disable native pointer input
  while a Codex approval is visible.
- Back off failed pointer-helper restarts, contain monitor launch failures, and
  pin every desktop helper to the absolute System32 Windows PowerShell path.
- Stop and release the audio-meter track and Web Audio context when the window
  is minimized or hidden; restoring requires an explicit microphone restart.
- Ignore voice-helper output that arrives after the user disables listening.

## [0.5.0] - 2026-07-22

### Added

- Live App Server thread, turn, and item event synchronization.
- Persistent current-task binding with workspace-aware automatic selection.
- App Server and Windows desktop connection diagnostics in the main panel.
- A phased Windows UI Automation control design and security boundary.
- Separate Windows Control Core and Codex program-adapter layers.
- A bounded, read-only UI Automation inspector that redacts content-bearing
  controls and exposes only structural diagnostics.
- Verified Codex MSIX identity checks using package name, publisher, family,
  install path, process, and foreground-window validation.
- Process-scoped live Windows events, persistent emergency stop, and daily
  metadata-only control audit logs.
- A complete Chinese user guide for installation, gestures, task and file
  workflows, approvals, emergency stop, privacy, and troubleshooting.
- An independent Windows gesture mode for show desktop, task view, File
  Explorer, volume up/down, and mute, backed by a fixed system-action allowlist.
- An NSIS installer with GitHub Releases auto-update metadata, background
  download progress, and user-confirmed restart/install.
- A portable build alongside the installable build for manual recovery and
  environments that do not want installation.

### Changed

- Show Codex Adapter, Windows Control Core, and read-only UI Automation as
  independent integration states.
- Let the Codex Adapter own the App Server client lifecycle and expose all
  program-level operations through one adapter boundary.
- Use the verified shortcut backend for Codex semantic actions because the
  current WebView exposes no stable business UI Automation controls.
- Persist the selected Codex/Windows gesture mode and render the matching
  six-action gesture book without hiding the live camera.
- Publish installer, portable executable, blockmap, `latest.yml`, and SHA-256
  checksums from one guarded tag workflow.

### Fixed

- Prefer the newest versioned Codex Desktop runtime instead of an older stable
  CLI path.
- Deliver App Server notifications that were previously discarded because they
  do not contain JSON-RPC response IDs.

## [0.4.0] - 2026-07-21

### Added

- Codex App Server task browsing for recent, completed, and archived work.
- Safe task actions for opening, continuing, summarizing, reviewing, testing,
  fixing, and archiving Codex tasks.
- Command and file-change approval prompts with allow-once and deny controls.
- Context-aware gesture navigation and active-turn steering.
- Local posture monitoring, personal calibration, reminders, and statistics.
- Windows always-on-top Electron dock with collapsed and expanded modes.

### Fixed

- Restrict shortcut delivery to the real Codex desktop process.
- Repair task discovery when the Codex state database is incomplete.
- Prevent stale task-filter responses and conflicting active turns.
- Harden camera cancellation, local storage, media permissions, IPC errors, and
  the custom application protocol.

[0.4.0]: https://github.com/silverlion2/codex-gesture-dock/releases/tag/v0.4.0
[0.5.0]: https://github.com/silverlion2/codex-gesture-dock/releases/tag/v0.5.0
