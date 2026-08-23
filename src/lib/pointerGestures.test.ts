import { describe, expect, it } from 'vitest'
import {
  advanceAirPointer,
  initialAirPointerState,
  shouldEnableAirPointer,
  type HandLandmark,
} from './pointerGestures'

function hand(): HandLandmark[] {
  return Array.from({ length: 21 }, (_, index) => ({
    x: 0.5,
    y: 0.72 - index * 0.002,
  }))
}

function pointingHand() {
  const landmarks = hand()
  landmarks[0] = { x: 0.5, y: 0.8 }
  landmarks[6] = { x: 0.32, y: 0.5 }
  landmarks[8] = { x: 0.25, y: 0.2 }
  for (const [pip, tip] of [[10, 12], [14, 16], [18, 20]]) {
    landmarks[pip] = { x: 0.55, y: 0.5 }
    landmarks[tip] = { x: 0.54, y: 0.66 }
  }
  landmarks[9] = { x: 0.5, y: 0.52 }
  landmarks[4] = { x: 0.62, y: 0.48 }
  return landmarks
}

function pinchedHand() {
  const landmarks = pointingHand()
  landmarks[4] = { ...landmarks[8], x: landmarks[8].x + 0.01 }
  return landmarks
}

describe('air pointer gesture state', () => {
  it('mirrors and bounds the index-finger position for pointer movement', () => {
    const result = advanceAirPointer(initialAirPointerState, {
      confidence: 0.9,
      gesture: 'Pointing_Up',
      landmarks: pointingHand(),
      now: 100,
    })

    expect(result.activity).toBe('moving')
    expect(result.commands).toEqual([{ kind: 'move', x: 0.75, y: 0.2 }])
  })

  it('clicks once per pinch and rearms only after release', () => {
    const armed = advanceAirPointer(initialAirPointerState, {
      confidence: 0.9,
      gesture: 'Pointing_Up',
      landmarks: pointingHand(),
      now: 100,
    })
    const pinchedLandmarks = pinchedHand()
    const clicked = advanceAirPointer(armed.state, {
      confidence: 0,
      gesture: null,
      landmarks: pinchedLandmarks,
      now: 600,
    })
    const held = advanceAirPointer(clicked.state, {
      confidence: 0,
      gesture: null,
      landmarks: pinchedLandmarks,
      now: 1_100,
    })
    const releasedLandmarks = pointingHand()
    releasedLandmarks[4] = { x: 0.8, y: 0.7 }
    const released = advanceAirPointer(held.state, {
      confidence: 0,
      gesture: null,
      landmarks: releasedLandmarks,
      now: 1_200,
    })
    const clickedAgain = advanceAirPointer(released.state, {
      confidence: 0,
      gesture: null,
      landmarks: pinchedLandmarks,
      now: 1_700,
    })

    expect(clicked.commands.at(-1)).toEqual({ kind: 'click' })
    expect(held.commands).not.toContainEqual({ kind: 'click' })
    expect(clickedAgain.commands.at(-1)).toEqual({ kind: 'click' })
  })

  it('requires stable unpinched pointing before the first click', () => {
    const firstPinch = advanceAirPointer(initialAirPointerState, {
      confidence: 0.9,
      gesture: 'Pointing_Up',
      landmarks: pinchedHand(),
      now: 100,
    })
    const armed = advanceAirPointer(firstPinch.state, {
      confidence: 0.9,
      gesture: 'Pointing_Up',
      landmarks: pointingHand(),
      now: 200,
    })
    const tooSoon = advanceAirPointer(armed.state, {
      confidence: 0,
      gesture: null,
      landmarks: pinchedHand(),
      now: 400,
    })
    const rearmed = advanceAirPointer(tooSoon.state, {
      confidence: 0.9,
      gesture: 'Pointing_Up',
      landmarks: pointingHand(),
      now: 500,
    })
    const clicked = advanceAirPointer(rearmed.state, {
      confidence: 0,
      gesture: null,
      landmarks: pinchedHand(),
      now: 800,
    })

    expect(firstPinch.commands).not.toContainEqual({ kind: 'click' })
    expect(tooSoon.commands).not.toContainEqual({ kind: 'click' })
    expect(clicked.commands.at(-1)).toEqual({ kind: 'click' })
  })

  it('turns open-palm vertical movement into cooled fixed-step scrolling', () => {
    const first = pointingHand()
    first[9] = { x: 0.5, y: 0.55 }
    const anchored = advanceAirPointer(initialAirPointerState, {
      confidence: 0.9,
      gesture: 'Open_Palm',
      landmarks: first,
      now: 0,
    })
    const moved = pointingHand()
    moved[9] = { x: 0.5, y: 0.48 }
    const scrolled = advanceAirPointer(anchored.state, {
      confidence: 0.9,
      gesture: 'Open_Palm',
      landmarks: moved,
      now: 200,
    })

    expect(scrolled.activity).toBe('scrolling-up')
    expect(scrolled.commands).toEqual([{ kind: 'scroll', delta: 1 }])
  })

  it('fully disarms input when the hand disappears', () => {
    const armed = advanceAirPointer(initialAirPointerState, {
      confidence: 0.9,
      gesture: 'Pointing_Up',
      landmarks: pointingHand(),
      now: 100,
    })
    const result = advanceAirPointer(armed.state, {
      confidence: 0,
      gesture: null,
      landmarks: null,
      now: 500,
    })
    const reacquired = advanceAirPointer(result.state, {
      confidence: 0.9,
      gesture: 'Pointing_Up',
      landmarks: pinchedHand(),
      now: 550,
    })

    expect(result.activity).toBe('idle')
    expect(result.commands).toEqual([])
    expect(result.state).toEqual(expect.objectContaining({
      lastPointerAt: Number.NEGATIVE_INFINITY,
      pointerArmedAt: Number.NEGATIVE_INFINITY,
      smoothedX: null,
      smoothedY: null,
    }))
    expect(reacquired.commands).not.toContainEqual({ kind: 'click' })
  })
})

describe('air pointer eligibility', () => {
  const ready = {
    approvalPending: false,
    cameraMode: 'monitor',
    gestureEnabled: true,
    gestureMode: 'pointer',
    monitoring: true,
  }

  it('disables native pointer input while an approval is pending', () => {
    expect(shouldEnableAirPointer(ready)).toBe(true)
    expect(shouldEnableAirPointer({ ...ready, approvalPending: true })).toBe(false)
  })
})
