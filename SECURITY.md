# Security Policy

## Supported versions

Security fixes are provided for the newest published release. Users should
install updates promptly and should not continue using an older portable build
after a newer signed installer is available.

## Reporting a vulnerability

Please use GitHub's private security-advisory reporting flow for this repository
when it is available. If private reporting is unavailable, open a minimal issue
that asks the maintainers for a private contact channel.

Do not include exploit code, camera images, Codex task content, local file
paths, access tokens, signing material, or Windows audit logs in a public issue.
Include the affected version, Windows version, impact, and the smallest safe
reproduction description.

The project will acknowledge a complete report, investigate it, and coordinate
a fix and disclosure. Exact response times are not guaranteed because this is a
community-maintained project.

## Release security

Production releases must come from the repository's tagged GitHub Actions
workflow. The workflow fails before publication if Windows signing credentials
are absent or if the setup and portable executables do not have valid
Authenticode signatures. Release metadata, checksums, version sources, and tags
must agree.

Self-signed builds and locally modified binaries are not official releases.
