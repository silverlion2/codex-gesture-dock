// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GESTURE_MODE_STORAGE_KEY, loadGestureMode, saveGestureMode } from './gesturePreferences'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('Windows-first gesture preferences', () => {
  it('defaults to Windows on a fresh install or legacy Codex preference', () => {
    expect(loadGestureMode()).toBe('windows')
    localStorage.setItem('codex-gesture-dock.gesture-mode.v1', 'codex')
    expect(loadGestureMode()).toBe('windows')
  })
  it('remembers all explicit choices after the migration', () => {
    for (const mode of ['windows', 'codex', 'pointer'] as const) {
      saveGestureMode(mode)
      expect(loadGestureMode()).toBe(mode)
    }
  })
  it('fails back to Windows for invalid or unavailable storage', () => {
    localStorage.setItem(GESTURE_MODE_STORAGE_KEY, 'bad-mode')
    expect(loadGestureMode()).toBe('windows')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadGestureMode()).toBe('windows')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => saveGestureMode('windows')).not.toThrow()
  })
})
