# Changelog

All notable changes to Codex Gesture Dock are documented here.

## [Unreleased]

### Added

- Live App Server thread, turn, and item event synchronization.
- Persistent current-task binding with workspace-aware automatic selection.
- App Server and Windows desktop connection diagnostics in the main panel.
- A phased Windows UI Automation control design and security boundary.

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
