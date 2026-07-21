# Changelog

All notable changes to Codex Gesture Dock are documented here.

## [Unreleased]

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
