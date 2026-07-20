export type GestureName =
  | 'Closed_Fist'
  | 'Open_Palm'
  | 'Pointing_Up'
  | 'Thumb_Up'
  | 'Victory'
  | 'ILoveYou'

export type CodexAction =
  | 'quick_chat'
  | 'dictation'
  | 'command_menu'
  | 'review'
  | 'terminal'
  | 'sidebar'
  | 'search_tasks'

export interface CodexActionResult {
  action: CodexAction
  message: string
  ok: boolean
}

export interface GestureBinding {
  action: CodexAction | null
  actionLabel: string
  gestureLabel: string
  symbol: string
}

export const GESTURE_BINDINGS: Record<GestureName, GestureBinding> = {
  Victory: {
    action: 'quick_chat',
    actionLabel: '打开快速对话',
    gestureLabel: '胜利手势',
    symbol: '✌',
  },
  Pointing_Up: {
    action: 'dictation',
    actionLabel: '开始语音输入',
    gestureLabel: '食指向上',
    symbol: '☝',
  },
  Open_Palm: {
    action: null,
    actionLabel: '打开任务选择器',
    gestureLabel: '张开手掌',
    symbol: '✋',
  },
  Thumb_Up: {
    action: 'review',
    actionLabel: '打开代码审查',
    gestureLabel: '竖起拇指',
    symbol: '👍',
  },
  ILoveYou: {
    action: 'terminal',
    actionLabel: '切换集成终端',
    gestureLabel: 'I Love You 手势',
    symbol: '🤟',
  },
  Closed_Fist: {
    action: 'sidebar',
    actionLabel: '切换任务侧栏',
    gestureLabel: '握拳',
    symbol: '✊',
  },
}

export interface GestureMachineState {
  awaitingNeutral: boolean
  candidate: GestureName | null
  candidateSince: number | null
  neutralSince: number | null
  progress: number
}

export interface GestureFrame {
  confidence: number
  name: string | null
  now: number
}

export interface GestureMachineResult {
  action: CodexAction | null
  binding: GestureBinding | null
  gesture: GestureName | null
  state: GestureMachineState
}

export const GESTURE_HOLD_MS = 850
export const GESTURE_RELEASE_MS = 360
export const GESTURE_SCORE_THRESHOLD = 0.72

export const initialGestureMachineState: GestureMachineState = {
  awaitingNeutral: false,
  candidate: null,
  candidateSince: null,
  neutralSince: null,
  progress: 0,
}

export function isGestureName(value: string): value is GestureName {
  return value in GESTURE_BINDINGS
}

export function advanceGestureMachine(
  current: GestureMachineState,
  frame: GestureFrame,
): GestureMachineResult {
  const recognized =
    frame.name &&
    frame.confidence >= GESTURE_SCORE_THRESHOLD &&
    isGestureName(frame.name)
      ? frame.name
      : null

  if (current.awaitingNeutral) {
    if (recognized) {
      return {
        action: null,
        binding: GESTURE_BINDINGS[recognized],
        gesture: null,
        state: {
          ...current,
          candidate: recognized,
          candidateSince: null,
          neutralSince: null,
          progress: 0,
        },
      }
    }

    const neutralSince = current.neutralSince ?? frame.now
    const released = frame.now - neutralSince >= GESTURE_RELEASE_MS
    return {
      action: null,
      binding: null,
      gesture: null,
      state: released
        ? { ...initialGestureMachineState }
        : { ...current, neutralSince, candidate: null, progress: 0 },
    }
  }

  if (!recognized) {
    return {
      action: null,
      binding: null,
      gesture: null,
      state: { ...initialGestureMachineState },
    }
  }

  if (current.candidate !== recognized || current.candidateSince === null) {
    return {
      action: null,
      binding: GESTURE_BINDINGS[recognized],
      gesture: null,
      state: {
        ...initialGestureMachineState,
        candidate: recognized,
        candidateSince: frame.now,
      },
    }
  }

  const progress = Math.min(
    1,
    (frame.now - current.candidateSince) / GESTURE_HOLD_MS,
  )
  const binding = GESTURE_BINDINGS[recognized]

  if (progress < 1) {
    return {
      action: null,
      binding,
      gesture: null,
      state: { ...current, progress },
    }
  }

  return {
    action: binding.action,
    binding,
    gesture: recognized,
    state: {
      awaitingNeutral: true,
      candidate: recognized,
      candidateSince: null,
      neutralSince: null,
      progress: 1,
    },
  }
}
