# Development Log

This log records major implementation milestones after the `v0.5.0` release.
It complements the user-facing [changelog](../CHANGELOG.md): the changelog groups
notable behavior by release, while this file preserves the sequence, commit, and
verification evidence of development work.

## 2026-09-09 — Canonical Windows release asset evidence

Commits:

- [`549340d`](https://github.com/silverlion2/codex-gesture-dock/commit/549340d)
  added canonical release asset evidence.
- [`a1fe39c`](https://github.com/silverlion2/codex-gesture-dock/commit/a1fe39c)
  documented and wired that evidence into the guarded workflows.
- [`09a9558`](https://github.com/silverlion2/codex-gesture-dock/commit/09a9558)
  fixed Windows three/four-part release version comparison.

- Added one canonical allowlist for the five primary Windows release assets and
  seven publish files, with deterministic SHA-256 checksums and a versioned JSON
  manifest consumed by CI, provenance, verification, and publishing.
- Made evidence generation fail before writes when assets are missing, empty,
  stale, or inconsistent with the setup path, size, and SHA-512 in `latest.yml`;
  regression coverage confirms prior evidence remains intact after validation
  failure.
- Isolated Authenticode inspection in system Windows PowerShell with a
  runtime-local module path. Verification succeeds with a deliberately polluted
  caller `PSModulePath`, while unsigned local binaries remain `NotSigned` rather
  than being reported as release-ready.
- Kept signing, a real N→N+1 upgrade, signed auto-update, protected refs,
  multi-display/DPI, camera hardware, production install, and public publishing
  as explicit open gates.

Verification at handoff:

- 333 renderer/hook/library tests, 54 Electron tests, and 10 release helper
  tests passed; ESLint, TypeScript, Vite production build, 5 Edge accessibility
  journeys, version sync, 73-component notice consistency, and npm audit passed.
- A clean Windows package produced setup, portable, blockmap, `latest.yml`, and
  a 58-component CycloneDX SBOM. The canonical manifest and checksum verifier
  passed under a polluted module path.
- Packaged collapsed and expanded/task smoke checks passed. The collapsed path
  measured 463 ms, 4 processes, and 118.1 MB private memory; the expanded/task
  path measured 2.374 s, 7 processes, and 203.6 MB private memory, both within
  their existing budgets.
- The [first CI run on `a1fe39c`](https://github.com/silverlion2/codex-gesture-dock/actions/runs/34275961541)
  failed only in isolated install verification: Windows reported the installed
  file version as `0.5.0.0`, while the script compared it literally with package
  version `0.5.0`. Security passed, and the remaining CI build, package, SBOM,
  evidence, verifier, and packaged-smoke steps passed.
- `09a9558` added a tested normalizer that accepts a missing or zero fourth
  Windows version component and rejects non-zero revisions. The exact candidate
  `09a9558ddd03c0feb28b818044f6c12c04d03f01` then passed
  [CI 34276985953](https://github.com/silverlion2/codex-gesture-dock/actions/runs/34276985953)
  and [Security 34276985697](https://github.com/silverlion2/codex-gesture-dock/actions/runs/34276985697),
  including isolated current-user v0.5.0-to-v0.6.0 install, upgrade, launch,
  silent uninstall, and registry cleanup. This is unsigned CI lifecycle
  evidence; it does not satisfy Authenticode, a signed N→N+1 update, or a
  production Release gate.
- `web-sop check --mode fast` passed. The post-push commercial audit reported
  exactly 9 blockers; no signing identity, tag, Release, deployment, or external
  message was created.

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
