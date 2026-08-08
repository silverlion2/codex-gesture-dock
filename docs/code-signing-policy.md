# Code signing policy

Codex Gesture Dock is preparing sponsored Authenticode signing through SignPath Foundation. Planned service disclosure: “Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).” This statement becomes active only after project approval. Until a GitHub Release asset reports a valid Authenticode signature, users must treat that release as unsigned and verify `SHA256SUMS.txt` manually.

## Project and roles

- Source repository: [silverlion2/codex-gesture-dock](https://github.com/silverlion2/codex-gesture-dock)
- Committer and reviewer: [silverlion2](https://github.com/silverlion2)
- Release signing approver: [silverlion2](https://github.com/silverlion2)

All maintainers and signing approvers must enable multi-factor authentication for GitHub and SignPath. Each signing request must originate from the repository's GitHub-hosted release workflow and receive explicit approval; local or manually uploaded binaries are not eligible for project signing.

## Signed scope

Only release artifacts built from this repository may be signed:

- `Codex-Gesture-Dock-<version>-setup.exe`
- `Codex-Gesture-Dock-<version>-portable.exe`
- project-owned executables inside the installer

Third-party binaries retain their upstream signatures and must not be re-signed as Codex Gesture Dock. Product name and version metadata must match `package.json` and the release tag.

## Privacy and system changes

- Camera, posture, and gesture processing remain on the local device.
- The installed application connects to this project's public GitHub Releases to check for updates and connects locally to the user-installed Codex App Server for task integration.
- It does not upload camera frames, body landmarks, task content, or Windows audit logs.
- Windows control audit logs stay on the local device.
- Installation creates per-user program files, Start menu and desktop shortcuts, and an uninstall entry. The NSIS uninstaller removes the installed application; portable users can delete the executable after exit.

More details are in the [Chinese user guide](user-guide-zh.md) and project [README](../README.md).

## Release verification

The release workflow must test and build on GitHub-hosted runners, submit only workflow artifacts for signing, verify an exact configured Authenticode publisher subject and trusted timestamp certificate, regenerate updater blockmaps and `latest.yml` after any post-build signing, and publish checksums, an SBOM, and provenance for the final signed bytes. A signing failure must fail the release rather than silently publish unsigned replacement artifacts.

The repository currently contains a fail-closed PFX integration using `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, and the non-secret expected subject variable `WIN_CSC_SUBJECT`. SignPath HSM approval does not produce a PFX and must not be emulated through those variables. If SignPath is approved, the release workflow must be changed to use the exact issued organization, project, signing-policy, artifact-configuration, and token integration before it is enabled.

## Protected release refs

The `main` branch and every `v*` release tag must be covered by active GitHub
rules. The release workflow rejects a tag whose commit is not contained in
`origin/main`, but repository rules remain the authoritative protection against
an unreviewed tag changing or bypassing its own workflow. Commercial readiness
must remain false when either the branch or candidate tag lacks matching rules.
