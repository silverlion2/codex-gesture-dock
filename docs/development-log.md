# Development Log

This log records major implementation milestones after the `v0.5.0` release.
It complements the user-facing [changelog](../CHANGELOG.md): the changelog groups
notable behavior by release, while this file preserves the sequence, commit, and
verification evidence of development work.

## 2026-08-16 — Local visual and OCR expansion

Commit: [`05892ff`](https://github.com/silverlion2/codex-gesture-dock/commit/05892ff1cda7f97dbe06ef57bf49b0fd70cb945a)

- Added local QR creation, screenshot beautification, chroma keying, signature/
  ink extraction, sticker outlines, and color-vision simulation.
- Expanded document OCR with selectable English/Simplified Chinese/Traditional
  Chinese languages, cross-page search, quality and sensitive-page navigation,
  word corrections, conservative table extraction, and searchable scanned PDF.
- Added single- and multi-page layout exports in schema v1 JSON, formula-safe
  CSV, hOCR 1.2, and ALTO 4.4, including page order and source provenance.
- Added an offline Noto Sans SC font and license notice for mixed Chinese/English
  searchable PDF text layers.
- Updated architecture, product, privacy, testing, workspace, and license docs.

Verification at handoff:

- 83 Vitest files and 322 application tests passed.
- 4 release-script tests passed.
- TypeScript production build passed with 2,241 modules transformed.
- Third-party notices passed for 74 production components.
- Version and staged-diff checks passed.

## 2026-08-13 — Expression masks and image tools

Commit: [`ff59f05`](https://github.com/silverlion2/codex-gesture-dock/commit/ff59f05)

- Added expression-responsive camera masks.
- Expanded the local image-analysis and editing workspace.
- Continued runtime isolation so OCR/image tools do not preload unrelated live
  camera inference packages.

## 2026-08-11 — Camera and document tools

Commit: [`44079c0`](https://github.com/silverlion2/codex-gesture-dock/commit/44079c0)

- Expanded QR/barcode, document-scanning, OCR, privacy, background, object, and
  image-analysis workflows.
- Strengthened bounded input handling and explicit export/review behavior.

## 2026-08-08 — Camera workspace redesign

Commits:

- [`5aa31da`](https://github.com/silverlion2/codex-gesture-dock/commit/5aa31da)
  redesigned the camera workspace and tool navigation.
- [`af4b5b3`](https://github.com/silverlion2/codex-gesture-dock/commit/af4b5b3)
  expanded camera tools and hardened the desktop release path.
- [`0ee9f51`](https://github.com/silverlion2/codex-gesture-dock/commit/0ee9f51)
  added Vercel deployment configuration for the web surface.

## 2026-07-22 — Version 0.5.0 baseline

Tag: [`v0.5.0`](https://github.com/silverlion2/codex-gesture-dock/releases/tag/v0.5.0)

- Established the Codex App Server integration, verified Windows control core,
  Windows gesture mode, UI Automation inspection boundary, audit logging,
  installer/portable packaging, and auto-update release design documented in
  the `0.5.0` changelog.
- Added the public Authenticode signing policy and a fail-closed production
  release boundary.

## Logging rules

Future entries should include the date, commit or release link, user-visible
outcome, important architecture/privacy decisions, and verification evidence.
Do not place tokens, user files, OCR text, task content, or other private runtime
data in this log.
