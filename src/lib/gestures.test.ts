import { describe, expect, it } from 'vitest'
import {
  advanceGestureMachine,
  GESTURE_HOLD_MS,
  GESTURE_MAX_FRAME_GAP_MS,
  initialGestureMachineState,
  isGestureName,
  isWindowsAction,
  WINDOWS_ACTIONS,
  WINDOWS_GESTURE_BINDINGS,
  type GestureMachineState,
} from './gestures'

function confirmGesture(
  name: string,
  bindings: Parameters<typeof advanceGestureMachine>[2] = undefined,
  start = 0,
) {
  let state: GestureMachineState = initialGestureMachineState
  let result = advanceGestureMachine(state, { name, confidence: 0.9, now: start })
  state = result.state
  for (let index = 1; index <= 5; index += 1) {
    result = advanceGestureMachine(state, {
      name,
      confidence: 0.9,
      now: start + index * 200,
    }, bindings)
    state = result.state
  }
  return result
}

describe('gesture confirmation state machine', () => {
  it('routes every Windows command independently of the six hand bindings', () => {
    for (const action of WINDOWS_ACTIONS) expect(isWindowsAction(action)).toBe(true)
    expect(isWindowsAction('quick_chat')).toBe(false)
    expect(isWindowsAction('dictation')).toBe(false)
  })

  it('triggers only after a stable hold', () => {
    const confirmed = confirmGesture('Victory', undefined, 100)

    expect(confirmed.action).toBe('quick_chat')
    expect(confirmed.gesture).toBe('Victory')
    expect(confirmed.state.awaitingNeutral).toBe(true)
  })

  it('does not repeat while the same hand pose is held', () => {
    const confirmed = confirmGesture('Thumb_Up')
    const held = advanceGestureMachine(confirmed.state, {
      name: 'Thumb_Up',
      confidence: 0.94,
      now: GESTURE_HOLD_MS + 2_000,
    })

    expect(confirmed.action).toBe('review')
    expect(held.action).toBeNull()
    expect(held.state.awaitingNeutral).toBe(true)
  })

  it('activates Codex dictation after holding the pointing gesture', () => {
    const confirmed = confirmGesture('Pointing_Up')

    expect(confirmed.action).toBe('dictation')
    expect(confirmed.binding?.actionLabel).toBe('激活 Codex 话筒')
  })

  it('uses the independent Windows mapping when that mode is active', () => {
    const confirmed = confirmGesture('Open_Palm', WINDOWS_GESTURE_BINDINGS)

    expect(confirmed.action).toBe('show_desktop')
    expect(confirmed.binding?.actionLabel).toBe('显示桌面')
  })

  it('prioritizes safe window management actions in Windows mode', () => {
    const expected: Record<string, string> = {
      Victory: 'switch_window',
      ILoveYou: 'switch_window_back',
      Closed_Fist: 'minimize_active_window',
      Thumb_Up: 'maximize_active_window',
      Pointing_Up: 'task_view',
      Open_Palm: 'show_desktop',
    }

    for (const [name, action] of Object.entries(expected)) {
      const confirmed = confirmGesture(name, WINDOWS_GESTURE_BINDINGS)
      expect(confirmed.action).toBe(action)
    }
  })

  it('rearms only after a neutral release window', () => {
    const confirmed = confirmGesture('Open_Palm')
    const confirmedAt = confirmed.state.lastSampleAt ?? GESTURE_HOLD_MS
    const releaseStarted = advanceGestureMachine(confirmed.state, {
      name: null,
      confidence: 0,
      now: confirmedAt + 100,
    })
    const releaseContinued = advanceGestureMachine(releaseStarted.state, {
      name: null,
      confidence: 0,
      now: confirmedAt + 250,
    })
    const released = advanceGestureMachine(releaseContinued.state, {
      name: null,
      confidence: 0,
      now: confirmedAt + 500,
    })

    expect(releaseStarted.state.awaitingNeutral).toBe(true)
    expect(released.state.awaitingNeutral).toBe(false)
    expect(confirmed.gesture).toBe('Open_Palm')
    expect(confirmed.action).toBeNull()
  })

  it('resets confirmation when confidence drops', () => {
    const started = advanceGestureMachine(initialGestureMachineState, {
      name: 'Pointing_Up',
      confidence: 0.9,
      now: 0,
    })
    const reset = advanceGestureMachine(started.state, {
      name: 'Pointing_Up',
      confidence: 0.5,
      now: 400,
    })

    expect(reset.state.candidate).toBeNull()
    expect(reset.state.progress).toBe(0)
  })

  it('does not treat two widely separated frames as a hold', () => {
    const started = advanceGestureMachine(initialGestureMachineState, {
      name: 'Victory', confidence: 0.9, now: 0,
    })
    const separated = advanceGestureMachine(started.state, {
      name: 'Victory', confidence: 0.9, now: GESTURE_HOLD_MS,
    })

    expect(separated.action).toBeNull()
    expect(separated.state.candidateSamples).toBe(0)
  })

  it('preserves the neutral latch across a long gap', () => {
    const confirmed = confirmGesture('Victory')
    const confirmedAt = confirmed.state.lastSampleAt ?? GESTURE_HOLD_MS
    const afterGap = advanceGestureMachine(confirmed.state, {
      name: null,
      confidence: 0,
      now: confirmedAt + GESTURE_MAX_FRAME_GAP_MS + 1,
    })

    expect(afterGap.state.awaitingNeutral).toBe(true)
    expect(afterGap.action).toBeNull()
  })

  it('fails closed for invalid and non-monotonic timestamps', () => {
    const started = advanceGestureMachine(initialGestureMachineState, {
      name: 'Victory', confidence: 0.9, now: 100,
    })
    const invalid = advanceGestureMachine(started.state, {
      name: 'Victory', confidence: 0.9, now: Number.NaN,
    })
    const backwards = advanceGestureMachine(started.state, {
      name: 'Victory', confidence: 0.9, now: 99,
    })

    expect(invalid.action).toBeNull()
    expect(backwards.action).toBeNull()
    expect(invalid.state.candidate).toBeNull()
  })

  it('does not accept unknown or prototype property names', () => {
    expect(isGestureName('__proto__')).toBe(false)
    const result = advanceGestureMachine(initialGestureMachineState, {
      name: '__proto__', confidence: 1, now: 0,
    })
    expect(result.action).toBeNull()
    expect(result.state.candidate).toBeNull()
  })
})
