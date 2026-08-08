[CmdletBinding()]
param(
  [string]$Repository = $env:GITHUB_REPOSITORY,
  [string]$OutputDirectory = "work/previous-release",
  [switch]$AllowMissing
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $Repository) {
  throw "A GitHub repository in OWNER/REPO form is required."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$absoluteOutputDirectory = if ([IO.Path]::IsPathRooted($OutputDirectory)) {
  [IO.Path]::GetFullPath($OutputDirectory)
} else {
  Join-Path $projectRoot $OutputDirectory
}
New-Item -ItemType Directory -Path $absoluteOutputDirectory -Force | Out-Null

$releaseJson = & gh release view --repo $Repository --json tagName,assets 2>$null
if ($LASTEXITCODE -ne 0 -or -not $releaseJson) {
  if ($AllowMissing) {
    Write-Host "No previous public release is available; upgrade verification will be skipped."
    if ($env:GITHUB_OUTPUT) {
      Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "path=" -Encoding utf8
      Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "tag=" -Encoding utf8
    }
    exit 0
  }
  throw "Unable to resolve the latest public release for $Repository."
}

$release = $releaseJson | ConvertFrom-Json
$installerAsset = @($release.assets) |
  Where-Object { $_.name -match "-setup\.exe$" } |
  Select-Object -First 1
$checksumAsset = @($release.assets) |
  Where-Object { $_.name -eq "SHA256SUMS.txt" } |
  Select-Object -First 1
if (-not $installerAsset -or -not $checksumAsset) {
  throw "Release $($release.tagName) is missing its setup installer or SHA256SUMS.txt."
}
if (-not ([string]$installerAsset.digest).StartsWith("sha256:")) {
  throw "Release $($release.tagName) does not expose a SHA-256 asset digest."
}

& gh release download $release.tagName `
  --repo $Repository `
  --pattern $installerAsset.name `
  --pattern $checksumAsset.name `
  --dir $absoluteOutputDirectory `
  --clobber
if ($LASTEXITCODE -ne 0) {
  throw "Failed to download the previous installer and checksum file."
}

$installerPath = Join-Path $absoluteOutputDirectory $installerAsset.name
$checksumPath = Join-Path $absoluteOutputDirectory $checksumAsset.name
$actualHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$assetHash = ([string]$installerAsset.digest).Substring(7).ToLowerInvariant()
if ($actualHash -ne $assetHash) {
  throw "Downloaded installer does not match GitHub's release-asset digest."
}

$checksumLine = Get-Content -LiteralPath $checksumPath |
  Where-Object { $_ -match "\s+$([regex]::Escape($installerAsset.name))$" } |
  Select-Object -First 1
if (-not $checksumLine) {
  throw "SHA256SUMS.txt does not contain $($installerAsset.name)."
}
$publishedHash = ($checksumLine -split "\s+", 2)[0].ToLowerInvariant()
if ($actualHash -ne $publishedHash) {
  throw "Downloaded installer does not match SHA256SUMS.txt."
}

$report = [ordered]@{
  repository = $Repository
  tag = $release.tagName
  installer = $installerAsset.name
  sha256 = $actualHash
  githubDigestMatches = $true
  checksumFileMatches = $true
  verifiedAt = [DateTime]::UtcNow.ToString("o")
}
$report |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath (Join-Path $absoluteOutputDirectory "verification.json") -Encoding utf8

if ($env:GITHUB_OUTPUT) {
  Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "path=$installerPath" -Encoding utf8
  Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "tag=$($release.tagName)" -Encoding utf8
}
Write-Host "Verified previous installer $($installerAsset.name) from $($release.tagName)."
