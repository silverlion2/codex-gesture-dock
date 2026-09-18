param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('show_desktop', 'task_view', 'open_explorer', 'volume_up', 'volume_down', 'volume_mute', 'switch_window', 'switch_window_back', 'minimize_active_window', 'maximize_active_window', 'snap_left', 'snap_right')]
  [string]$Action,
  [ValidateRange(0, 2147483647)]
  [int]$ExcludedProcessId = 0,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class FixedSystemKeys {
  // INPUT contains a union. Keeping only KEYBDINPUT makes its managed layout
  // differ from the Win32 ABI (40 bytes on x64, 28 bytes on x86).
  [StructLayout(LayoutKind.Sequential)]
  private struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  private struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  private struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
  [StructLayout(LayoutKind.Explicit)]
  private struct INPUTUNION {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public HARDWAREINPUT hi;
  }
  [StructLayout(LayoutKind.Sequential)]
  private struct INPUT { public uint type; public INPUTUNION u; }
  public sealed class InputLayout {
    public int pointerSize;
    public int inputSize;
    public int unionSize;
    public int unionOffset;
    public int mouseOffset;
    public int keyboardOffset;
    public int hardwareOffset;
  }
  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")]
  private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")]
  private static extern bool IsZoomed(IntPtr window);
  [DllImport("user32.dll")]
  private static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")]
  private static extern bool ShowWindow(IntPtr window, int command);
  private const uint INPUT_KEYBOARD = 1;
  private const uint KEYEVENTF_KEYUP = 0x0002;
  private const int SW_MINIMIZE = 6;
  private const int SW_MAXIMIZE = 3;
  private const int SW_RESTORE = 9;

  private static INPUT Key(ushort key, bool up) {
    INPUT input = new INPUT();
    input.type = INPUT_KEYBOARD;
    input.u.ki.wVk = key;
    input.u.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
    return input;
  }

  public static InputLayout GetInputLayout() {
    return new InputLayout {
      pointerSize = IntPtr.Size,
      inputSize = Marshal.SizeOf(typeof(INPUT)),
      unionSize = Marshal.SizeOf(typeof(INPUTUNION)),
      unionOffset = Marshal.OffsetOf(typeof(INPUT), "u").ToInt32(),
      mouseOffset = Marshal.OffsetOf(typeof(INPUTUNION), "mi").ToInt32(),
      keyboardOffset = Marshal.OffsetOf(typeof(INPUTUNION), "ki").ToInt32(),
      hardwareOffset = Marshal.OffsetOf(typeof(INPUTUNION), "hi").ToInt32(),
    };
  }

  public static uint Press(ushort key, IntPtr expectedWindow = default(IntPtr)) {
    if (expectedWindow != IntPtr.Zero && GetForegroundWindow() != expectedWindow) return 0;
    return SendInput(2, new[] { Key(key, false), Key(key, true) }, Marshal.SizeOf(typeof(INPUT)));
  }

  public static uint Chord(ushort modifier, ushort key) {
    return SendInput(4, new[] { Key(modifier, false), Key(key, false), Key(key, true), Key(modifier, true) }, Marshal.SizeOf(typeof(INPUT)));
  }

  public static uint Chord3(ushort first, ushort second, ushort key) {
    return SendInput(6, new[] { Key(first, false), Key(second, false), Key(key, false), Key(key, true), Key(second, true), Key(first, true) }, Marshal.SizeOf(typeof(INPUT)));
  }

  private static IntPtr GetAllowedForegroundWindow(int excludedProcessId, IntPtr expectedWindow = default(IntPtr)) {
    IntPtr window = GetForegroundWindow();
    if (window == IntPtr.Zero) return IntPtr.Zero;
    if (expectedWindow != IntPtr.Zero && window != expectedWindow) return IntPtr.Zero;
    uint processId;
    GetWindowThreadProcessId(window, out processId);
    return excludedProcessId > 0 && processId == (uint)excludedProcessId
      ? IntPtr.Zero
      : window;
  }

  public static uint MinimizeActiveWindow(int excludedProcessId, IntPtr expectedWindow = default(IntPtr)) {
    IntPtr window = GetAllowedForegroundWindow(excludedProcessId, expectedWindow);
    if (window == IntPtr.Zero) return 0;
    ShowWindow(window, SW_MINIMIZE);
    return IsIconic(window) ? 1u : 0u;
  }

  public static uint ToggleMaximizeActiveWindow(int excludedProcessId, IntPtr expectedWindow = default(IntPtr)) {
    IntPtr window = GetAllowedForegroundWindow(excludedProcessId, expectedWindow);
    if (window == IntPtr.Zero) return 0;
    bool wasMaximized = IsZoomed(window);
    ShowWindow(window, wasMaximized ? SW_RESTORE : SW_MAXIMIZE);
    return IsZoomed(window) != wasMaximized ? 1u : 0u;
  }
}
'@

$backend = 'send-input'
if (-not $DryRun) {
  switch ($Action) {
    'show_desktop' { $requested = 4; $sent = [FixedSystemKeys]::Chord(0x5B, 0x44) }
    'task_view' { $requested = 4; $sent = [FixedSystemKeys]::Chord(0x5B, 0x09) }
    'open_explorer' { $requested = 4; $sent = [FixedSystemKeys]::Chord(0x5B, 0x45) }
    'volume_up' { $requested = 2; $sent = [FixedSystemKeys]::Press(0xAF) }
    'volume_down' { $requested = 2; $sent = [FixedSystemKeys]::Press(0xAE) }
    'volume_mute' { $requested = 2; $sent = [FixedSystemKeys]::Press(0xAD) }
    'switch_window' { $requested = 4; $sent = [FixedSystemKeys]::Chord(0x12, 0x09) }
    'switch_window_back' { $requested = 6; $sent = [FixedSystemKeys]::Chord3(0x12, 0x10, 0x09) }
    'minimize_active_window' { $backend = 'win32-window'; $requested = 1; $sent = [FixedSystemKeys]::MinimizeActiveWindow($ExcludedProcessId) }
    'maximize_active_window' { $backend = 'win32-window'; $requested = 1; $sent = [FixedSystemKeys]::ToggleMaximizeActiveWindow($ExcludedProcessId) }
    'snap_left' { $requested = 4; $sent = [FixedSystemKeys]::Chord(0x5B, 0x25) }
    'snap_right' { $requested = 4; $sent = [FixedSystemKeys]::Chord(0x5B, 0x27) }
  }
} else {
  $requested = switch -Regex ($Action) {
    'switch_window_back' { 6; break }
    'volume_(up|down|mute)' { 2; break }
    'minimize_active_window|maximize_active_window' { 1; break }
    default { 4 }
  }
  if ($Action -match '^(minimize_active_window|maximize_active_window)$') { $backend = 'win32-window' }
  $sent = $requested
}

[pscustomobject]@{
  ok = $true
  action = $Action
  backend = $backend
  requested = $requested
  sent = $sent
  dryRun = [bool]$DryRun
  abi = [FixedSystemKeys]::GetInputLayout()
} | ConvertTo-Json -Compress
