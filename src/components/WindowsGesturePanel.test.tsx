// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { afterEach } from 'vitest'
import type { GestureViewState } from '../hooks/useGestureControl'
import { initialVoiceControlStatus, type VoiceControlStatus } from '../lib/voiceControl'
import { WindowsGesturePanel } from './WindowsGesturePanel'

const gesture: GestureViewState = {
  awaitingNeutral: false,
  binding: null,
  confidence: 0,
  error: '',
  gesture: null,
  modelPhase: 'idle',
  progress: 0,
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof WindowsGesturePanel>> = {}) {
  const props: React.ComponentProps<typeof WindowsGesturePanel> = {
    gesture,
    gestureEnabled: true,
    cameraActive: false,
    starting: false,
    paused: false,
    controlBusy: false,
    desktopAvailable: true,
    feedback: null,
    voice: initialVoiceControlStatus,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onPause: vi.fn(),
    onVoiceToggle: vi.fn(),
    onModeChange: vi.fn(),
    ...overrides,
  }
  return { ...render(<WindowsGesturePanel {...props} />), props }
}

describe('WindowsGesturePanel', () => {
  afterEach(cleanup)

  it('invokes startup and changes the primary label when the camera is active', () => {
    const onStart = vi.fn()
    const { rerender, props } = renderPanel({ onStart })

    fireEvent.click(screen.getByRole('button', { name: '一键启动极简 Windows 桌面手势控制' }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '一键启动极简 Windows 桌面手势控制' }).textContent).toContain('启动手势 · 进入悬浮球')

    rerender(<WindowsGesturePanel {...props} cameraActive />)
    expect(screen.getByRole('button', { name: '一键启动极简 Windows 桌面手势控制' }).textContent).toContain('进入手势悬浮球')
  })

  it('offers cancel during startup and stop when the camera is active', () => {
    const onStop = vi.fn()
    const { rerender, props } = renderPanel({ starting: true, onStop })

    fireEvent.click(screen.getByRole('button', { name: '取消启动' }))
    expect(onStop).toHaveBeenCalledOnce()

    rerender(<WindowsGesturePanel {...props} starting={false} cameraActive />)
    fireEvent.click(screen.getByRole('button', { name: '关闭摄像头' }))
    expect(onStop).toHaveBeenCalledTimes(2)
  })

  it('reflects pause state and invokes the pause callback', () => {
    const onPause = vi.fn()
    const { rerender, props } = renderPanel({ onPause })

    fireEvent.click(screen.getByRole('button', { name: '暂停桌面控制' }))
    expect(onPause).toHaveBeenCalledOnce()
    expect(screen.getByText('暂停后不执行窗口动作，摄像头仍可运行')).toBeTruthy()

    rerender(<WindowsGesturePanel {...props} paused />)
    expect(screen.getByRole('button', { name: '恢复桌面控制' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('已暂停 · 手势不会操作窗口')).toBeTruthy()
  })

  it('supports voice opt-in and disables the toggle while starting', () => {
    const onVoiceToggle = vi.fn()
    const listeningVoice: VoiceControlStatus = {
      ...initialVoiceControlStatus,
      enabled: true,
      phase: 'listening',
      message: '正在监听唤醒词',
    }
    const { rerender, props } = renderPanel({ onVoiceToggle })

    fireEvent.click(screen.getByRole('button', { name: '开启语音控制' }))
    expect(onVoiceToggle).toHaveBeenCalledOnce()

    rerender(
      <WindowsGesturePanel
        {...props}
        voice={{ ...listeningVoice, phase: 'starting', message: '正在启动语音识别' }}
      />,
    )
    expect((screen.getByRole('button', { name: '关闭语音控制' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('正在启动语音识别')).toBeTruthy()
  })

  it('reports mode changes and unavailable desktop preview', () => {
    const onModeChange = vi.fn()
    renderPanel({ desktopAvailable: false, onModeChange })

    expect(screen.getByText('网页仅供查看界面；操作系统窗口请使用 Windows 桌面版。')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: '控制模式' }), {
      target: { value: 'pointer' },
    })
    expect(onModeChange).toHaveBeenCalledWith('pointer')
  })

  it('shows successful and failed desktop action feedback', () => {
    const { rerender, props } = renderPanel({
      feedback: { ok: true, message: '已切换到下一个窗口' },
    })
    expect(screen.getByText('执行结果：已切换到下一个窗口')).toBeTruthy()

    rerender(
      <WindowsGesturePanel
        {...props}
        feedback={{ ok: false, message: 'Windows 控制桥暂时不可用' }}
      />,
    )
    expect(screen.getByText('未执行：Windows 控制桥暂时不可用')).toBeTruthy()
  })
})
