param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('show_desktop', 'task_view', 'open_explorer', 'volume_up', 'volume_down', 'volume_mute')]
  [string]$Action,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class FixedSystemKeys {
  [DllImport("user32.dll", SetLastError = true)]
  private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extraInfo);

  private const uint KEYUP = 0x0002;
  private const byte WIN = 0x5B;

  private static void Press(byte key) {
    keybd_event(key, 0, 0, UIntPtr.Zero);
    keybd_event(key, 0, KEYUP, UIntPtr.Zero);
  }

  public static void Chord(byte key) {
    keybd_event(WIN, 0, 0, UIntPtr.Zero);
    Press(key);
    keybd_event(WIN, 0, KEYUP, UIntPtr.Zero);
  }

  public static void Media(byte key) {
    Press(key);
  }
}
'@

if (-not $DryRun) {
  switch ($Action) {
    'show_desktop' { [FixedSystemKeys]::Chord(0x44) }
    'task_view' { [FixedSystemKeys]::Chord(0x09) }
    'open_explorer' { [FixedSystemKeys]::Chord(0x45) }
    'volume_up' { [FixedSystemKeys]::Media(0xAF) }
    'volume_down' { [FixedSystemKeys]::Media(0xAE) }
    'volume_mute' { [FixedSystemKeys]::Media(0xAD) }
  }
}

[pscustomobject]@{
  ok = $true
  action = $Action
  backend = 'fixed-system-key'
  dryRun = [bool]$DryRun
} | ConvertTo-Json -Compress
