import type { GestureAction } from './gestures'

export type VoiceControlPhase =
  | 'off'
  | 'starting'
  | 'listening'
  | 'unavailable'
  | 'error'

export type VoiceCommandAction =
  | GestureAction
  | 'open_task_picker'
  | 'start_monitoring'
  | 'stop_monitoring'
  | 'minimize_window'
  | 'restore_window'
  | 'disable_voice_commands'

export interface VoiceControlStatus {
  enabled: boolean
  supported: boolean
  phase: VoiceControlPhase
  culture: string
  recognizer: string
  message: string
}

export interface VoiceCommandEvent {
  action: VoiceCommandAction
  phrase: string
  confidence: number
  timestamp: number
}

export const initialVoiceControlStatus: VoiceControlStatus = {
  enabled: false,
  supported: true,
  phase: 'off',
  culture: '',
  recognizer: '',
  message: '语音命令已关闭',
}

export const ZH_VOICE_COMMANDS = [
  '助手 打开对话',
  '助手 开始听写',
  '助手 打开命令',
  '助手 代码审查',
  '助手 切换终端',
  '助手 切换侧栏',
  '助手 搜索任务',
  '助手 打开任务',
  '助手 开始监测',
  '助手 停止监测',
  '助手 最小化窗口',
  '助手 恢复窗口',
  '助手 显示桌面',
  '助手 任务视图',
  '助手 打开资源管理器',
  '助手 音量增大',
  '助手 音量减小',
  '助手 静音',
  '助手 关闭语音',
] as const

export const EN_VOICE_COMMANDS = [
  'Codex open quick chat',
  'Codex start dictation',
  'Codex open command menu',
  'Codex review code',
  'Codex switch terminal',
  'Codex toggle sidebar',
  'Codex search tasks',
  'Codex open tasks',
  'Codex start monitoring',
  'Codex stop monitoring',
  'Codex minimize window',
  'Codex restore window',
  'Codex show desktop',
  'Codex task view',
  'Codex open explorer',
  'Codex volume up',
  'Codex volume down',
  'Codex mute volume',
  'Codex disable voice',
] as const

export function voiceControlSummary(status: VoiceControlStatus) {
  if (status.phase === 'listening') {
    return status.culture.startsWith('zh')
      ? '监听中 · 说“助手 打开任务”'
      : 'Listening · say “Codex open tasks”'
  }
  if (status.phase === 'starting') return '正在启动本机识别器'
  if (status.phase === 'unavailable') return '缺少兼容语音语言包'
  if (status.phase === 'error') return '语音命令启动失败'
  return '本次启动关闭'
}
