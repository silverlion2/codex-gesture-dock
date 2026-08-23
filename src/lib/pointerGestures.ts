export type PointerActivity =
  | 'idle'
  | 'moving'
  | 'clicking'
  | 'scrolling-up'
  | 'scrolling-down'

export type PointerCommand =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'click' }
  | { kind: 'scroll'; delta: -1 | 1 }

export interface PointerControlStatus {
  enabled: boolean
  message: string
}

export interface HandLandmark {
  x: number
  y: number
  z?: number
}

export interface AirPointerState {
  lastClickAt: number
  lastPointerAt: number
  lastScrollAt: number
  pointerArmedAt: number
  pinchActive: boolean
  scrollAnchorY: number | null
  smoothedX: number | null
  smoothedY: number | null
}

export interface AirPointerEligibility {
  approvalPending: boolean
  cameraMode: string
  gestureEnabled: boolean
  gestureMode: string
  monitoring: boolean
}

export interface AirPointerFrame {
  confidence: number
  gesture: string | null
  landmarks: HandLandmark[] | null
  now: number
}

export interface AirPointerResult {
  activity: PointerActivity
  commands: PointerCommand[]
  state: AirPointerState
}

const CLICK_COOLDOWN_MS = 420
const POINTER_ARM_DWELL_MS = 250
const POINTER_ARM_WINDOW_MS = 1_000
const SCROLL_COOLDOWN_MS = 120
const PINCH_START_RATIO = 0.34
const PINCH_RELEASE_RATIO = 0.48
const SCROLL_STEP = 0.04
const SMOOTHING = 0.38

export const initialAirPointerState: AirPointerState = {
  lastClickAt: Number.NEGATIVE_INFINITY,
  lastPointerAt: Number.NEGATIVE_INFINITY,
  lastScrollAt: Number.NEGATIVE_INFINITY,
  pointerArmedAt: Number.NEGATIVE_INFINITY,
  pinchActive: false,
  scrollAnchorY: null,
  smoothedX: null,
  smoothedY: null,
}

export function shouldEnableAirPointer({
  approvalPending,
  cameraMode,
  gestureEnabled,
  gestureMode,
  monitoring,
}: AirPointerEligibility) {
  return (
    gestureMode === 'pointer' &&
    gestureEnabled &&
    cameraMode === 'monitor' &&
    monitoring &&
    !approvalPending
  )
}

export function disarmAirPointerState(
  current: AirPointerState = initialAirPointerState,
): AirPointerState {
  return {
    ...current,
    lastPointerAt: Number.NEGATIVE_INFINITY,
    pointerArmedAt: Number.NEGATIVE_INFINITY,
    pinchActive: false,
    scrollAnchorY: null,
    smoothedX: null,
    smoothedY: null,
  }
}

function distance(a: HandLandmark, b: HandLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function validLandmarks(value: HandLandmark[] | null): value is HandLandmark[] {
  return Boolean(
    value &&
    value.length >= 21 &&
    value.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
  )
}

function isIndexExtended(landmarks: HandLandmark[]) {
  const wrist = landmarks[0]
  const indexPip = landmarks[6]
  const indexTip = landmarks[8]
  const indexExtended = distance(wrist, indexTip) > distance(wrist, indexPip) * 1.12
  const foldedCount = [
    [10, 12],
    [14, 16],
    [18, 20],
  ].filter(([pip, tip]) => (
    distance(wrist, landmarks[tip]) < distance(wrist, landmarks[pip]) * 1.08
  )).length
  return indexExtended && foldedCount >= 2
}

function smooth(previous: number | null, next: number) {
  return previous === null ? next : previous + (next - previous) * SMOOTHING
}

export function advanceAirPointer(
  current: AirPointerState,
  frame: AirPointerFrame,
): AirPointerResult {
  if (!validLandmarks(frame.landmarks)) {
    return {
      activity: 'idle',
      commands: [],
      state: disarmAirPointerState(current),
    }
  }

  const landmarks = frame.landmarks
  const openPalm = frame.gesture === 'Open_Palm' && frame.confidence >= 0.58
  if (openPalm) {
    const disarmed = disarmAirPointerState(current)
    const handY = landmarks[9].y
    const anchor = current.scrollAnchorY ?? handY
    const movement = anchor - handY
    const canScroll = frame.now - current.lastScrollAt >= SCROLL_COOLDOWN_MS
    if (Math.abs(movement) >= SCROLL_STEP && canScroll) {
      const delta = movement > 0 ? 1 : -1
      return {
        activity: delta > 0 ? 'scrolling-up' : 'scrolling-down',
        commands: [{ kind: 'scroll', delta }],
        state: {
          ...disarmed,
          lastScrollAt: frame.now,
          scrollAnchorY: handY,
        },
      }
    }
    return {
      activity: 'idle',
      commands: [],
      state: { ...disarmed, scrollAnchorY: anchor },
    }
  }

  const indexTip = landmarks[8]
  const palmScale = Math.max(distance(landmarks[0], landmarks[9]), 0.08)
  const pinchRatio = distance(landmarks[4], indexTip) / palmScale
  const pointing =
    (frame.gesture === 'Pointing_Up' && frame.confidence >= 0.55) ||
    isIndexExtended(landmarks)
  const pointerWasRecentlySeen =
    frame.now - current.lastPointerAt <= POINTER_ARM_WINDOW_MS
  const pointerDwellIsActive =
    pointerWasRecentlySeen && Number.isFinite(current.pointerArmedAt)
  const hasPriorPointerDwell =
    pointerDwellIsActive &&
    frame.now - current.pointerArmedAt >= POINTER_ARM_DWELL_MS
  const pinching =
    pinchRatio <= PINCH_START_RATIO && (pointing || pointerWasRecentlySeen)
  const stableUnpinchedPointing =
    pointing && pinchRatio >= PINCH_RELEASE_RATIO
  const commands: PointerCommand[] = []
  let next = { ...current, scrollAnchorY: null }

  if (pointing || pinching) {
    const targetX = clamp01(1 - indexTip.x)
    const targetY = clamp01(indexTip.y)
    const smoothedX = clamp01(smooth(current.smoothedX, targetX))
    const smoothedY = clamp01(smooth(current.smoothedY, targetY))
    next = {
      ...next,
      lastPointerAt: frame.now,
      pointerArmedAt: stableUnpinchedPointing
        ? pointerDwellIsActive
          ? current.pointerArmedAt
          : frame.now
        : current.pointerArmedAt,
      smoothedX,
      smoothedY,
    }
    commands.push({ kind: 'move', x: smoothedX, y: smoothedY })
  }

  if (
    pinching &&
    hasPriorPointerDwell &&
    !current.pinchActive &&
    frame.now - current.lastClickAt >= CLICK_COOLDOWN_MS
  ) {
    commands.push({ kind: 'click' })
    return {
      activity: 'clicking',
      commands,
      state: {
        ...next,
        lastClickAt: frame.now,
        pinchActive: true,
      },
    }
  }

  if (current.pinchActive && pinchRatio < PINCH_RELEASE_RATIO) {
    next.pinchActive = true
  } else if (pinchRatio >= PINCH_RELEASE_RATIO) {
    next.pinchActive = false
  }

  return {
    activity: commands.length ? 'moving' : 'idle',
    commands,
    state: next,
  }
}
