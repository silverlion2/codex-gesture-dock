[CmdletBinding()]
param(
  [string]$ArtifactsDirectory = "artifacts",
  [string]$ExecutablePath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw |
  ConvertFrom-Json
$executable = if ($ExecutablePath) {
  [IO.Path]::GetFullPath($ExecutablePath)
} else {
  Join-Path $projectRoot "$ArtifactsDirectory/win-unpacked/Codex Gesture Dock.exe"
}
$workDirectory = Join-Path $projectRoot "work"

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Packaged executable is missing: $executable"
}
New-Item -ItemType Directory -Path $workDirectory -Force | Out-Null

function Invoke-PackagedSmoke {
  param(
    [string]$Argument,
    [string]$ReportName,
    [scriptblock]$Validate
  )

  $reportPath = Join-Path $workDirectory $ReportName
  Remove-Item -LiteralPath $reportPath -ErrorAction SilentlyContinue
  $process = Start-Process `
    -FilePath $executable `
    -ArgumentList $Argument `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -PassThru

  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while (-not (Test-Path -LiteralPath $reportPath) -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 250
  }
  if (-not (Test-Path -LiteralPath $reportPath)) {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    throw "Packaged smoke report was not created: $ReportName"
  }

  $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
  & $Validate $report
  Write-Host "$ReportName passed."
}

Invoke-PackagedSmoke `
  -Argument "--smoke-test" `
  -ReportName "electron-smoke.json" `
  -Validate {
    param($report)
    if (
      $report.passed -ne $true -or
      $report.stage -ne "did-finish-load" -or
      $report.alwaysOnTop -ne $true
    ) {
      throw "Collapsed packaged smoke test failed."
    }
  }

Invoke-PackagedSmoke `
  -Argument "--smoke-test-tasks" `
  -ReportName "electron-task-window-smoke.json" `
  -Validate {
    param($report)
    if (
      $report.passed -ne $true -or
      $report.expanded -ne $true -or
      $report.cameraVisible -ne $true -or
      $report.gestureCount -ne 6 -or
      $report.taskPickerVisible -ne $true -or
      $report.paused -ne $true -or
      $report.actionBlocked -ne $true -or
      $report.windowsActionBlocked -ne $true -or
      $report.resumed -ne $true
    ) {
      throw "Expanded packaged smoke test failed."
    }
    foreach ($screenshot in @($report.dashboardScreenshot, $report.taskPickerScreenshot)) {
      if (
        -not $screenshot -or
        -not (Test-Path -LiteralPath $screenshot -PathType Leaf) -or
        (Get-Item -LiteralPath $screenshot).Length -le 0
      ) {
        throw "Packaged smoke screenshot is missing: $screenshot"
      }
    }
  }

Write-Host "All packaged Windows smoke tests passed."
