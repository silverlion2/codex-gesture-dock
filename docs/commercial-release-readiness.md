# Commercial release readiness

Last reviewed: 2026-08-08

This document separates locally verified release engineering from evidence that
can exist only after a signed GitHub release. A production release must not be
described as commercially ready while any blocking item below remains open.

## Verified locally

- 53 application/desktop tests and 4 release-script tests pass.
- ESLint, TypeScript, Vite production build, version consistency, and
  third-party notice consistency pass.
- `npm audit` reports zero known vulnerabilities, and `package-lock.json`
  resolves registry packages through the official npm registry.
- Windows setup, portable, blockmap, and `latest.yml` build successfully from a
  clean `artifacts/` directory. The verifier rejects stale versioned files.
- `latest.yml` setup filename, byte size, and SHA-512 match the generated
  installer.
- Required Electron Fuses, embedded ASAR integrity, privacy/security notices,
  user guide, signing policy, and production license bundle are present.
- Collapsed, expanded, camera, six-gesture guide, task-picker, emergency stop,
  and resume packaged smoke checks pass.
- A read-only live integration smoke check connects to the latest versioned
  Codex App Server runtime and lists recent tasks without printing task titles
  or filesystem paths.
- axe-core reports zero violations, including computed color contrast, across
  the expanded dashboard, file list, task filters, action selection, and
  confirmation views in Chromium. Keyboard state and Escape navigation are
  exposed without relying on color alone.
- React failures show a privacy-preserving recovery view. Electron renderer
  crashes and prolonged unresponsiveness use a tested, rate-limited recovery
  policy instead of leaving an unrecoverable transparent window.
- A CycloneDX SBOM is generated for production dependencies.
- The previous public installer is downloaded and independently matched against
  both its GitHub release-asset digest and published `SHA256SUMS.txt`.
- GitHub Actions are pinned to full commit SHAs. CI and Release reject high
  npm advisories, and the Release workflow rejects tags whose commit is not
  contained in `origin/main` before installing dependencies or reading signing
  configuration. CI, release, CodeQL, dependency review, Dependabot,
  provenance attestation, and immutable release publishing definitions pass
  YAML parsing and actionlint.

## Automated on GitHub after these changes are pushed

- Ubuntu dependency audit, tests, lint, build, version, and license checks.
- Windows clean packaging, artifact/Fuse/compliance verification, and packaged
  UI smoke checks.
- Isolated current-user install, optional previous-to-current upgrade, installed
  app smoke test, silent uninstall, and registry cleanup verification.
- CodeQL and pull-request dependency/license review.
- Signed release verification, SBOM/checksum publication, and GitHub build
  provenance attestation.

## Blocking before a commercial release

- [ ] Protect `main` with a branch ruleset that requires the CI and Security
  checks. As of this review, the public repository has no classic branch
  protection and no repository ruleset.
- [ ] Protect `v*` release tags with an active tag ruleset that restricts tag
  creation and update to release owners. The workflow also checks that the
  tagged commit belongs to `origin/main`; both controls are required.
- [ ] Obtain an approved Authenticode signing identity. Configure
  `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` as GitHub Actions secrets and the
  exact certificate subject as the `WIN_CSC_SUBJECT` repository variable, or
  replace that PFX path with the exact approved HSM signing integration. As of
  this review, the repository has zero Actions secrets and zero Actions
  variables.
- [ ] Push these changes and require the CI and Security workflows to pass on
  the protected `main` branch.
- [ ] Increment the application version above the currently published v0.5.0.
- [ ] Run the tagged Release workflow and confirm setup, portable, installed
  executable, and generated uninstaller all report Authenticode status `Valid`,
  match the expected signer subject, and contain a trusted timestamp.
- [ ] Confirm the installer smoke report records `upgradeTested: true` for a
  real v0.5.0-to-new-version upgrade.
- [ ] Confirm the installed application discovers, downloads, prompts for, and
  completes one signed N-to-N+1 update using the published `latest.yml` and
  blockmap.
- [ ] Verify the public release assets, SHA-256 checksums, CycloneDX SBOM, and
  GitHub provenance attestation from a separate clean Windows user account.

The public v0.5.0 assets are historical unsigned builds and are not evidence for
the signed-release items above.
