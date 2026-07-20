import { describe, expect, it } from 'vitest'
import {
  advanceGestureMachine,
  GESTURE_HOLD_MS,
  GESTURE_RELEASE_MS,
  initialGestureMachineState,
} from './gestures'

describe('gesture confirmation state machine', () => {
  it('triggers only after a stable hold', () => {
    const started = advanceGestureMachine(initialGestureMachineState, {
      name: 'Victory',
      confidence: 0.9,
      now: 100,
    })
    const early = advanceGestureMachine(started.state, {
      name: 'Victory',
      confidence: 0.9,
      now: 100 + GESTURE_HOLD_MS - 1,
    })
    const confirmed = advanceGestureMachine(early.state, {
      name: 'Victory',
      confidence: 0.9,
      now: 100 + GESTURE_HOLD_MS,
    })

    expect(early.action).toBeNull()
    expect(confirmed.action).toBe('quick_chat')
    expect(confirmed.gesture).toBe('Victory')
    expect(confirmed.state.awaitingNeutral).toBe(true)
  })

  it('does not repeat while the same hand pose is held', () => {
    const started = advanceGestureMachine(initialGestureMachineState, {
      name: 'Thumb_Up',
      confidence: 0.92,
      now: 0,
    })
    const confirmed = advanceGestureMachine(started.state, {
      name: 'Thumb_Up',
      confidence: 0.92,
      now: GESTURE_HOLD_MS,
    })
    const held = advanceGestureMachine(confirmed.state, {
      name: 'Thumb_Up',
      confidence: 0.94,
      now: GESTURE_HOLD_MS + 2_000,
    })

    expect(confirmed.action).toBe('review')
    expect(held.action).toBeNull()
    expect(held.state.awaitingNeutral).toBe(true)
  })

  it('rearms only after a neutral release window', () => {
    const started = advanceGestureMachine(initialGestureMachineState, {
      name: 'Open_Palm',
      confidence: 0.9,
      now: 0,
    })
    const confirmed = advanceGestureMachine(started.state, {
      name: 'Open_Palm',
      confidence: 0.9,
      now: GESTURE_HOLD_MS,
    })
    const releaseStarted = advanceGestureMachine(confirmed.state, {
      name: null,
      confidence: 0,
      now: GESTURE_HOLD_MS + 50,
    })
    const released = advanceGestureMachine(releaseStarted.state, {
      name: null,
      confidence: 0,
      now: GESTURE_HOLD_MS + 50 + GESTURE_RELEASE_MS,
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
})
