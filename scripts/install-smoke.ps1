[CmdletBinding()]
param(
  [string]$ArtifactsDirectory = "artifacts",
  [string]$PreviousInstaller = "",
  [string]$InstallRoot = "",
  [string]$ReportPath = "work/windows-install-verification.json",
  [string]$ExpectedSignerSubject = "",
  [switch]$RequireSignature,
  [switch]$AllowLocalMachineChanges
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $env:CI -and -not $AllowLocalMachineChanges) {
  throw "Installer smoke tests change the current user's install registry. Run in CI or pass -AllowLocalMachineChanges explicitly."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw |
  ConvertFrom-Json
$version = [string]$package.version
if ($RequireSignature -and [string]::IsNullOrWhiteSpace($ExpectedSignerSubject)) {
  throw "ExpectedSignerSubject is required when Authenticode signatures are required."
}
$currentInstaller = Join-Path $projectRoot "$ArtifactsDirectory/Codex-Gesture-Dock-$version-setup.exe"
if (-not (Test-Path -LiteralPath $currentInstaller -PathType Leaf)) {
  throw "Current installer is missing: $currentInstaller"
}

if (-not $InstallRoot) {
  if (-not $env:RUNNER_TEMP) {
    throw "RUNNER_TEMP is required unless -InstallRoot is supplied."
  }
  $InstallRoot = Join-Path $env:RUNNER_TEMP "CodexGestureDockInstall"
}
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)

if ($env:CI -and $env:RUNNER_TEMP) {
  $runnerTemp = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd("\", "/")
  if (-not $InstallRoot.StartsWith("$runnerTemp\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "CI install root must stay below RUNNER_TEMP: $InstallRoot"
  }
}

$installedExecutable = Join-Path $InstallRoot "Codex Gesture Dock.exe"
$uninstaller = Join-Path $InstallRoot "Uninstall Codex Gesture Dock.exe"
$uninstallRegistryRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
$upgradeTested = $false
$previousVersion = ""

function Invoke-Installer {
  param([string]$Installer)
  $process = Start-Process `
    -FilePath $Installer `
    -ArgumentList @("/S", "/D=$InstallRoot") `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  if ($process.ExitCode -ne 0) {
    throw "$(Split-Path -Leaf $Installer) exited with code $($process.ExitCode)."
  }
  if (-not (Test-Path -LiteralPath $installedExecutable -PathType Leaf)) {
    throw "Installer did not create the expected executable: $installedExecutable"
  }
}

function Get-UninstallEntry {
  Get-ChildItem -LiteralPath $uninstallRegistryRoot -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } |
    Where-Object {
      $_.DisplayName -like "Codex Gesture Dock*" -and
      $_.UninstallString -like "*$([IO.Path]::GetFileName($uninstaller))*"
    } |
    Select-Object -First 1
}

try {
  if ($PreviousInstaller -and (Test-Path -LiteralPath $PreviousInstaller -PathType Leaf)) {
    $previousInfo = Get-Item -LiteralPath $PreviousInstaller
    $previousVersion = [string]$previousInfo.VersionInfo.ProductVersion
    if ($previousVersion -and ([version]$previousVersion -lt [version]$version)) {
      Invoke-Installer -Installer $previousInfo.FullName
      $installedPrevious = (Get-Item -LiteralPath $installedExecutable).VersionInfo.ProductVersion
      if ([version]$installedPrevious -ne [version]$previousVersion) {
        throw "Previous installer produced version $installedPrevious instead of $previousVersion."
      }
      $upgradeTested = $true
    }
  }

  Invoke-Installer -Installer $currentInstaller

  $installedInfo = Get-Item -LiteralPath $installedExecutable
  if ([version]$installedInfo.VersionInfo.ProductVersion -ne [version]$version) {
    throw "Installed executable version does not match package.json."
  }
  if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
    throw "NSIS uninstaller is missing: $uninstaller"
  }

  $uninstallEntry = Get-UninstallEntry
  if (-not $uninstallEntry) {
    throw "The current-user uninstall registry entry was not created."
  }
  if ([version]$uninstallEntry.DisplayVersion -ne [version]$version) {
    throw "Uninstall registry version does not match package.json."
  }

  $installedSignature = Get-AuthenticodeSignature -LiteralPath $installedExecutable
  $uninstallerSignature = Get-AuthenticodeSignature -LiteralPath $uninstaller
  if ($RequireSignature) {
    foreach ($signatureResult in @(
      @{ Name = "installed executable"; Signature = $installedSignature },
      @{ Name = "uninstaller"; Signature = $uninstallerSignature }
    )) {
      if ($signatureResult.Signature.Status -ne "Valid") {
        throw "$($signatureResult.Name) has invalid Authenticode status: $($signatureResult.Signature.Status)"
      }
      if (
        -not $signatureResult.Signature.SignerCertificate -or
        $signatureResult.Signature.SignerCertificate.Subject -ne $ExpectedSignerSubject
      ) {
        throw "$($signatureResult.Name) does not match the expected signer subject."
      }
      if (-not $signatureResult.Signature.TimeStamperCertificate) {
        throw "$($signatureResult.Name) has no trusted Authenticode timestamp certificate."
      }
    }
  }

  & (Join-Path $PSScriptRoot "smoke-packaged.ps1") -ExecutablePath $installedExecutable

  $uninstallProcess = Start-Process `
    -FilePath $uninstaller `
    -ArgumentList @("/currentuser", "/S") `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  if ($uninstallProcess.ExitCode -ne 0) {
    throw "Silent uninstall exited with code $($uninstallProcess.ExitCode)."
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while ([DateTime]::UtcNow -lt $deadline) {
    $executableRemains = Test-Path -LiteralPath $installedExecutable -PathType Leaf
    $registryEntryRemains = $null -ne (Get-UninstallEntry)
    if (-not $executableRemains -and -not $registryEntryRemains) {
      break
    }
    Start-Sleep -Milliseconds 250
  }
  if (Test-Path -LiteralPath $installedExecutable -PathType Leaf) {
    throw "Installed executable remains after silent uninstall."
  }
  if (Get-UninstallEntry) {
    throw "Uninstall registry entry remains after silent uninstall."
  }

  $result = [ordered]@{
    version = $version
    previousVersion = $previousVersion
    upgradeTested = $upgradeTested
    installRoot = $InstallRoot
    installedExecutableSignature = [string]$installedSignature.Status
    uninstallerSignature = [string]$uninstallerSignature.Status
    signerSubject = if ($installedSignature.SignerCertificate) {
      $installedSignature.SignerCertificate.Subject
    } else {
      ""
    }
    timestampSigner = if ($installedSignature.TimeStamperCertificate) {
      $installedSignature.TimeStamperCertificate.Subject
    } else {
      ""
    }
    smokePassed = $true
    uninstallPassed = $true
    verifiedAt = [DateTime]::UtcNow.ToString("o")
  }

  $absoluteReportPath = if ([IO.Path]::IsPathRooted($ReportPath)) {
    $ReportPath
  } else {
    Join-Path $projectRoot $ReportPath
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $absoluteReportPath) -Force |
    Out-Null
  $result | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath $absoluteReportPath -Encoding utf8
  Write-Host "Windows install, packaged smoke, and uninstall verification passed."
} finally {
  if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
    Start-Process `
      -FilePath $uninstaller `
      -ArgumentList @("/currentuser", "/S") `
      -WindowStyle Hidden `
      -Wait `
      -ErrorAction SilentlyContinue
  }
}
