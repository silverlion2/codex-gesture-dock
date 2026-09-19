// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoiceCommandEvent, VoiceControlStatus } from './lib/voiceControl'

const hooks = vi.hoisted(() => ({
  voiceCommand: null as ((event: VoiceCommandEvent) => void) | null,
  voiceStatus: null as ((status: VoiceControlStatus) => void) | null,
  startMonitorSession: vi.fn(async () => true),
}))
const Stub = vi.hoisted(() => () => null)

vi.mock('./hooks/useMediaDevices', () => ({
  useMediaDevices: () => ({ videoInputs: [], audioInputs: [], refreshDevices: vi.fn() }),
}))
vi.mock('./hooks/useAudioInput', () => ({
  useAudioInput: () => ({ phase: 'idle', level: 0, error: '', start: vi.fn(), stop: vi.fn() }),
}))
vi.mock('./hooks/useCodeScanner', () => ({
  useCodeScanner: () => ({ phase: 'idle', result: null, error: '', clearResult: vi.fn() }),
}))
vi.mock('./hooks/usePoseMonitor', () => ({
  usePoseMonitor: () => ({
    phase: 'idle', postureActive: false, status: 'away', score: null,
    sessionSeconds: 0, awayCount: 0, trend: 'stable', error: '',
    calibrationProgress: 0, startSession: hooks.startMonitorSession,
    stopSession: vi.fn(), recalibrate: vi.fn(),
  }),
}))
vi.mock('./hooks/useGestureControl', () => ({
  useGestureControl: () => ({
    awaitingNeutral: false, binding: null, confidence: 0, error: '',
    gesture: null, modelPhase: 'idle', pointerActivity: 'idle', progress: 0,
  }),
}))
vi.mock('./hooks/useMinimalGestureReadiness', () => ({
  useMinimalGestureReadiness: () => {},
}))

vi.mock('./components/CodexApprovalPanel', () => ({ CodexApprovalPanel: Stub }))
vi.mock('./components/CodexIntegrationPanel', () => ({ CodexIntegrationPanel: Stub }))
vi.mock('./components/CompactCamera', () => ({ CompactCamera: Stub }))
vi.mock('./components/CameraModeSwitcher', () => ({ CameraModeSwitcher: Stub }))
vi.mock('./components/GestureBook', () => ({ GestureBook: Stub }))
vi.mock('./components/FloatingButton', () => ({ FloatingButton: Stub }))
vi.mock('./components/MiniCameraControls', () => ({ MiniCameraControls: Stub }))
vi.mock('./components/WidgetMetrics', () => ({ WidgetMetrics: Stub }))
vi.mock('./components/WidgetSettings', () => ({ WidgetSettings: Stub }))
vi.mock('./components/MediaInputControls', () => ({
  CompactMediaControls: Stub,
  MediaInputPanel: Stub,
}))
vi.mock('./components/TaskPicker', () => ({ TaskPicker: Stub }))

import App from './App'

function controlsFixture() {
  const status = {
    enabled: false,
    supported: true,
    phase: 'off',
    culture: '',
    recognizer: '',
    message: '语音命令已关闭',
  }
  return {
    isElectron: true,
    getState: vi.fn(async () => true),
    setExpanded: vi.fn(async (value) => value),
    getViewMode: vi.fn(async () => 'expanded'),
    setViewMode: vi.fn(async (value) => value),
    close: vi.fn(async () => true),
    openTaskPicker: vi.fn(async () => true),
    closeTaskPicker: vi.fn(async () => true),
    sendTaskPickerGesture: vi.fn(async () => true),
    showMessage: vi.fn(async () => true),
    runCodexAction: vi.fn(async (action) => ({ ok: true, action, message: 'codex ok' })),
    runWindowsAction: vi.fn(async (action) => ({ ok: true, action, message: `完成 ${action}` })),
    setPointerControlEnabled: vi.fn(async () => ({ enabled: true, message: 'pointer ok' })),
    sendPointerCommand: vi.fn(),
    getVoiceControlStatus: vi.fn(async () => status),
    setVoiceControlEnabled: vi.fn(async (enabled) => ({
      ...status, enabled, phase: enabled ? 'listening' : 'off',
      culture: enabled ? 'zh-CN' : '', message: enabled ? '正在监听' : '语音命令已关闭',
    })),
    getUpdateStatus: vi.fn(async () => ({ supported: false, phase: 'unsupported', message: '' })),
    checkForUpdates: vi.fn(async () => ({ supported: false, phase: 'unsupported', message: '' })),
    installUpdate: vi.fn(async () => true),
    getCodexIntegrationStatus: vi.fn(async () => ({ control: { enabled: true } })),
    inspectCodexUi: vi.fn(async () => ({})),
    setWindowsControlEnabled: vi.fn(async (enabled) => ({ enabled, message: enabled ? '恢复' : '暂停' })),
    bindCodexTask: vi.fn(), listCodexTasks: vi.fn(), listRecentCodexFiles: vi.fn(),
    openRecentCodexFile: vi.fn(), runCodexTaskAction: vi.fn(),
    getPendingCodexApprovals: vi.fn(async () => []), respondCodexApproval: vi.fn(),
    onCodexApprovalRequest: vi.fn(() => () => {}), onCodexApprovalsCleared: vi.fn(() => () => {}),
    onCodexRuntimeEvent: vi.fn(() => () => {}), onCodexIntegrationChanged: vi.fn(() => () => {}),
    onWindowsControlEvent: vi.fn(() => () => {}),
    onVoiceCommand: vi.fn((callback: (event: VoiceCommandEvent) => void) => { hooks.voiceCommand = callback; return () => {} }),
    onVoiceControlStatus: vi.fn((callback: (status: VoiceControlStatus) => void) => { hooks.voiceStatus = callback; return () => {} }),
    onUpdateStatus: vi.fn(() => () => {}), onStateChange: vi.fn(() => () => {}),
    onViewModeChange: vi.fn(() => () => {}), onTaskPickerStateChange: vi.fn(() => () => {}),
    onTaskPickerGesture: vi.fn(() => () => {}), onMessage: vi.fn(() => () => {}),
  }
}

describe('App voice command routing', () => {
  afterEach(() => {
    cleanup()
    delete window.widgetControls
    localStorage.clear()
  })

  beforeEach(() => {
    hooks.voiceCommand = null
    hooks.voiceStatus = null
    hooks.startMonitorSession.mockClear()
    window.history.replaceState({}, '', '/?view=widget')
  })

  it('routes Windows voice actions, pause, minimize, and gesture startup through callbacks', async () => {
    const controls = controlsFixture()
    window.widgetControls = controls as unknown as NonNullable<Window['widgetControls']>
    render(<App />)
    await waitFor(() => expect(hooks.voiceCommand).toBeTypeOf('function'))

    hooks.voiceCommand?.({ action: 'switch_window', phrase: '助手 切换窗口', confidence: 1, timestamp: 1 })
    await waitFor(() => expect(controls.runWindowsAction).toHaveBeenCalledWith('switch_window'))
    expect(await screen.findByText('完成 switch_window')).toBeTruthy()
    hooks.voiceCommand?.({ action: 'pause_windows_control', phrase: '助手 暂停控制', confidence: 1, timestamp: 2 })
    await waitFor(() => expect(controls.setWindowsControlEnabled).toHaveBeenCalledWith(false))
    hooks.voiceCommand?.({ action: 'minimize_window', phrase: '助手 缩小悬浮窗', confidence: 1, timestamp: 3 })
    await waitFor(() => expect(controls.setViewMode).toHaveBeenCalledWith('minimal'))
    expect(screen.getByRole('main').className).toContain('is-minimal')
    hooks.voiceCommand?.({ action: 'start_windows_gestures', phrase: '助手 开启手势', confidence: 1, timestamp: 4 })
    await waitFor(() => expect(controls.setWindowsControlEnabled).toHaveBeenCalledWith(true))
    expect(hooks.startMonitorSession).toHaveBeenCalledWith(undefined, { posture: false })
  })

  it('keeps voice opt-in, routes header enable, and surfaces status errors', async () => {
    const controls = controlsFixture()
    window.widgetControls = controls as unknown as NonNullable<Window['widgetControls']>
    render(<App />)
    const toggle = await screen.findByRole('button', { name: '开启语音控制' })
    fireEvent.click(toggle)
    await waitFor(() => expect(controls.setVoiceControlEnabled).toHaveBeenCalledWith(true))
    hooks.voiceStatus?.({ enabled: false, supported: true, phase: 'error', culture: '', recognizer: '', message: '语音识别失败' })
    expect(await screen.findByText('语音识别失败')).toBeTruthy()
  })

  it('makes posture an explicit opt-in independent of Windows hands', async () => {
    const controls = controlsFixture()
    window.widgetControls = controls as unknown as NonNullable<Window['widgetControls']>
    render(<App />)
    await waitFor(() => expect(hooks.voiceCommand).toBeTypeOf('function'))
    expect(screen.queryByText('食指手势激活话筒')).toBeNull()
    expect(screen.queryByLabelText('当前坐姿状态')).toBeNull()
    expect(hooks.startMonitorSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('可选功能：坐姿提醒'))
    fireEvent.click(screen.getByRole('button', { name: '开启坐姿提醒并校准' }))
    expect(hooks.startMonitorSession).toHaveBeenCalledWith(undefined, { posture: true })
    hooks.startMonitorSession.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '一键启动极简 Windows 桌面手势控制' }))
    await waitFor(() => expect(hooks.startMonitorSession).toHaveBeenCalledWith(undefined, { posture: false }))
  })
})
