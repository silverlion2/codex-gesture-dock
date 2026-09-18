[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version.' }
if ($env:GITHUB_SHA -notmatch '^[a-f0-9]{40}$') { throw 'A GitHub build commit is required.' }
if ($env:GITHUB_RUN_ID -notmatch '^\d+$') { throw 'A GitHub workflow run is required.' }
$artifactRoot = Join-Path $projectRoot 'artifacts'
$previewRoot = Join-Path $artifactRoot 'preview'
if (Test-Path -LiteralPath $previewRoot) { throw 'Refusing to overwrite an existing preview bundle.' }
$sourceManifest = Get-Content (Join-Path $artifactRoot 'release-assets.json') -Raw | ConvertFrom-Json
if ($sourceManifest.version -ne $version) { throw 'Source manifest version mismatch.' }
$names = @("Codex-Gesture-Dock-$version-setup.exe", "Codex-Gesture-Dock-$version-portable.exe", 'sbom.cdx.json')
$assets = foreach ($name in $names) {
  $file = Get-Item -LiteralPath (Join-Path $artifactRoot $name)
  if ($file.Length -le 0) { throw "Empty preview asset: $name" }
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $expected = @($sourceManifest.assets | Where-Object { $_.name -eq $name })
  if ($expected.Count -ne 1 -or $expected[0].sha256 -ne $hash -or $expected[0].size -ne $file.Length) {
    throw "Preview asset does not match verified build: $name"
  }
  [ordered]@{ name = $name; size = $file.Length; sha256 = $hash }
}
New-Item -ItemType Directory -Path $previewRoot | Out-Null
foreach ($name in $names) {
  Copy-Item -LiteralPath (Join-Path $artifactRoot $name) -Destination (Join-Path $previewRoot $name)
}
$manifest = [ordered]@{
  schemaVersion = 1
  version = $version
  tag = "preview/v$version"
  commit = $env:GITHUB_SHA
  buildRun = "https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID"
  unsigned = $true
  manualDownloadOnly = $true
  assets = @($assets)
}
$manifestPath = Join-Path $previewRoot 'preview-release.json'
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
$checksumNames = @($names) + 'preview-release.json'
$checksums = foreach ($name in $checksumNames) {
  $hash = (Get-FileHash -LiteralPath (Join-Path $previewRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $name"
}
$checksums | Set-Content -LiteralPath (Join-Path $previewRoot 'SHA256SUMS.txt') -Encoding ascii
Write-Output "Prepared five unsigned preview files for $($manifest.tag); no updater feed or blockmap."
