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

export const WINDOWS_ACTIONS = [
  'switch_window',
  'switch_window_back',
  'minimize_active_window',
  'maximize_active_window',
  'show_desktop',
  'task_view',
  'open_explorer',
  'volume_up',
  'volume_down',
  'volume_mute',
] as const
export type WindowsAction = (typeof WINDOWS_ACTIONS)[number]

export type GestureAction = CodexAction | WindowsAction
export type GestureMode = 'codex' | 'windows' | 'pointer'

export interface CodexActionResult {
  action: CodexAction
  message: string
  ok: boolean
}

export interface WindowsActionResult {
  action: WindowsAction
  message: string
  ok: boolean
}

export type GestureActionResult = CodexActionResult | WindowsActionResult

export interface GestureBinding {
  action: GestureAction | null
  actionLabel: string
  gestureLabel: string
  symbol: string
}

export const CODEX_GESTURE_BINDINGS: Record<GestureName, GestureBinding> = {
  Victory: {
    action: 'quick_chat',
    actionLabel: '打开快速对话',
    gestureLabel: '胜利手势',
    symbol: '✌',
  },
  Pointing_Up: {
    action: 'dictation',
    actionLabel: '激活 Codex 话筒',
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

export const WINDOWS_GESTURE_BINDINGS: Record<GestureName, GestureBinding> = {
  Victory: {
    action: 'switch_window',
    actionLabel: '切换到下一个窗口',
    gestureLabel: '胜利手势',
    symbol: '✌',
  },
  Pointing_Up: {
    action: 'task_view',
    actionLabel: '打开任务视图',
    gestureLabel: '食指向上',
    symbol: '☝',
  },
  Open_Palm: {
    action: 'show_desktop',
    actionLabel: '显示桌面',
    gestureLabel: '张开手掌',
    symbol: '✋',
  },
  Thumb_Up: {
    action: 'maximize_active_window',
    actionLabel: '最大化 / 还原当前窗口',
    gestureLabel: '竖起拇指',
    symbol: '👍',
  },
  ILoveYou: {
    action: 'switch_window_back',
    actionLabel: '切换回上一个窗口',
    gestureLabel: 'I Love You 手势',
    symbol: '🤟',
  },
  Closed_Fist: {
    action: 'minimize_active_window',
    actionLabel: '最小化当前窗口',
    gestureLabel: '握拳',
    symbol: '✊',
  },
}

export const POINTER_GESTURE_BINDINGS: Record<GestureName, GestureBinding> = {
  Victory: {
    action: null,
    actionLabel: '无固定动作',
    gestureLabel: '胜利手势',
    symbol: '✌',
  },
  Pointing_Up: {
    action: null,
    actionLabel: '移动指针',
    gestureLabel: '伸出食指',
    symbol: '☝',
  },
  Open_Palm: {
    action: null,
    actionLabel: '上下滚动',
    gestureLabel: '张开手掌并移动',
    symbol: '✋',
  },
  Thumb_Up: {
    action: null,
    actionLabel: '无固定动作',
    gestureLabel: '竖起拇指',
    symbol: '👍',
  },
  ILoveYou: {
    action: null,
    actionLabel: '无固定动作',
    gestureLabel: 'I Love You 手势',
    symbol: '🤟',
  },
  Closed_Fist: {
    action: null,
    actionLabel: '停止指针',
    gestureLabel: '握拳',
    symbol: '✊',
  },
}

// Backwards-compatible name used by the Codex task picker and existing tests.
export const GESTURE_BINDINGS = CODEX_GESTURE_BINDINGS

export function getGestureBindings(mode: GestureMode) {
  if (mode === 'windows') return WINDOWS_GESTURE_BINDINGS
  if (mode === 'pointer') return POINTER_GESTURE_BINDINGS
  return CODEX_GESTURE_BINDINGS
}

export function isWindowsAction(action: GestureAction): action is WindowsAction {
  // Speech commands remain Windows actions even without a fixed hand binding.
  return WINDOWS_ACTIONS.some((candidate) => candidate === action)
}

export interface GestureMachineState {
  awaitingNeutral: boolean
  candidate: GestureName | null
  candidateSince: number | null
  candidateSamples: number
  lastSampleAt: number | null
  neutralSince: number | null
  neutralSamples: number
  progress: number
}

export interface GestureFrame {
  confidence: number
  name: string | null
  now: number
}

export interface GestureMachineResult {
  action: GestureAction | null
  binding: GestureBinding | null
  gesture: GestureName | null
  state: GestureMachineState
}

export const GESTURE_HOLD_MS = 850
export const GESTURE_RELEASE_MS = 360
export const GESTURE_SCORE_THRESHOLD = 0.72
export const GESTURE_MAX_FRAME_GAP_MS = 350
export const GESTURE_MIN_HOLD_SAMPLES = 4
export const GESTURE_MIN_RELEASE_SAMPLES = 2

export const initialGestureMachineState: GestureMachineState = {
  awaitingNeutral: false,
  candidate: null,
  candidateSince: null,
  candidateSamples: 0,
  lastSampleAt: null,
  neutralSince: null,
  neutralSamples: 0,
  progress: 0,
}

export function isGestureName(value: string): value is GestureName {
  return Object.hasOwn(CODEX_GESTURE_BINDINGS, value)
}

export function advanceGestureMachine(
  current: GestureMachineState,
  frame: GestureFrame,
  bindings: Record<GestureName, GestureBinding> = CODEX_GESTURE_BINDINGS,
): GestureMachineResult {
  const timestampValid = Number.isFinite(frame.now)
  const previousTimestamp = current.lastSampleAt
  const elapsed = previousTimestamp === null ? null : frame.now - previousTimestamp
  const hasInvalidTimestamp =
    !timestampValid ||
    (elapsed !== null && (elapsed <= 0 || elapsed > GESTURE_MAX_FRAME_GAP_MS))

  if (hasInvalidTimestamp) {
    const state = current.awaitingNeutral
      ? {
          ...current,
          candidate: null,
          candidateSince: null,
          candidateSamples: 0,
          lastSampleAt: null,
          neutralSince: null,
          neutralSamples: 0,
          progress: 0,
        }
      : { ...initialGestureMachineState }
    return {
      action: null,
      binding: null,
      gesture: null,
      state,
    }
  }

  // A long gap breaks continuity. The invalid-timestamp branch above keeps
  // the neutral latch after a fired gesture so a stale frame cannot retrigger.
  const base = current
  const recognized =
    frame.name &&
    frame.confidence >= GESTURE_SCORE_THRESHOLD &&
    isGestureName(frame.name)
      ? frame.name
      : null

  if (base.awaitingNeutral) {
    if (recognized) {
      return {
        action: null,
        binding: bindings[recognized],
        gesture: null,
        state: {
          ...base,
          candidate: recognized,
          candidateSince: null,
          candidateSamples: 0,
          lastSampleAt: frame.now,
          neutralSince: null,
          neutralSamples: 0,
          progress: 0,
        },
      }
    }

    const neutralSince = base.neutralSince ?? frame.now
    const neutralSamples = base.neutralSince === null
      ? 1
      : base.neutralSamples + 1
    const released =
      frame.now - neutralSince >= GESTURE_RELEASE_MS &&
      neutralSamples >= GESTURE_MIN_RELEASE_SAMPLES
    return {
      action: null,
      binding: null,
      gesture: null,
      state: released
        ? { ...initialGestureMachineState }
        : {
            ...base,
            neutralSince,
            neutralSamples,
            candidate: null,
            candidateSamples: 0,
            lastSampleAt: frame.now,
            progress: 0,
          },
    }
  }

  if (!recognized) {
    return {
      action: null,
      binding: null,
      gesture: null,
      state: { ...initialGestureMachineState, lastSampleAt: frame.now },
    }
  }

  if (base.candidate !== recognized || base.candidateSince === null) {
    return {
      action: null,
      binding: bindings[recognized],
      gesture: null,
      state: {
        ...initialGestureMachineState,
        candidate: recognized,
        candidateSince: frame.now,
        candidateSamples: 1,
        lastSampleAt: frame.now,
      },
    }
  }

  const candidateSamples = base.candidateSamples + 1
  const progress = Math.min(1, (frame.now - base.candidateSince) / GESTURE_HOLD_MS)
  const binding = bindings[recognized]

  if (progress < 1 || candidateSamples < GESTURE_MIN_HOLD_SAMPLES) {
    return {
      action: null,
      binding,
      gesture: null,
      state: { ...base, candidateSamples, lastSampleAt: frame.now, progress },
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
      candidateSamples: 0,
      lastSampleAt: frame.now,
      neutralSince: null,
      neutralSamples: 0,
      progress: 1,
    },
  }
}
