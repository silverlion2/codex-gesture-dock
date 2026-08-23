$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class FixedPointerInput {
  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool SetCursorPos(int x, int y);

  [DllImport("user32.dll")]
  private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

  private const uint LEFT_DOWN = 0x0002;
  private const uint LEFT_UP = 0x0004;
  private const uint WHEEL = 0x0800;

  public static void Move(int x, int y) {
    SetCursorPos(x, y);
  }

  public static void Click() {
    mouse_event(LEFT_DOWN, 0, 0, 0, UIntPtr.Zero);
    mouse_event(LEFT_UP, 0, 0, 0, UIntPtr.Zero);
  }

  public static void Scroll(int direction) {
    int delta = direction > 0 ? 120 : -120;
    mouse_event(WHEEL, 0, 0, unchecked((uint)delta), UIntPtr.Zero);
  }
}
'@

while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ([string]::IsNullOrWhiteSpace($line) -or $line.Length -gt 80) { continue }
  $parts = $line.Split("`t")
  switch ($parts[0]) {
    'move' {
      if ($parts.Count -ne 3) { continue }
      $x = 0
      $y = 0
      if (-not [int]::TryParse($parts[1], [ref]$x)) { continue }
      if (-not [int]::TryParse($parts[2], [ref]$y)) { continue }
      if ([Math]::Abs([long]$x) -gt 100000 -or [Math]::Abs([long]$y) -gt 100000) { continue }
      [FixedPointerInput]::Move($x, $y)
    }
    'click' {
      if ($parts.Count -ne 1) { continue }
      [FixedPointerInput]::Click()
    }
    'scroll' {
      if ($parts.Count -ne 2 -or ($parts[1] -ne '1' -and $parts[1] -ne '-1')) { continue }
      [FixedPointerInput]::Scroll([int]$parts[1])
    }
  }
}
