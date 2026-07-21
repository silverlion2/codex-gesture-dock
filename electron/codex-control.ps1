param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('quick_chat', 'dictation', 'command_menu', 'review', 'terminal', 'sidebar', 'search_tasks')]
  [string]$Action,

  [switch]$DryRun
)

$shortcuts = @{
  quick_chat   = '^%n'
  dictation    = '^+d'
  command_menu = '^+p'
  review       = '^+g'
  terminal     = '^`'
  sidebar      = '^b'
  search_tasks = '^g'
}

if (-not $PSScriptRoot) { exit 6 }
. (Join-Path $PSScriptRoot 'codex-window-policy.ps1')
$targetIdentity = Get-CodexTargetIdentity

if (-not $targetIdentity) { exit 2 }
$target = $targetIdentity.process
$identity = $targetIdentity.identity
if (-not $identity.verified) { exit 5 }

if ($DryRun) {
  [pscustomobject]@{
    processId = $target.Id
    processName = $target.ProcessName
    windowTitle = $target.MainWindowTitle
    identityVerified = $identity.verified
    identityType = $identity.type
    packageName = $identity.packageName
    packageFamily = $identity.packageFamily
    publisher = $identity.publisher
  } | ConvertTo-Json -Compress
  exit 0
}

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class ForegroundWindowGuard {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@

$automation = New-Object -ComObject WScript.Shell
if (-not $automation.AppActivate([int]$target.Id)) {
  exit 3
}

Start-Sleep -Milliseconds 140
$foregroundProcessId = [uint32]0
$foregroundWindow = [ForegroundWindowGuard]::GetForegroundWindow()
[void][ForegroundWindowGuard]::GetWindowThreadProcessId(
  $foregroundWindow,
  [ref]$foregroundProcessId
)

if ($foregroundProcessId -ne [uint32]$target.Id) {
  exit 4
}

$automation.SendKeys($shortcuts[$Action])
[pscustomobject]@{
  ok = $true
  action = $Action
  backend = 'verified-shortcut'
  processId = $target.Id
  processName = $target.ProcessName
  identityVerified = $identity.verified
  identityType = $identity.type
  packageName = $identity.packageName
} | ConvertTo-Json -Compress
exit 0
