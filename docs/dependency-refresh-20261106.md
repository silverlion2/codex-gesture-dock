# Dependency refresh — 2026-11-06

## Scope and decisions

The previous QR candidate passes functional checks but its unchanged lockfile has 26 npm audit entries, including one critical production DOMPurify entry. Refresh the audited dependency graph, preserve application behavior and the current Electron major, and validate the actual consumers of any necessary transitive override. Do not force npm's suggested builder/parser downgrades simply to obtain a clean report.

Use the official npm registry for the update and audit. Begin with semver-compatible fixes without lifecycle scripts, then inspect the remaining graph. Any cross-major transitive override must be narrow and accompanied by consumer-level validation. Regenerate third-party notices from the final installed graph and verify a clean lockfile installation. Existing QR, document/PDF and desktop boundary tests remain required, along with lint, TypeScript, build, browser accessibility and SOP fast checks.

This maintenance changes no UI flow, capture defaults, update channel, production release or installed user application. CI may build and exercise installers on isolated hosted runners; local validation must not start real media capture or native desktop control. Existing untracked planning content remains untouched. Record actual final results below before any handoff.

## Resolved graph and consumer checks

- Electron 43.8.7, electron-builder 26.18.1, Vite 8.3.6, Vitest 4.1.12 and typescript-eslint 8.72.1 have explicit minimum versions. DOMPurify resolves to 3.4.17. A fresh resolution also updates existing compatible runtime ranges, including React/React DOM 19.3.1, PDF.js 6.5.438 and ZXing browser 0.2.1/library 0.23.0; no new application feature or dependency major is introduced by these ranges.
- Only minimatch 9 and 10 requests are overridden to 11.0.4. Older callable minimatch 3/5 consumers are preserved. `npm ls minimatch --all` verifies a valid final tree. Initial incremental npm resolution retained a stale nested version; a new lockfile generated from the reviewed manifest and a clean `npm ci` resolved that discrepancy. No global npm setting was changed.
- The default release-script test entry runs three new consumer tests: builder FileMatcher inclusion/exclusion against real fixture files and the actual packaging configuration; universal ASAR single-architecture allowlists against real synthetic archives; and TypeScript project-service allowDefaultProject acceptance/rejection. The macOS-only universal utility receives POSIX-normalized archive enumeration in this portable test, while actual archive I/O and matcher calls remain real. This does not prove native macOS packaging or Mach-O merging.
- Clean install passed. Full and production-only official-registry audits both report zero known entries. This does not eliminate package deprecation notices or prove the absence of vulnerabilities. Remaining deprecated tooling (including ESLint 9 and legacy builder transitive packages) is a separate migration concern.

## Complete license notice

Canvas 1.1.0 includes MIT terms plus a Chromium broken-image attribution in its [upstream LICENSE](https://github.com/Brooooooklyn/canvas/blob/v1.1.0/LICENSE). The installed parent file and retained bundled fallback have SHA-256 `0b8e3b4f0042f33677406344854c1dcce3a2878eb3a3f6baee58c6f5752655ce`. The existing version and content checks remain strict and the x64 platform allowlist is unchanged. The complete additional notice is included in both bundled text and generated production notices; tests check that the Chromium copyright and endorsement condition remain present. The historical fallback filename is preserved. All 73-component notice generation/checks and 14 release-script tests pass.

Electron's npm package does not provide a lifecycle script in this resolved version. Its bundled install.js downloaded the project-local 43.8.7 runtime with its built-in artifact checksums; the binary version file matches the package. No Electron UI, system installation or hardware session was launched.

## Accessible-name regression exposed by the update

Axe 4.14 reported label-content-name mismatches in four browser scenarios: the Windows safety button omitted its visible secondary text, the startup button used a different name from its visible action, and the microphone button omitted its visible status. The controls now derive names from their visible content or include that status alongside the action. The voice startup name also reflects its disabled loading text. This preserves visible layout and capture opt-in behavior. Five component assertions reproduced the mismatch before correction; all 12 focused component/application cases then passed. No Axe rule is disabled.

The Windows safety button explicitly references its complete text with aria-labelledby: its responsive icon-only layout hides that text visually, so relying on unreferenced child content alone would lose the narrow-screen accessible name. Browser verification covers both layouts.

Final SOP fast passed typecheck, lint, 467 Vitest cases plus 14 release-script cases (481 total, no skips), and production build. The library suite includes real PDF generation and PDF.js text extraction, not only mocks. The final installed lockfile contains registry URLs and integrity hashes for every dependency entry; its SHA-256 remained `1b2979022e8b7575745fbd0813f2015f1cb8779aaa0072999131e42039994cb2` after clean installation.

Final browser runs pass all seven scenarios on Windows Edge (32.2s) and bundled Chromium (33.6s), including the previously failing desktop/mobile label checks, QR download/clipboard recovery and keyboard focus. No browser rule is waived. Candidate CI and native Windows package validation remain separate from these local results.
