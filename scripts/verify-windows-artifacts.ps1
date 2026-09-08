[CmdletBinding()]
param(
  [string]$ArtifactsDirectory = "artifacts",
  [string]$ReportPath = "work/windows-artifact-verification.json",
  [string]$ExpectedSignerSubject = "",
  [switch]$RequireSignature
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifactsRoot = Join-Path $projectRoot $ArtifactsDirectory
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw |
  ConvertFrom-Json
$version = [string]$package.version
if ($RequireSignature -and [string]::IsNullOrWhiteSpace($ExpectedSignerSubject)) {
  throw "ExpectedSignerSubject is required when Authenticode signatures are required."
}

function Get-IsolatedAuthenticodeSignature {
  param([string]$Path)
  $windowsPowerShell = Join-Path $env:SystemRoot "System32/WindowsPowerShell/v1.0/powershell.exe"
  if (-not (Test-Path -LiteralPath $windowsPowerShell -PathType Leaf)) {
    throw "System Windows PowerShell is required for Authenticode verification."
  }
$childScript = @'
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$env:PSModulePath = Join-Path $PSHOME "Modules"
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
$signature = Get-AuthenticodeSignature -LiteralPath $env:CODEX_SIGNATURE_TARGET
[ordered]@{
  status = [string]$signature.Status
  signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { "" }
  timestampSigner = if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { "" }
} | ConvertTo-Json -Compress
'@
  $encodedScript = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($childScript))
  $previousTarget = $env:CODEX_SIGNATURE_TARGET
  try {
    $env:CODEX_SIGNATURE_TARGET = $Path
    $raw = & $windowsPowerShell `
      -NoLogo `
      -NoProfile `
      -NonInteractive `
      -ExecutionPolicy Bypass `
      -EncodedCommand $encodedScript
    if ($LASTEXITCODE -ne 0) {
      throw "Isolated Authenticode verification failed for: $Path"
    }
    return (($raw | Out-String).Trim() | ConvertFrom-Json)
  } finally {
    $env:CODEX_SIGNATURE_TARGET = $previousTarget
  }
}

$setup = Join-Path $artifactsRoot "Codex-Gesture-Dock-$version-setup.exe"
$portable = Join-Path $artifactsRoot "Codex-Gesture-Dock-$version-portable.exe"
$blockmap = "$setup.blockmap"
$latestPath = Join-Path $artifactsRoot "latest.yml"
$checksumsPath = Join-Path $artifactsRoot "SHA256SUMS.txt"
$releaseManifestPath = Join-Path $artifactsRoot "release-assets.json"
$unpacked = Join-Path $artifactsRoot "win-unpacked/Codex Gesture Dock.exe"
$asarPath = Join-Path $artifactsRoot "win-unpacked/resources/app.asar"

foreach ($requiredPath in @(
  $setup,
  $portable,
  $blockmap,
  $latestPath,
  $checksumsPath,
  $releaseManifestPath,
  $unpacked,
  $asarPath
)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required Windows artifact is missing: $requiredPath"
  }
}

$expectedVersionedArtifacts = @(
  (Split-Path -Leaf $setup),
  (Split-Path -Leaf $portable),
  (Split-Path -Leaf $blockmap)
)
$unexpectedVersionedArtifacts = @(
  Get-ChildItem -LiteralPath $artifactsRoot -File -Filter "Codex-Gesture-Dock-*" |
    Where-Object { $_.Name -notin $expectedVersionedArtifacts }
)
if ($unexpectedVersionedArtifacts.Count -gt 0) {
  $unexpectedNames = $unexpectedVersionedArtifacts.Name -join ", "
  throw "Stale or unexpected versioned artifacts are present: $unexpectedNames"
}

$latest = Get-Content -LiteralPath $latestPath -Raw
$latestFile = [regex]::Match($latest, "(?m)^path:\s*(\S+)\s*$").Groups[1].Value
$expectedSizeText = [regex]::Match($latest, "(?m)^\s*size:\s*(\d+)\s*$").Groups[1].Value
$expectedSha512 = [regex]::Match($latest, "(?m)^\s*sha512:\s*(\S+)\s*$").Groups[1].Value
if (-not $latestFile -or -not $expectedSizeText -or -not $expectedSha512) {
  throw "latest.yml is missing path, size, or SHA-512 metadata."
}
if ($latestFile -ne (Split-Path -Leaf $setup)) {
  throw "latest.yml points to '$latestFile' instead of the signed setup executable."
}

$setupInfo = Get-Item -LiteralPath $setup
$expectedSize = [int64]$expectedSizeText
$sha512 = [Security.Cryptography.SHA512]::Create()
$stream = [IO.File]::OpenRead($setup)
try {
  $actualSha512 = [Convert]::ToBase64String($sha512.ComputeHash($stream))
} finally {
  $stream.Dispose()
  $sha512.Dispose()
}
if ($setupInfo.Length -ne $expectedSize) {
  throw "latest.yml size does not match the setup executable."
}
if ($actualSha512 -ne $expectedSha512) {
  throw "latest.yml SHA-512 does not match the setup executable."
}

$releaseManifest = Get-Content -LiteralPath $releaseManifestPath -Raw |
  ConvertFrom-Json
$expectedPrimaryAssets = @(
  (Split-Path -Leaf $setup),
  (Split-Path -Leaf $portable),
  (Split-Path -Leaf $blockmap),
  "latest.yml",
  "sbom.cdx.json"
)
$expectedPublishFiles = @(
  $expectedPrimaryAssets + @("SHA256SUMS.txt", "release-assets.json")
)
if (
  $releaseManifest.schemaVersion -ne 1 -or
  $releaseManifest.version -ne $version
) {
  throw "Release asset manifest schema or version does not match package.json."
}
$manifestAssetNames = @($releaseManifest.assets | ForEach-Object { [string]$_.name })
$manifestPublishFiles = @($releaseManifest.publishFiles | ForEach-Object { [string]$_ })
if (@(Compare-Object $expectedPrimaryAssets $manifestAssetNames).Count -gt 0) {
  throw "Release asset manifest primary asset allowlist is incomplete or unexpected."
}
if (@(Compare-Object $expectedPublishFiles $manifestPublishFiles).Count -gt 0) {
  throw "Release asset manifest publish allowlist is incomplete or unexpected."
}

$checksumLines = @(Get-Content -LiteralPath $checksumsPath)
if ($checksumLines.Count -ne $expectedPrimaryAssets.Count) {
  throw "SHA256SUMS.txt does not contain the exact primary asset count."
}
function Get-Sha256Hex {
  param([string]$Path)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  $inputStream = [IO.File]::OpenRead($Path)
  try {
    return ([BitConverter]::ToString($algorithm.ComputeHash($inputStream))).Replace("-", "").ToLowerInvariant()
  } finally {
    $inputStream.Dispose()
    $algorithm.Dispose()
  }
}
foreach ($asset in @($releaseManifest.assets)) {
  $assetPath = Join-Path $artifactsRoot ([string]$asset.name)
  $item = Get-Item -LiteralPath $assetPath
  $actualSha256 = Get-Sha256Hex -Path $assetPath
  if ($item.Length -ne [int64]$asset.size -or $actualSha256 -ne [string]$asset.sha256) {
    throw "Release asset manifest digest or size mismatch: $($asset.name)"
  }
  $expectedChecksumLine = "$actualSha256  $($asset.name)"
  if ($checksumLines -notcontains $expectedChecksumLine) {
    throw "SHA256SUMS.txt is missing the exact digest for $($asset.name)."
  }
}

$executables = @($setup, $portable, $unpacked)
$signatureResults = foreach ($executable in $executables) {
  $item = Get-Item -LiteralPath $executable
  $signature = Get-IsolatedAuthenticodeSignature -Path $executable
  if ($RequireSignature -and $signature.status -ne "Valid") {
    throw "$($item.Name) has invalid Authenticode status: $($signature.status)"
  }
  if ($RequireSignature -and -not $signature.signer) {
    throw "$($item.Name) has no signer certificate."
  }
  if (
    $RequireSignature -and
    $signature.signer -ne $ExpectedSignerSubject
  ) {
    throw "$($item.Name) has an unexpected signer subject: $($signature.signer)"
  }
  if ($RequireSignature -and -not $signature.timestampSigner) {
    throw "$($item.Name) has no trusted Authenticode timestamp certificate."
  }
  [ordered]@{
    name = $item.Name
    version = $item.VersionInfo.ProductVersion
    status = [string]$signature.status
    signer = [string]$signature.signer
    timestampSigner = [string]$signature.timestampSigner
  }
}

$fuseOutput = (& npx.cmd --no-install "@electron/fuses" read --app $unpacked 2>&1 |
  Out-String)
$requiredFuseLines = @(
  "RunAsNode is Disabled",
  "EnableCookieEncryption is Enabled",
  "EnableNodeOptionsEnvironmentVariable is Disabled",
  "EnableNodeCliInspectArguments is Disabled",
  "EnableEmbeddedAsarIntegrityValidation is Enabled",
  "OnlyLoadAppFromAsar is Enabled",
  "GrantFileProtocolExtraPrivileges is Disabled"
)
foreach ($line in $requiredFuseLines) {
  if (-not $fuseOutput.Contains($line)) {
    throw "Packaged Electron fuse verification failed: '$line' was not found."
  }
}

$asarEntries = @(& npx.cmd --no-install asar list $asarPath)
$requiredAsarEntries = @(
  "\PRIVACY.md",
  "\SECURITY.md",
  "\THIRD_PARTY_NOTICES.md",
  "\docs\user-guide-zh.md",
  "\docs\code-signing-policy.md",
  "\third_party_licenses\npm-production-licenses.txt"
)
foreach ($entry in $requiredAsarEntries) {
  if ($asarEntries -notcontains $entry) {
    throw "Required compliance file is missing from app.asar: $entry"
  }
}

$result = [ordered]@{
  version = $version
  requireSignature = [bool]$RequireSignature
  expectedSignerSubject = $ExpectedSignerSubject
  latestYml = [ordered]@{
    file = $latestFile
    sizeMatches = $true
    sha512Matches = $true
  }
  releaseEvidence = [ordered]@{
    manifest = "release-assets.json"
    checksums = "SHA256SUMS.txt"
    assetCount = $manifestAssetNames.Count
    publishFileCount = $manifestPublishFiles.Count
  }
  signatures = $signatureResults
  fuses = $requiredFuseLines
  complianceFiles = $requiredAsarEntries
  verifiedAt = [DateTime]::UtcNow.ToString("o")
}

$absoluteReportPath = if ([IO.Path]::IsPathRooted($ReportPath)) {
  $ReportPath
} else {
  Join-Path $projectRoot $ReportPath
}
New-Item -ItemType Directory -Path (Split-Path -Parent $absoluteReportPath) -Force |
  Out-Null
$result | ConvertTo-Json -Depth 6 |
  Set-Content -LiteralPath $absoluteReportPath -Encoding utf8

Write-Host "Windows artifacts verified for Codex Gesture Dock $version."
if (-not $RequireSignature) {
  Write-Host "Authenticode was inspected but not required for this non-release build."
}
