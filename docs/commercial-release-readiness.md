# Commercial release readiness

Last reviewed: 2026-09-09

This document separates locally verified release engineering from evidence that
can exist only after a signed GitHub release. A production release must not be
described as commercially ready while any blocking item below remains open.

## Verified locally

- 387 application/desktop tests and 10 release-script tests pass.
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
- A canonical release manifest fixes the exact five primary asset names and
  seven publish files. Its generator rejects missing, empty, stale-version, or
  metadata-mismatched inputs before replacing prior evidence; the Windows
  verifier independently checks every recorded size and SHA-256 plus the setup
  path, size, and SHA-512 in `latest.yml`.
- Authenticode inspection runs in an isolated system Windows PowerShell child
  with a runtime-local module path, and passes even when the caller provides a
  mixed or polluted `PSModulePath`. Local candidate binaries remain correctly
  reported as `NotSigned`.
- GitHub Actions are pinned to full commit SHAs. CI and Release reject high
  npm advisories, and the Release workflow rejects tags whose commit is not
  contained in `origin/main` before installing dependencies or reading signing
  configuration. CI, release, CodeQL, dependency review, Dependabot,
  provenance attestation, and immutable release publishing definitions pass
  YAML parsing and actionlint.

## Verified on GitHub for the 0.6.0 candidate

- Exact commit `09a9558ddd03c0feb28b818044f6c12c04d03f01` is present on
  `origin/main`; [CI 34276985953](https://github.com/silverlion2/codex-gesture-dock/actions/runs/34276985953)
  and [Security 34276985697](https://github.com/silverlion2/codex-gesture-dock/actions/runs/34276985697)
  completed successfully for that commit.
- CI passed Ubuntu dependency audit, tests, lint, build, version and license
  checks, plus Windows clean packaging, artifact/Fuse/compliance verification,
  packaged UI smoke, SBOM and canonical release-evidence verification.
- CI also installed the public v0.5.0 installer for the current user, upgraded
  it to the unsigned 0.6.0 candidate, launched it, silently uninstalled it, and
  verified registry cleanup. This closes the isolated unsigned installer
  lifecycle smoke only. It is not evidence of Authenticode validity, a signed
  production N→N+1 upgrade, or a signed updater using a published feed.
- The Release-only signed artifact checks, public SBOM/checksum publication and
  GitHub provenance attestation remain unexecuted because no tag or Release was
  created.

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
- [x] Push the exact candidate to `main` and confirm CI and Security pass for
  that commit. `09a9558ddd03c0feb28b818044f6c12c04d03f01` passed both; protection
  of `main` remains the separate open control above.
- [x] Increment the application version above the currently published v0.5.0;
  the local candidate and synchronized lockfile are at 0.6.0.
- [ ] Run the tagged Release workflow and confirm setup, portable, installed
  executable, and generated uninstaller all report Authenticode status `Valid`,
  match the expected signer subject, and contain a trusted timestamp.
- [ ] Confirm the installer smoke report records `upgradeTested: true` for a
  qualifying production N→N+1 upgrade. CI 34276985953 exercised the unsigned
  v0.5.0-to-v0.6.0 lifecycle, but `readiness:audit` requires a retained passing
  `work/windows-install-verification.json` for the audited candidate and no such
  local report is present. That missing audit input is distinct from both
  Authenticode and signed auto-update verification.
- [ ] Confirm the installed application discovers, downloads, prompts for, and
  completes one signed N-to-N+1 update using the published `latest.yml` and
  blockmap.
- [ ] Verify the public release assets, SHA-256 checksums, CycloneDX SBOM, and
  GitHub provenance attestation from a separate clean Windows user account.

The public v0.5.0 assets are historical unsigned builds and are not evidence for
the signed-release items above.

## Current automated audit result

`npm run readiness:audit` reports exactly **9 blockers** for the post-push
candidate:

1. `wrong-branch` — this worktree is on `codex/release-evidence-060`, although
   its exact HEAD is present on `origin/main`.
2. `missing-secret` — `WIN_CSC_LINK` is not configured.
3. `missing-secret` — `WIN_CSC_KEY_PASSWORD` is not configured.
4. `missing-variable` — `WIN_CSC_SUBJECT` is not configured.
5. `main-not-protected` — `main` has no active branch protection or ruleset.
6. `release-tag-not-protected` — `v*` is not covered by an active tag ruleset.
7. `candidate-not-signed` — candidate executables lack valid timestamped
   Authenticode signatures.
8. `upgrade-not-verified` — the audit has no retained qualifying N→N+1
   install/upgrade/uninstall report at its expected local path.
9. `signed-update-not-verified` — there is no passing signed updater N→N+1
   report.

The broader checklist also retains manual hardware, multi-display/DPI, macOS,
public-release and clean-user verification gates; those are not collapsed into
the nine machine-reported audit codes above.
