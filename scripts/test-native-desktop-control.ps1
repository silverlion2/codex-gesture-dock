[CmdletBinding()]
param(
  [switch]$RunNative,
  [switch]$KeepFixture
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$powershell = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $powershell)) { $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source }

if ($env:OS -ne 'Windows_NT') { throw 'Native desktop integration requires Windows.' }
if (-not $RunNative) {
  Write-Output ([pscustomobject]@{ ok = $false; skipped = $true; reason = 'refused-without-RunNative'; message = 'Pass -RunNative only after reviewing the fixture scope.' } | ConvertTo-Json -Compress)
  exit 2
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeHarnessProbe {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  public static object Snapshot(IntPtr window) {
    uint pid; GetWindowThreadProcessId(window, out pid);
    return new { handle = window.ToInt64(), pid = pid, valid = window != IntPtr.Zero && IsWindow(window) };
  }
}
'@

function Read-FixtureLine([System.Diagnostics.Process]$Process) {
  $read = $Process.StandardOutput.ReadLineAsync()
  if (-not $read.Wait(5000)) { throw 'Timed out waiting for the owned fixture.' }
  $line = $read.Result
  if ([string]::IsNullOrWhiteSpace($line)) { throw 'Fixture exited or returned an empty line.' }
  try { return $line | ConvertFrom-Json } catch { throw "Fixture returned invalid JSON: $line" }
}
function Send-FixtureCommand([System.Diagnostics.Process]$Process, [string]$Command) {
  $Process.StandardInput.WriteLine($Command)
  $Process.StandardInput.Flush()
  return Read-FixtureLine $Process
}
$previous = [NativeHarnessProbe]::GetForegroundWindow()
  $previousSnapshot = [pscustomobject]@{ handle = $previous.ToInt64(); pid = ([NativeHarnessProbe]::Snapshot($previous)).pid }
$fixture = $null
$results = [System.Collections.Generic.List[object]]::new()
try {
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $powershell
  $start.Arguments = '-NoLogo -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'native-window-fixture.ps1') + '"'
  $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true; $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  $fixture = [System.Diagnostics.Process]::new(); $fixture.StartInfo = $start
  if (-not $fixture.Start()) { throw 'Unable to start the owned native fixture.' }
  $ready = Read-FixtureLine $fixture
  if ($ready.ready -ne $true -or [int]$ready.pid -ne $fixture.Id) { throw 'Fixture ownership handshake failed.' }
  $a = [int64]$ready.a; $b = [int64]$ready.b; $fixturePid = [int]$ready.pid

  $key = Send-FixtureCommand $fixture 'probe-key'
  if ([int64]$key.handle -ne $a -or [int64]$key.foreground -ne $a -or [int]$key.sent -ne 2 -or [int]$key.keyDownCount -lt 1) { throw 'Harmless F24 SendInput probe was not observed by owned fixture A.' }
  $results.Add([pscustomobject]@{ test = 'sendinput-f24'; ok = $true; sent = $key.sent; keyDownCount = $key.keyDownCount })

  $focusA = Send-FixtureCommand $fixture 'focusa'
  $maxA = Send-FixtureCommand $fixture ("maxa`t$PID")
  $stateA = $maxA
  if ($maxA.sent -ne 1 -or $stateA.zoomed -ne $true) { throw 'Owned fixture A did not maximize through the native helper.' }
  $results.Add([pscustomobject]@{ test = 'maximize-owned-a'; ok = $true; sent = $maxA.sent; zoomed = $stateA.zoomed })
  $restoreA = Send-FixtureCommand $fixture ("maxa`t$PID")
  if ($restoreA.sent -ne 1 -or $restoreA.zoomed -ne $false) { throw 'Owned fixture A did not restore through the native helper.' }
  $results.Add([pscustomobject]@{ test = 'restore-owned-a'; ok = $true; sent = $restoreA.sent; zoomed = $restoreA.zoomed })

  [void](Send-FixtureCommand $fixture 'focusb')
  $minB = Send-FixtureCommand $fixture ("minb`t$PID")
  $stateB = $minB
  if ($minB.sent -ne 1 -or $stateB.iconic -ne $true) { throw 'Owned fixture B did not minimize through the native helper.' }
  $results.Add([pscustomobject]@{ test = 'minimize-owned-b'; ok = $true; sent = $minB.sent; iconic = $stateB.iconic })
  [void](Send-FixtureCommand $fixture 'restoreb')

  $excluded = Send-FixtureCommand $fixture ("reject`t$fixturePid")
  if ($excluded.sent -ne 0 -or $excluded.iconic -ne $false) { throw 'ExcludedProcessId did not reject the fixture process foreground.' }
  $results.Add([pscustomobject]@{ test = 'excluded-process-reject'; ok = $true; sent = $excluded.sent })
  [pscustomobject]@{ ok = $true; fixturePid = $fixturePid; windows = @($a,$b); previousForeground = $previousSnapshot; tests = @($results) } | ConvertTo-Json -Depth 6 -Compress
} catch {
  [pscustomobject]@{ ok = $false; error = $_.Exception.Message; tests = @($results); previousForeground = $previousSnapshot } | ConvertTo-Json -Depth 6 -Compress
  exit 1
} finally {
  if ($fixture) {
    if (-not $KeepFixture -and -not $fixture.HasExited) { try { [void](Send-FixtureCommand $fixture 'quit') } catch {} }
    if (-not $fixture.HasExited) { try { [void]$fixture.WaitForExit(2000) } catch {} }
    if (-not $fixture.HasExited) { try { $fixture.Kill() } catch {} }
    $fixture.Dispose()
  }
  if ($previous -ne [IntPtr]::Zero -and [NativeHarnessProbe]::IsWindow($previous)) { [void][NativeHarnessProbe]::SetForegroundWindow($previous) }
}
