import type { GestureMode } from './gestures'

// v1 persisted the old implicit Codex default, so migrate once by starting a
// fresh preference namespace. Subsequent explicit choices are preserved.
export const GESTURE_MODE_STORAGE_KEY = 'codex-gesture-dock.gesture-mode.v2'

export function loadGestureMode(): GestureMode {
  try {
    const stored = window.localStorage.getItem(GESTURE_MODE_STORAGE_KEY)
    return stored === 'codex' || stored === 'pointer' || stored === 'windows'
      ? stored : 'windows'
  } catch {
    return 'windows'
  }
}

export function saveGestureMode(mode: GestureMode) {
  try { window.localStorage.setItem(GESTURE_MODE_STORAGE_KEY, mode) } catch { /* optional persistence */ }
}
