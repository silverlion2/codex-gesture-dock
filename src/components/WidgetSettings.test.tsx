// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WidgetSettings } from './WidgetSettings'

const settings = {
  postureEnabled: true,
  sensitivity: 'medium' as const,
  breakEnabled: true,
  breakMinutes: 50,
  gestureEnabled: true,
}

describe('WidgetSettings voice commands', () => {
  it('keeps voice commands visibly opt-in and reports listening state', () => {
    const onVoiceEnabledChange = vi.fn()
    const { rerender } = render(
      <WidgetSettings
        settings={settings}
        gestureMode="codex"
        voiceStatus={{
          enabled: false,
          supported: true,
          phase: 'off',
          culture: '',
          recognizer: '',
          message: '语音命令已关闭',
        }}
        onChange={vi.fn()}
        onGestureModeChange={vi.fn()}
        onVoiceEnabledChange={onVoiceEnabledChange}
      />,
    )

    const toggle = screen.getByRole('switch', { name: '本机语音命令' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('本次启动关闭')).toBeTruthy()
    fireEvent.click(toggle)
    expect(onVoiceEnabledChange).toHaveBeenCalledWith(true)

    rerender(
      <WidgetSettings
        settings={settings}
        gestureMode="codex"
        voiceStatus={{
          enabled: true,
          supported: true,
          phase: 'listening',
          culture: 'zh-CN',
          recognizer: 'Windows Speech',
          message: '正在监听固定语音命令（zh-CN）',
        }}
        onChange={vi.fn()}
        onGestureModeChange={vi.fn()}
        onVoiceEnabledChange={onVoiceEnabledChange}
      />,
    )
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('监听中 · 说“助手 打开任务”')).toBeTruthy()
    fireEvent.click(screen.getByText('查看固定语音口令（19）'))
    expect(screen.getByText('助手 开始监测')).toBeTruthy()
    expect(screen.getByText('Codex disable voice')).toBeTruthy()
  })

  it('exposes unavailable recognizer guidance as an alert', () => {
    render(
      <WidgetSettings
        settings={settings}
        gestureMode="codex"
        voiceStatus={{
          enabled: false,
          supported: false,
          phase: 'unavailable',
          culture: '',
          recognizer: '',
          message: '请安装语音语言包',
        }}
        onChange={vi.fn()}
        onGestureModeChange={vi.fn()}
        onVoiceEnabledChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('缺少兼容语音语言包')
  })
})
