$ErrorActionPreference = 'Stop'

if (-not $PSScriptRoot) { exit 6 }
. (Join-Path $PSScriptRoot 'codex-window-policy.ps1')

Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;

public sealed class CodexWindowEventRecord {
  public uint EventType;
  public IntPtr Window;
  public int ObjectId;
  public uint ThreadId;
  public uint EventTime;
}

public static class CodexWindowEventHook {
  private delegate void WinEventDelegate(
    IntPtr hook,
    uint eventType,
    IntPtr window,
    int objectId,
    int childId,
    uint threadId,
    uint eventTime
  );

  [DllImport("user32.dll")]
  private static extern IntPtr SetWinEventHook(
    uint eventMin,
    uint eventMax,
    IntPtr module,
    WinEventDelegate callback,
    uint processId,
    uint threadId,
    uint flags
  );

  [DllImport("user32.dll")]
  private static extern bool UnhookWinEvent(IntPtr hook);

  private const uint WINEVENT_OUTOFCONTEXT = 0;
  private const uint WINEVENT_SKIPOWNPROCESS = 2;
  private const uint EVENT_SYSTEM_FOREGROUND = 3;
  private const uint EVENT_OBJECT_SHOW = 0x8002;
  private const uint EVENT_OBJECT_NAMECHANGE = 0x800C;
  private static readonly ConcurrentQueue<CodexWindowEventRecord> Queue =
    new ConcurrentQueue<CodexWindowEventRecord>();
  private static readonly WinEventDelegate Callback = HandleEvent;
  private static IntPtr foregroundHook = IntPtr.Zero;
  private static IntPtr objectHook = IntPtr.Zero;

  public static bool Start(uint processId) {
    Stop();
    uint flags = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;
    foregroundHook = SetWinEventHook(
      EVENT_SYSTEM_FOREGROUND,
      EVENT_SYSTEM_FOREGROUND,
      IntPtr.Zero,
      Callback,
      processId,
      0,
      flags
    );
    objectHook = SetWinEventHook(
      EVENT_OBJECT_SHOW,
      EVENT_OBJECT_NAMECHANGE,
      IntPtr.Zero,
      Callback,
      processId,
      0,
      flags
    );
    return foregroundHook != IntPtr.Zero && objectHook != IntPtr.Zero;
  }

  public static bool TryDequeue(out CodexWindowEventRecord record) {
    return Queue.TryDequeue(out record);
  }

  public static void Stop() {
    if (foregroundHook != IntPtr.Zero) {
      UnhookWinEvent(foregroundHook);
      foregroundHook = IntPtr.Zero;
    }
    if (objectHook != IntPtr.Zero) {
      UnhookWinEvent(objectHook);
      objectHook = IntPtr.Zero;
    }
    CodexWindowEventRecord ignored;
    while (Queue.TryDequeue(out ignored)) { }
  }

  private static void HandleEvent(
    IntPtr hook,
    uint eventType,
    IntPtr window,
    int objectId,
    int childId,
    uint threadId,
    uint eventTime
  ) {
    if (
      eventType != EVENT_SYSTEM_FOREGROUND &&
      eventType != 0x8002 &&
      eventType != 0x8003 &&
      eventType != 0x8005 &&
      eventType != 0x800B &&
      eventType != 0x800C
    ) return;
    if (window == IntPtr.Zero) return;
    Queue.Enqueue(new CodexWindowEventRecord {
      EventType = eventType,
      Window = window,
      ObjectId = objectId,
      ThreadId = threadId,
      EventTime = eventTime
    });
  }
}
'@

function Write-MonitorEvent {
  param([hashtable]$Data)
  [Console]::Out.WriteLine(([pscustomobject]$Data | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function Get-EventName {
  param([uint32]$EventType)
  switch ($EventType) {
    3 { 'foreground' }
    0x8002 { 'show' }
    0x8003 { 'hide' }
    0x8005 { 'focus' }
    0x800B { 'location' }
    0x800C { 'name' }
    default { 'unknown' }
  }
}

$attachedProcessId = 0
$lastDetachedAt = 0
try {
  while ($true) {
    [System.Windows.Forms.Application]::DoEvents()
    $target = Get-CodexTargetProcess
    $targetIdentity = $null
    if ($target -and $target.Id -ne $attachedProcessId) {
      $targetIdentity = [pscustomobject]@{
        process = $target
        identity = Get-CodexProcessIdentity -Process $target
      }
    }

    if ($target -and $target.Id -eq $attachedProcessId) {
      # The already-verified process identity cannot change without a new PID.
    } elseif ($targetIdentity -and $targetIdentity.identity.verified) {
      $target = $targetIdentity.process
      if ($attachedProcessId -ne $target.Id) {
        [CodexWindowEventHook]::Stop()
        if (-not [CodexWindowEventHook]::Start([uint32]$target.Id)) { exit 7 }
        $attachedProcessId = $target.Id
        Write-MonitorEvent @{
          type = 'attached'
          processId = $target.Id
          processName = $target.ProcessName
          identityVerified = $true
          identityType = $targetIdentity.identity.type
          packageName = $targetIdentity.identity.packageName
          timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        }
      }
    } elseif (-not $target -and $attachedProcessId -ne 0) {
      [CodexWindowEventHook]::Stop()
      Write-MonitorEvent @{
        type = 'detached'
        processId = $attachedProcessId
        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      }
      $attachedProcessId = 0
      $lastDetachedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } elseif (
      $lastDetachedAt -eq 0 -or
      ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $lastDetachedAt) -ge 10000
    ) {
      Write-MonitorEvent @{
        type = 'waiting'
        processId = 0
        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      }
      $lastDetachedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }

    $record = $null
    while ([CodexWindowEventHook]::TryDequeue([ref]$record)) {
      Write-MonitorEvent @{
        type = Get-EventName -EventType $record.EventType
        processId = $attachedProcessId
        timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      }
      $record = $null
    }

    Start-Sleep -Milliseconds 180
  }
} finally {
  [CodexWindowEventHook]::Stop()
}
