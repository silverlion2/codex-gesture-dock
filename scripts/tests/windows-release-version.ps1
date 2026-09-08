$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "../windows-release-version.ps1")

if (-not (Test-ReleaseVersionMatch -Actual "0.5.0.0" -Expected "0.5.0")) {
  throw "A zero Windows file-version revision must match the package semver."
}
if (Test-ReleaseVersionMatch -Actual "0.5.1.0" -Expected "0.5.0") {
  throw "A different patch version must not match."
}
foreach ($invalid in @("0.5", "0.5.0.1", "not-a-version")) {
  try {
    ConvertTo-ReleaseVersion -Value $invalid | Out-Null
  } catch {
    continue
  }
  throw "Invalid or non-zero revision version was accepted: $invalid"
}

Write-Host "Windows release version compatibility tests passed."
