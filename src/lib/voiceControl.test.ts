import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  EN_VOICE_COMMANDS,
  ZH_VOICE_COMMANDS,
  voiceControlSummary,
  type VoiceControlStatus,
} from './voiceControl'

describe('fixed voice grammar', () => {
  it('matches the actual Windows helper grammar in both languages', () => {
    const source = readFileSync('electron/windows-voice-control.ps1', 'utf8')
    const chinese = Array.from(source.matchAll(/\$commands\[\(U '([^']+)'\)\]/g),
      (match) => match[1].replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))))
    const english = Array.from(source.matchAll(/'((?:codex )[^']+)' = /g), (match) => match[1].toLowerCase())
    expect(chinese).toEqual([...ZH_VOICE_COMMANDS])
    expect(english).toEqual(EN_VOICE_COMMANDS.map((phrase) => phrase.toLowerCase()))
  })
  it('keeps the complete 25-command Chinese and English contracts', () => {
    expect(ZH_VOICE_COMMANDS).toHaveLength(25)
    expect(EN_VOICE_COMMANDS).toHaveLength(25)
    for (const phrase of [
      '助手 切换窗口', '助手 上一个窗口', '助手 最小化窗口',
      '助手 最大化窗口', '助手 暂停控制', '助手 开启手势',
    ]) expect(ZH_VOICE_COMMANDS).toContain(phrase)
    for (const phrase of [
      'Codex switch window', 'Codex previous window', 'Codex minimize window',
      'Codex maximize window', 'Codex pause Windows control', 'Codex start Windows gestures',
    ]) expect(EN_VOICE_COMMANDS).toContain(phrase)
    expect(ZH_VOICE_COMMANDS).toContain('助手 缩小悬浮窗')
    expect(EN_VOICE_COMMANDS).toContain('Codex shrink widget')
  })

  it('uses an explicit Windows-safe listening example', () => {
    const status: VoiceControlStatus = {
      enabled: true, supported: true, phase: 'listening', culture: 'zh-CN',
      recognizer: 'test', message: 'ready',
    }
    expect(voiceControlSummary(status)).toContain('助手 切换窗口')
  })
})
