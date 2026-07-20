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

$target = Get-Process | Where-Object {
  $_.MainWindowHandle -ne 0 -and (
    $_.ProcessName -eq 'Codex' -or
    ($_.ProcessName -eq 'ChatGPT' -and $_.MainWindowTitle -match '(?i)\bCodex\b')
  )
} | Sort-Object StartTime -Descending | Select-Object -First 1

if (-not $target) {
  exit 2
}

if ($DryRun) {
  [pscustomobject]@{
    processId = $target.Id
    processName = $target.ProcessName
    windowTitle = $target.MainWindowTitle
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
exit 0
