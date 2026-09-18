import {
  Armchair,
  Camera,
  ChevronDown,
  Hand,
  ListTodo,
  Maximize2,
  Mic,
  Minimize2,
  PauseCircle,
  PlayCircle,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { CodexApprovalPanel } from './components/CodexApprovalPanel'
import { CodexIntegrationPanel } from './components/CodexIntegrationPanel'
import { CompactCamera } from './components/CompactCamera'
import { CameraModeSwitcher } from './components/CameraModeSwitcher'
import { GestureBook } from './components/GestureBook'
import { FloatingButton } from './components/FloatingButton'
import {
  CompactMediaControls,
  MediaInputPanel,
} from './components/MediaInputControls'
import { MiniCameraControls } from './components/MiniCameraControls'
import { TaskPicker, type TaskPickerHandle } from './components/TaskPicker'
import { WidgetMetrics } from './components/WidgetMetrics'
import { WidgetSettings } from './components/WidgetSettings'
import { useGestureControl } from './hooks/useGestureControl'
import { useAudioInput } from './hooks/useAudioInput'
import { useCodeScanner } from './hooks/useCodeScanner'
import { useMediaDevices } from './hooks/useMediaDevices'
import {
  usePoseMonitor,
  type ReminderSettings,
} from './hooks/usePoseMonitor'
import {
  getGestureBindings,
  isWindowsAction,
  type CodexAction,
  type CodexActionResult,
  type GestureAction,
  type GestureActionResult,
  type GestureMode,
  type GestureName,
} from './lib/gestures'
import type {
  CodexApprovalDecision,
  CodexApprovalRequest,
} from './lib/codexApprovals'
import type { CodexIntegrationStatus } from './lib/codexIntegration'
import type { AppUpdateStatus } from './lib/appUpdate'
import { useMinimalGestureReadiness } from './hooks/useMinimalGestureReadiness'
import { loadGestureMode, saveGestureMode } from './lib/gesturePreferences'
import type { WidgetViewMode } from './electron'
import type { CameraMode } from './lib/cameraTools'
import type { FaceMaskStyle } from './lib/faceMasks'
import {
  shouldEnableAirPointer,
  type PointerCommand,
} from './lib/pointerGestures'
import {
  initialVoiceControlStatus,
  type VoiceCommandEvent,
  type VoiceControlStatus,
} from './lib/voiceControl'
import {
  loadMediaPreferences,
  saveMediaPreferences,
  type CameraFraming,
} from './lib/mediaPreferences'

const CameraToolPanel = lazy(() => import('./components/CameraToolPanel'))
const FacePrivacyPanel = lazy(() =>
  import('./components/FacePrivacyPanel').then((module) => ({
    default: module.FacePrivacyPanel,
  })),
)
const FaceMaskPanel = lazy(() =>
  import('./components/FaceMaskPanel').then((module) => ({
    default: module.FaceMaskPanel,
  })),
)
const BackgroundToolPanel = lazy(() =>
  import('./components/BackgroundToolPanel').then((module) => ({
    default: module.BackgroundToolPanel,
  })),
)
const ObjectDetectionPanel = lazy(() =>
  import('./components/ObjectDetectionPanel').then((module) => ({
    default: module.ObjectDetectionPanel,
  })),
)
const OcrToolPanel = lazy(() =>
  import('./components/OcrToolPanel').then((module) => ({
    default: module.OcrToolPanel,
  })),
)
const ImageComparisonPanel = lazy(() =>
  import('./components/ImageComparisonPanel').then((module) => ({
    default: module.ImageComparisonPanel,
  })),
)
const ColorAnalysisPanel = lazy(() =>
  import('./components/ColorAnalysisPanel').then((module) => ({
    default: module.ColorAnalysisPanel,
  })),
)

const toolLoadingFallback = (
  <div className="tool-empty-state" role="status">
    正在加载本机工具
  </div>
)

const initialSettings: ReminderSettings = {
  postureEnabled: true,
  sensitivity: 'medium',
  breakEnabled: true,
  breakMinutes: 50,
  gestureEnabled: true,
}

function initialWidgetViewMode(): WidgetViewMode {
  const requestedMode = new URLSearchParams(window.location.search).get('widget')
  if (requestedMode === 'minimal' || requestedMode === 'collapsed') {
    return requestedMode
  }
  return 'expanded'
}

function initialApprovalQueue(): CodexApprovalRequest[] {
  if (!import.meta.env.DEV || window.widgetControls) return []
  const mock = new URLSearchParams(window.location.search).get('mockApproval')
  if (mock !== 'command' && mock !== 'file') return []
  return [
    {
      id: 'mock-approval',
      kind: mock,
      title:
        mock === 'command'
          ? '允许 Codex 执行命令？'
          : '允许 Codex 修改文件？',
      detail:
        mock === 'command'
          ? 'npm test -- --runInBand'
          : '更新 src/components/TaskPicker.tsx',
      context: 'D:\\workspace\\codex-gesture-dock',
      reason: '开发预览：验证逐次审批界面',
      threadId: 'mock-thread',
      turnId: 'mock-turn',
    },
  ]
}

function WidgetApp() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const toastTimerRef = useRef<number | null>(null)
  const microphoneTimerRef = useRef<number | null>(null)
  const desktopActionTimerRef = useRef<number | null>(null)
  const minimalWindowsStartRef = useRef(false)
  const [viewMode, setViewMode] = useState(initialWidgetViewMode)
  const [settings, setSettings] = useState(initialSettings)
  const [cameraMode, setCameraMode] = useState<CameraMode>('monitor')
  const [faceMaskStyle, setFaceMaskStyle] = useState<FaceMaskStyle>('fox')
  const [mediaPreferences, setMediaPreferences] = useState(loadMediaPreferences)
  const [gestureMode, setGestureMode] = useState<GestureMode>(loadGestureMode)
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)
  const [approvalQueue, setApprovalQueue] =
    useState<CodexApprovalRequest[]>(initialApprovalQueue)
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [codexMicrophoneActive, setCodexMicrophoneActive] = useState(false)
  const [integrationStatus, setIntegrationStatus] =
    useState<CodexIntegrationStatus | null>(null)
  const [windowsControlBusy, setWindowsControlBusy] = useState(false)
  const [minimalWindowsStarting, setMinimalWindowsStarting] = useState(false)
  const [minimalWindowsPending, setMinimalWindowsPending] = useState(false)
  const [desktopActionFeedback, setDesktopActionFeedback] = useState<{
    message: string
    ok: boolean
  } | null>(null)
  const [pointerControlReady, setPointerControlReady] = useState(false)
  const minimalWindowsPendingRef = useRef(false)
  const lastActionToastRef = useRef<{ key: string; until: number }>({
    key: '',
    until: 0,
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<VoiceControlStatus>(
    initialVoiceControlStatus,
  )
  const currentApproval = approvalQueue[0] ?? null
  const expanded = viewMode === 'expanded'
  const screenUsageMinimized = viewMode === 'minimal'

  const showReminder = useCallback((message: string) => {
    setToast(message)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 5_000)
  }, [])

  const showActionReminder = useCallback(
    (action: string, ok: boolean, message: string) => {
      const key = `${action}:${ok}:${message}`
      if (
        lastActionToastRef.current.key === key &&
        Date.now() <= lastActionToastRef.current.until
      ) {
        return
      }
      lastActionToastRef.current = { key, until: Date.now() + 1_500 }
      setDesktopActionFeedback({ message, ok })
      if (desktopActionTimerRef.current !== null) {
        window.clearTimeout(desktopActionTimerRef.current)
      }
      desktopActionTimerRef.current = window.setTimeout(
        () => setDesktopActionFeedback(null),
        1_500,
      )
      showReminder(message)
    },
    [showReminder],
  )

  const changeViewMode = useCallback((nextMode: WidgetViewMode) => {
    setViewMode(nextMode)
    if (nextMode !== 'expanded') {
      setTaskPickerOpen(false)
      void window.widgetControls?.closeTaskPicker().catch(() => {})
    }
    void window.widgetControls?.setViewMode(nextMode).catch(() => {})
  }, [])

  const { videoInputs, audioInputs, refreshDevices } = useMediaDevices()
  const {
    phase: audioPhase,
    level: audioLevel,
    error: audioError,
    start: startAudioInput,
    stop: stopAudioInput,
  } = useAudioInput({
    deviceId: mediaPreferences.audioDeviceId,
    meterActive: !screenUsageMinimized,
    onActivated: refreshDevices,
  })

  const refreshIntegrationStatus = useCallback(async () => {
    const controls = window.widgetControls
    if (!controls) return
    try {
      setIntegrationStatus(await controls.getCodexIntegrationStatus())
    } catch {
      // Keep the last known state while the local App Server reconnects.
    }
  }, [])

  const setWindowsControlEnabled = useCallback(
    async (enabled: boolean) => {
      const controls = window.widgetControls
      if (!controls) return
      setWindowsControlBusy(true)
      try {
        const status = await controls.setWindowsControlEnabled(enabled)
        showActionReminder('windows-control', true,
          status.enabled
            ? 'Windows 桌面控制已恢复'
            : 'Windows 桌面控制已暂停',
        )
        await refreshIntegrationStatus()
      } catch (caught) {
        showActionReminder('windows-control', false,
          caught instanceof Error ? caught.message : 'Windows 控制状态切换失败',
        )
      } finally {
        setWindowsControlBusy(false)
      }
    },
    [refreshIntegrationStatus, showActionReminder],
  )

  const runUpdateAction = useCallback(async () => {
    const controls = window.widgetControls
    if (!controls || !updateStatus?.supported) return
    try {
      if (updateStatus.phase === 'downloaded') {
        await controls.installUpdate()
        return
      }
      const status = await controls.checkForUpdates()
      setUpdateStatus(status)
      showReminder(status.message)
    } catch (caught) {
      showReminder(caught instanceof Error ? caught.message : '检查更新失败')
    }
  }, [showReminder, updateStatus])

  const monitor = usePoseMonitor({
    videoRef,
    canvasRef,
    settings,
    videoDeviceId: mediaPreferences.videoDeviceId,
    onReminder: showReminder,
    renderOverlay: !screenUsageMinimized,
    resourceSaving: screenUsageMinimized || gestureMode === 'pointer',
  })
  const {
    phase: monitorPhase,
    startSession: startMonitorSession,
    stopSession: stopMonitorSession,
  } = monitor

  const codeScanner = useCodeScanner({
    active:
      !screenUsageMinimized &&
      cameraMode === 'codes' &&
      monitor.phase === 'monitoring',
    videoRef,
  })

  const runCodexAction = useCallback(
    async (action: CodexAction): Promise<CodexActionResult> => {
      const controls = window.widgetControls
      let result: CodexActionResult
      try {
        result = controls
          ? await controls.runCodexAction(action)
          : {
              ok: false,
              action,
              message: '请在 Windows 桌面版中使用 Codex 手势控制',
            }
      } catch (caught) {
        result = {
          ok: false,
          action,
          message:
            caught instanceof Error ? caught.message : 'Codex 控制桥暂时不可用',
        }
      }
      if (action === 'dictation') {
        setCodexMicrophoneActive(result.ok)
        if (microphoneTimerRef.current !== null) {
          window.clearTimeout(microphoneTimerRef.current)
        }
        if (result.ok) {
          microphoneTimerRef.current = window.setTimeout(
            () => setCodexMicrophoneActive(false),
            12_000,
          )
        }
      }
      showReminder(result.message)
      return result
    },
    [showReminder],
  )

  const runGestureAction = useCallback(
    async (action: GestureAction): Promise<GestureActionResult> => {
      if (!isWindowsAction(action)) return runCodexAction(action)
      const controls = window.widgetControls
      try {
        const result = controls
          ? await controls.runWindowsAction(action)
          : {
              ok: false as const,
              action,
              message: '请在 Windows 桌面版中使用系统手势控制',
            }
        showActionReminder(result.action, result.ok, result.message)
        return result
      } catch (caught) {
        const result = {
          ok: false as const,
          action,
          message:
            caught instanceof Error ? caught.message : 'Windows 控制桥暂时不可用',
        }
        showActionReminder(result.action, result.ok, result.message)
        return result
      }
    },
    [runCodexAction, showActionReminder],
  )

  const startMinimalWindowsControl = useCallback(async () => {
    if (minimalWindowsStartRef.current || minimalWindowsStarting) return
    if (!window.widgetControls) {
      showReminder('极简 Windows 手势控制仅在 Windows 桌面版中可用')
      return
    }
    minimalWindowsStartRef.current = true
    setMinimalWindowsStarting(true)
    setGestureMode('windows')
    setSettings((current) => ({ ...current, gestureEnabled: true }))
    setCameraMode('monitor')

    try {
      const controls = window.widgetControls
      if (controls) {
        const status = await controls.setWindowsControlEnabled(true)
        if (!status.enabled) throw new Error('Windows 桌面控制未能恢复')
        await refreshIntegrationStatus()
      }
      // Restart explicitly so a previous failed recognizer also gets a new
      // active lifecycle rather than remaining stuck in its fail-closed state.
      const started = await startMonitorSession(undefined, { posture: false })
      if (!started) {
        showReminder('摄像头启动失败或已取消，极简手势控制未启动')
        return
      }
      minimalWindowsPendingRef.current = true
      setMinimalWindowsPending(true)
    } catch (caught) {
      showReminder(
        caught instanceof Error ? caught.message : '极简桌面控制启动失败',
      )
    } finally {
      minimalWindowsStartRef.current = false
      if (!minimalWindowsPendingRef.current) setMinimalWindowsStarting(false)
    }
  }, [
    refreshIntegrationStatus,
    showReminder,
    minimalWindowsStarting,
    startMonitorSession,
  ])

  const openTaskPicker = useCallback(() => {
    changeViewMode('expanded')
    setTaskPickerOpen(true)
    const controls = window.widgetControls
    if (controls) {
      void controls.openTaskPicker().catch((caught) =>
        showReminder(
          caught instanceof Error ? caught.message : '任务选择窗口无法打开',
        ),
      )
      return
    }

    window.open(`${window.location.pathname}?view=tasks&mockTasks=1`, 'codex-tasks')
  }, [changeViewMode, showReminder])

  const setVoiceControlEnabled = useCallback(
    async (enabled: boolean) => {
      const controls = window.widgetControls
      if (!controls) {
        const status: VoiceControlStatus = {
          ...initialVoiceControlStatus,
          supported: false,
          phase: 'unavailable',
          message: '本机语音命令仅在 Windows 桌面版中可用',
        }
        setVoiceStatus(status)
        showReminder(status.message)
        return
      }
      try {
        const status = await controls.setVoiceControlEnabled(enabled)
        setVoiceStatus(status)
        showReminder(status.message)
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : '本机语音命令切换失败'
        setVoiceStatus((current) => ({
          ...current,
          enabled: false,
          phase: 'error',
          message,
        }))
        showReminder(message)
      }
    },
    [showReminder],
  )

  const handleVoiceCommand = useCallback(
    (command: VoiceCommandEvent) => {
      if (command.action === 'pause_windows_control') {
        void setWindowsControlEnabled(false)
        return
      }
      if (command.action === 'start_windows_gestures') {
        void startMinimalWindowsControl()
        return
      }
      if (command.action === 'open_task_picker') {
        openTaskPicker()
        showReminder('语音命令：已打开任务选择器')
        return
      }
      if (command.action === 'start_monitoring') {
        if (['loading', 'calibrating', 'monitoring'].includes(monitorPhase)) {
          showReminder('姿态监测已在运行')
          return
        }
        changeViewMode('expanded')
        showReminder('语音命令：正在启动姿态监测')
        void startMonitorSession()
        return
      }
      if (command.action === 'stop_monitoring') {
        if (!['loading', 'calibrating', 'monitoring'].includes(monitorPhase)) {
          showReminder('姿态监测尚未运行')
          return
        }
        stopMonitorSession()
        showReminder('语音命令：已停止姿态监测')
        return
      }
      if (command.action === 'minimize_window') {
        setSettingsOpen(false)
        changeViewMode('minimal')
        showReminder('语音命令：已切换为极简模式')
        return
      }
      if (command.action === 'restore_window') {
        changeViewMode('collapsed')
        showReminder('语音命令：已恢复小窗')
        return
      }
      if (command.action === 'disable_voice_commands') {
        void setVoiceControlEnabled(false)
        return
      }
      void runGestureAction(command.action)
    },
    [
      changeViewMode,
      monitorPhase,
      openTaskPicker,
      runGestureAction,
      setVoiceControlEnabled,
      setWindowsControlEnabled,
      startMinimalWindowsControl,
      showReminder,
      startMonitorSession,
      stopMonitorSession,
    ],
  )

  const respondCodexApproval = useCallback(
    async (decision: CodexApprovalDecision) => {
      const request = approvalQueue[0]
      const controls = window.widgetControls
      if (!request || approvalBusy) return
      if (!controls && import.meta.env.DEV && request.id === 'mock-approval') {
        showReminder(decision === 'accept' ? '已允许本次操作' : '已拒绝本次操作')
        setApprovalQueue([])
        return
      }
      if (!controls) return

      setApprovalBusy(true)
      try {
        const result = await controls.respondCodexApproval(request.id, decision)
        showReminder(result.message)
        setApprovalQueue((queue) =>
          queue.filter((item) => item.id !== request.id),
        )
      } catch (caught) {
        showReminder(
          caught instanceof Error ? caught.message : 'Codex 审批响应失败',
        )
        setApprovalQueue((queue) =>
          queue.filter((item) => item.id !== request.id),
        )
      } finally {
        setApprovalBusy(false)
      }
    },
    [approvalBusy, approvalQueue, showReminder],
  )

  const handleGesture = useCallback(
    (name: GestureName) => {
      if (currentApproval) {
        if (name === 'Thumb_Up') void respondCodexApproval('accept')
        if (name === 'Victory') void respondCodexApproval('decline')
        return true
      }
      if (taskPickerOpen) {
        void window.widgetControls?.sendTaskPickerGesture(name).catch(() => {})
        return true
      }
      if (gestureMode === 'codex' && name === 'Open_Palm') {
        openTaskPicker()
        return true
      }
      return false
    },
    [
      currentApproval,
      gestureMode,
      openTaskPicker,
      respondCodexApproval,
      taskPickerOpen,
    ],
  )

  const gestureBindings = getGestureBindings(gestureMode)
  const sendPointerCommand = useCallback((command: PointerCommand) => {
    if (!pointerControlReady) return
    window.widgetControls?.sendPointerCommand(command)
  }, [pointerControlReady])
  const airPointerEnabled = shouldEnableAirPointer({
    approvalPending: Boolean(currentApproval),
    cameraMode,
    gestureEnabled: settings.gestureEnabled,
    gestureMode,
    monitoring: monitor.phase === 'monitoring',
  })
  const gesture = useGestureControl({
    active: cameraMode === 'monitor' && monitor.phase === 'monitoring',
    bindings: gestureBindings,
    enabled: settings.gestureEnabled,
    onAction: runGestureAction,
    onGesture: handleGesture,
    onPointerCommand: sendPointerCommand,
    pointerMode: airPointerEnabled && pointerControlReady,
    videoRef,
  })

  const settleMinimalStartup = useCallback(() => {
    minimalWindowsPendingRef.current = false
    setMinimalWindowsPending(false)
    setMinimalWindowsStarting(false)
  }, [])
  const finishMinimalStartup = useCallback(() => {
    changeViewMode('minimal')
    showReminder('极简 Windows 手势控制已启动')
  }, [changeViewMode, showReminder])
  useMinimalGestureReadiness({
    pending: minimalWindowsPending,
    enabled: settings.gestureEnabled && cameraMode === 'monitor' && gestureMode === 'windows',
    cameraPhase: monitor.phase,
    cameraError: monitor.error,
    modelPhase: gesture.modelPhase,
    modelError: gesture.error,
    onSettled: settleMinimalStartup,
    onReady: finishMinimalStartup,
    onError: showReminder,
  })

  const pointerControlRequested = airPointerEnabled

  useEffect(() => {
    if (screenUsageMinimized && gesture.modelPhase === 'error') {
      changeViewMode('collapsed')
      showReminder(`手势识别已停止：${gesture.error || '请重新启动'}`)
    }
  }, [screenUsageMinimized, gesture.modelPhase, gesture.error, changeViewMode, showReminder])

  useEffect(() => {
    const controls = window.widgetControls
    if (!controls) {
      setPointerControlReady(false)
      return
    }
    let disposed = false
    setPointerControlReady(false)
    void controls.setPointerControlEnabled(pointerControlRequested)
      .then((status) => {
        if (!disposed) {
          setPointerControlReady(pointerControlRequested && status.enabled)
          if (pointerControlRequested && !status.enabled) {
            showReminder(status.message)
          }
        }
      })
      .catch((caught) => {
        if (!disposed && pointerControlRequested) {
          showReminder(
            caught instanceof Error ? caught.message : '空中鼠标控制桥暂时不可用',
          )
        }
      })
    return () => {
      disposed = true
      setPointerControlReady(false)
      if (pointerControlRequested) {
        void controls.setPointerControlEnabled(false).catch(() => {})
      }
    }
  }, [pointerControlRequested, showReminder])

  useEffect(() => {
    saveGestureMode(gestureMode)
  }, [gestureMode])

  useEffect(() => {
    saveMediaPreferences(mediaPreferences)
  }, [mediaPreferences])

  useEffect(() => {
    if (monitor.phase === 'calibrating' || monitor.phase === 'monitoring') {
      void refreshDevices()
    }
  }, [monitor.phase, refreshDevices])

  useEffect(() => {
    if (
      mediaPreferences.videoDeviceId &&
      videoInputs.length > 0 &&
      !videoInputs.some(
        (device) => device.deviceId === mediaPreferences.videoDeviceId,
      )
    ) {
      setMediaPreferences((current) => ({ ...current, videoDeviceId: '' }))
    }
  }, [mediaPreferences.videoDeviceId, videoInputs])

  useEffect(() => {
    if (
      mediaPreferences.audioDeviceId &&
      audioInputs.length > 0 &&
      !audioInputs.some(
        (device) => device.deviceId === mediaPreferences.audioDeviceId,
      )
    ) {
      if (audioPhase === 'active' || audioPhase === 'loading') {
        stopAudioInput()
      }
      setMediaPreferences((current) => ({ ...current, audioDeviceId: '' }))
      showReminder('所选麦克风已断开，已关闭音频输入')
    }
  }, [
    audioPhase,
    audioInputs,
    mediaPreferences.audioDeviceId,
    showReminder,
    stopAudioInput,
  ])

  useEffect(() => {
    const controls = window.widgetControls
    document.documentElement.classList.toggle('electron-runtime', Boolean(controls))
    if (!controls) return

    const enqueueApproval = (request: CodexApprovalRequest) => {
      setApprovalQueue((queue) =>
        queue.some((item) => item.id === request.id) ? queue : [...queue, request],
      )
      setTaskPickerOpen(false)
      void controls.closeTaskPicker().catch(() => {})
      changeViewMode('expanded')
    }

    void controls.getViewMode().then(setViewMode).catch(() => {})
    void refreshIntegrationStatus()
    void controls.getUpdateStatus().then(setUpdateStatus).catch(() => {})
    void controls.getVoiceControlStatus().then(setVoiceStatus).catch(() => {})
    void controls
      .getPendingCodexApprovals()
      .then((requests) => requests.forEach(enqueueApproval))
      .catch(() => {})
    const removeViewModeListener = controls.onViewModeChange(setViewMode)
    const removeTaskPickerListener = controls.onTaskPickerStateChange(setTaskPickerOpen)
    const removeMessageListener = controls.onMessage(showReminder)
    const removeApprovalListener = controls.onCodexApprovalRequest(enqueueApproval)
    const removeClearListener = controls.onCodexApprovalsCleared(() =>
      setApprovalQueue([]),
    )
    const removeRuntimeListener = controls.onCodexRuntimeEvent(() => {
      void refreshIntegrationStatus()
    })
    const removeIntegrationListener = controls.onCodexIntegrationChanged(() => {
      void refreshIntegrationStatus()
    })
    const removeWindowsListener = controls.onWindowsControlEvent((event) => {
      const isActionEvent =
        event.kind === 'action' ||
        event.type === 'action' ||
        (typeof event.action === 'string' && typeof event.ok === 'boolean')
      if (isActionEvent && event.action) {
        const message = event.message ||
          (event.ok ? `已完成 Windows 动作：${event.action}` : `Windows 动作失败：${event.action}`)
        if (event.programId === 'windows' || !event.programId) {
          showActionReminder(event.action, Boolean(event.ok), message)
        }
      }
      if (!isActionEvent) void refreshIntegrationStatus()
    })
    const removeVoiceCommandListener = controls.onVoiceCommand(handleVoiceCommand)
    const removeVoiceStatusListener = controls.onVoiceControlStatus((status) => {
      setVoiceStatus(status)
      if (status.phase === 'error' || status.phase === 'unavailable') {
        changeViewMode('collapsed')
      }
      if (
        status.phase === 'listening' ||
        status.phase === 'unavailable' ||
        status.phase === 'error'
      ) {
        showReminder(status.message)
      }
    })
    const removeUpdateListener = controls.onUpdateStatus((status) => {
      setUpdateStatus(status)
      if (status.phase === 'available' || status.phase === 'downloaded') {
        showReminder(status.message)
      }
    })
    const integrationTimer = window.setInterval(
      () => void refreshIntegrationStatus(),
      8_000,
    )
    return () => {
      removeViewModeListener()
      removeTaskPickerListener()
      removeMessageListener()
      removeApprovalListener()
      removeClearListener()
      removeRuntimeListener()
      removeIntegrationListener()
      removeWindowsListener()
      removeVoiceCommandListener()
      removeVoiceStatusListener()
      removeUpdateListener()
      window.clearInterval(integrationTimer)
    }
  }, [
    changeViewMode,
    handleVoiceCommand,
    refreshIntegrationStatus,
    showActionReminder,
    showReminder,
  ])

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
      if (microphoneTimerRef.current !== null) {
        window.clearTimeout(microphoneTimerRef.current)
      }
      if (desktopActionTimerRef.current !== null) {
        window.clearTimeout(desktopActionTimerRef.current)
      }
    },
    [],
  )

  const changeExpanded = useCallback((next: boolean) => {
    changeViewMode(next ? 'expanded' : 'collapsed')
  }, [changeViewMode])

  const minimizeScreenUsage = useCallback(() => {
    setSettingsOpen(false)
    changeViewMode('minimal')
  }, [changeViewMode])

  const closeWidget = useCallback(() => {
    if (window.widgetControls) void window.widgetControls.close().catch(() => {})
    else changeExpanded(false)
  }, [changeExpanded])

  const sessionActive = ['loading', 'calibrating', 'monitoring'].includes(
    monitor.phase,
  )
  const actionLabel =
    monitor.phase === 'idle'
      ? '开始监测'
      : monitor.phase === 'ended'
        ? '再次开始'
        : monitor.phase === 'error'
          ? '重新尝试'
          : '结束本次'

  const handlePrimaryAction = () => {
    if (sessionActive) monitor.stopSession()
    else void monitor.startSession()
  }

  const handleVideoDeviceChange = (deviceId: string) => {
    setMediaPreferences((current) => ({ ...current, videoDeviceId: deviceId }))
    if (sessionActive) void monitor.startSession(deviceId)
  }

  const handleAudioDeviceChange = (deviceId: string) => {
    setMediaPreferences((current) => ({ ...current, audioDeviceId: deviceId }))
    if (audioPhase === 'active' || audioPhase === 'loading') {
      void startAudioInput(deviceId)
    }
  }

  const handleCameraFramingChange = (cameraFraming: CameraFraming) => {
    setMediaPreferences((current) => ({ ...current, cameraFraming }))
  }

  const handleAudioToggle = () => {
    if (audioPhase === 'active' || audioPhase === 'loading') {
      stopAudioInput()
    } else {
      void startAudioInput()
    }
  }

  const mediaControlProps = {
    videoInputs,
    audioInputs,
    videoDeviceId: mediaPreferences.videoDeviceId,
    audioDeviceId: mediaPreferences.audioDeviceId,
    cameraFraming: mediaPreferences.cameraFraming,
    audioPhase,
    audioLevel,
    audioError,
    onVideoDeviceChange: handleVideoDeviceChange,
    onAudioDeviceChange: handleAudioDeviceChange,
    onCameraFramingChange: handleCameraFramingChange,
    onAudioToggle: handleAudioToggle,
  }

  const openDashboard = () => {
    changeExpanded(true)
  }

  return (
    <main
      className={`widget-root ${expanded ? 'is-expanded' : 'is-collapsed'} ${screenUsageMinimized ? 'is-minimal' : ''} ${sessionActive ? 'has-active-camera' : ''} ${audioPhase === 'active' ? 'has-active-audio' : ''}`}
      data-camera-phase={monitor.phase}
      data-gesture-phase={gesture.modelPhase}
      data-gesture-mode={gestureMode}
      data-gesture-frames={gesture.processedFrames ?? 0}
      data-gesture-error={gesture.error || ''}
    >
      <FloatingButton
        actionFeedback={desktopActionFeedback}
        hidden={!screenUsageMinimized}
        gestureActive={settings.gestureEnabled && gesture.modelPhase === 'ready'}
        phase={monitor.phase}
        postureActive={monitor.postureActive}
        score={monitor.score}
        status={monitor.status}
        voiceListening={voiceStatus.phase === 'listening'}
        onExpand={() => changeViewMode('collapsed')}
      />
      <section
        className="floating-panel"
        aria-hidden={screenUsageMinimized || undefined}
        aria-label={expanded ? 'Codex Gesture Dock 控制面板' : 'Codex Gesture Dock 迷你摄像头'}
        inert={screenUsageMinimized}
      >
        <header className="widget-header">
          <div className="widget-brand">
            <strong>端正</strong>
            <div className="widget-trust-row">
              <span>
                <ShieldCheck size={15} aria-hidden="true" />
                仅在本机处理 · 隐私优先
              </span>
              <span className="camera-running-state">
                <i aria-hidden="true" />
                <Camera size={14} aria-hidden="true" />
                {sessionActive ? '摄像头运行中' : '摄像头待命'}
              </span>
            </div>
          </div>
          <div className="window-actions">
            {expanded && (
              <button
                className={`window-safety-toggle ${integrationStatus?.control?.enabled === false ? 'is-paused' : ''}`}
                type="button"
                disabled={windowsControlBusy}
                aria-pressed={integrationStatus?.control?.enabled ?? true}
                aria-label={
                  integrationStatus?.control?.enabled === false
                    ? '恢复 Windows 控制'
                    : '暂停 Windows 控制'
                }
                onClick={() =>
                  void setWindowsControlEnabled(
                    !(integrationStatus?.control?.enabled ?? true),
                  )
                }
              >
                {integrationStatus?.control?.enabled === false ? (
                  <PlayCircle size={18} aria-hidden="true" />
                ) : (
                  <PauseCircle size={18} aria-hidden="true" />
                )}
                <span>
                  <strong>
                    {integrationStatus?.control?.enabled === false
                      ? '恢复 Windows 控制'
                      : '暂停 Windows 控制'}
                  </strong>
                  <small>手势识别仍保持可用</small>
                </span>
              </button>
            )}
            <button
              className="compact-only"
              type="button"
              aria-label="打开完整控制面板"
              onClick={openDashboard}
            >
              <Maximize2 size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="一键启动极简 Windows 桌面手势控制"
              title="启动摄像头并进入极简 Windows 手势控制"
              disabled={minimalWindowsStarting}
              onClick={() => void startMinimalWindowsControl()}
            >
              <Hand size={18} aria-hidden="true" />
            </button>
            <button
              className="voice-control-toggle"
              type="button"
              aria-label={voiceStatus.enabled ? '关闭语音控制' : '开启语音控制'}
              aria-pressed={voiceStatus.enabled}
              disabled={voiceStatus.phase === 'starting'}
              title={`${voiceStatus.message} · 说“助手 切换窗口”或“助手 暂停控制”`}
              onClick={() => void setVoiceControlEnabled(!voiceStatus.enabled)}
            >
              <Mic size={18} aria-hidden="true" />
            </button>
            <button
              className="expanded-only"
              type="button"
              aria-label="打开 Codex 任务选择器"
              onClick={openTaskPicker}
            >
              <ListTodo size={18} aria-hidden="true" />
            </button>
            <button
              className="expanded-only"
              type="button"
              aria-label={settingsOpen ? '关闭设置' : '打开设置'}
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen((current) => !current)}
            >
              <Settings size={18} aria-hidden="true" />
            </button>
            <button
              className="expanded-only"
              type="button"
              aria-label="收起菜单"
              onClick={() => changeExpanded(false)}
            >
              <ChevronDown size={19} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="最小化占屏，适合屏幕共享"
              title="最小化占屏，适合屏幕共享"
              onClick={minimizeScreenUsage}
            >
              <Minimize2 size={18} aria-hidden="true" />
            </button>
            <button type="button" aria-label="退出 Codex Gesture Dock" onClick={closeWidget}>
              <X size={19} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="widget-content">
          <section className="dashboard-monitor" aria-label="实时摄像头与坐姿数据">
            <header className="dashboard-section-heading camera-workspace-heading">
              <div>
                <span className="live-indicator" aria-hidden="true" />
                实时镜头
              </div>
              <CameraModeSwitcher mode={cameraMode} onChange={setCameraMode} />
            </header>

            {expanded && cameraMode !== 'ocr' && cameraMode !== 'card' && cameraMode !== 'privacy' && cameraMode !== 'background' && cameraMode !== 'compare' && cameraMode !== 'colors' ? (
              <MediaInputPanel {...mediaControlProps} />
            ) : null}

            <CompactCamera
              videoRef={videoRef}
              canvasRef={canvasRef}
              phase={monitor.phase}
              status={monitor.status}
              error={monitor.error}
              calibrationProgress={monitor.calibrationProgress}
              gesture={gesture}
              gestureEnabled={settings.gestureEnabled}
              mode={cameraMode}
              mirrored={mediaPreferences.cameraMirrored}
              framing={mediaPreferences.cameraFraming}
              scanPhase={codeScanner.phase}
              faceMaskStyle={faceMaskStyle}
              visible={!screenUsageMinimized}
              onMirrorToggle={() =>
                setMediaPreferences((current) => ({
                  ...current,
                  cameraMirrored: !current.cameraMirrored,
                }))
              }
              onRecalibrate={monitor.recalibrate}
            />

            {expanded && cameraMode === 'monitor' && (
              <section className="current-task-hero" aria-label="当前 Codex 任务">
                <div>
                  <span>当前任务</span>
                  <strong>
                    {integrationStatus?.boundTask?.title || '选择一个 Codex 任务'}
                  </strong>
                  <small>
                    {integrationStatus?.boundTask
                      ? `${integrationStatus.boundTask.project} · 手势与任务保持同步`
                      : '绑定任务后，可用手势继续对话、审查代码或切换终端'}
                  </small>
                </div>
                <div className="current-task-actions">
                  <button type="button" onClick={openTaskPicker}>
                    <ListTodo size={17} aria-hidden="true" />
                    {taskPickerOpen ? '任务窗口已打开' : '打开任务'}
                  </button>
                  <button
                    className="session-toggle-secondary"
                    type="button"
                    onClick={handlePrimaryAction}
                  >
                    {actionLabel}
                  </button>
                </div>
              </section>
            )}

            {!expanded ? (
              <MiniCameraControls
                mode={cameraMode}
                phase={monitor.phase}
                postureActive={monitor.postureActive}
                status={monitor.status}
                score={monitor.score}
                actionLabel={actionLabel}
                mirrored={mediaPreferences.cameraMirrored}
                videoRef={videoRef}
                scanPhase={codeScanner.phase}
                scanResult={codeScanner.result}
                scanError={codeScanner.error}
                mediaControls={<CompactMediaControls {...mediaControlProps} />}
                onClearScan={codeScanner.clearResult}
                onSessionToggle={handlePrimaryAction}
                onMessage={showReminder}
              />
            ) : cameraMode === 'monitor' ? (
              <>
                {monitor.postureActive ? <div className="monitor-data-grid">
                  <WidgetMetrics
                    score={monitor.score}
                    status={monitor.status}
                    sessionSeconds={monitor.sessionSeconds}
                    awayCount={monitor.awayCount}
                    trend={monitor.trend}
                  />
                </div> : <p role="status">仅手势控制，坐姿监测未启用</p>}

              </>
            ) : cameraMode === 'codes' || cameraMode === 'document' ? (
              <Suspense fallback={toolLoadingFallback}>
                <CameraToolPanel
                  mode={cameraMode}
                  videoRef={videoRef}
                  mirrored={mediaPreferences.cameraMirrored}
                  sessionReady={monitor.phase === 'monitoring'}
                  scanPhase={codeScanner.phase}
                  scanResult={codeScanner.result}
                  scanError={codeScanner.error}
                  onClearScan={codeScanner.clearResult}
                  onMessage={showReminder}
                />
              </Suspense>
            ) : cameraMode === 'privacy' ? (
              <Suspense fallback={toolLoadingFallback}>
                <FacePrivacyPanel onMessage={showReminder} />
              </Suspense>
            ) : cameraMode === 'masks' ? (
              <Suspense fallback={toolLoadingFallback}>
                <FaceMaskPanel
                  style={faceMaskStyle}
                  onStyleChange={setFaceMaskStyle}
                  sessionActive={['loading', 'calibrating', 'monitoring'].includes(monitor.phase)}
                  onStart={handlePrimaryAction}
                />
              </Suspense>
            ) : cameraMode === 'background' ? (
              <Suspense fallback={toolLoadingFallback}>
                <BackgroundToolPanel onMessage={showReminder} />
              </Suspense>
            ) : cameraMode === 'objects' ? (
              <Suspense fallback={toolLoadingFallback}>
                <ObjectDetectionPanel
                  videoRef={videoRef}
                  mirrored={mediaPreferences.cameraMirrored}
                  sessionReady={monitor.phase === 'monitoring'}
                  onMessage={showReminder}
                />
              </Suspense>
            ) : cameraMode === 'compare' ? (
              <Suspense fallback={toolLoadingFallback}>
                <ImageComparisonPanel onMessage={showReminder} />
              </Suspense>
            ) : cameraMode === 'colors' ? (
              <Suspense fallback={toolLoadingFallback}>
                <ColorAnalysisPanel onMessage={showReminder} />
              </Suspense>
            ) : (
              <Suspense fallback={toolLoadingFallback}>
                <OcrToolPanel
                  key={cameraMode}
                  mode={cameraMode}
                  onMessage={showReminder}
                />
              </Suspense>
            )}
          </section>

          {expanded && <aside className="dashboard-controls" aria-label="手势手册与会话控制">
            {cameraMode === 'monitor' && settingsOpen ? (
              <WidgetSettings
                settings={settings}
                gestureMode={gestureMode}
                voiceStatus={voiceStatus}
                onChange={setSettings}
                onGestureModeChange={setGestureMode}
                onVoiceEnabledChange={setVoiceControlEnabled}
              />
            ) : cameraMode === 'monitor' ? (
              <section className={`posture-overview status-${monitor.status}`} aria-label="当前坐姿状态">
                <div>
                  <span>姿势状态</span>
                  <strong>
                    {monitor.status === 'good'
                      ? '坐姿良好'
                      : monitor.status === 'fair'
                        ? '请轻微调整'
                        : monitor.status === 'poor'
                          ? '建议坐直休息'
                          : '等待检测'}
                  </strong>
                  <small>
                    {monitor.score === null
                      ? '开始监测后显示实时坐姿反馈'
                      : `当前坐姿评分 ${monitor.score} 分`}
                  </small>
                </div>
                <i aria-hidden="true"><Armchair size={38} strokeWidth={1.7} /></i>
              </section>
            ) : null}
            <GestureBook
              enabled={settings.gestureEnabled}
              gesture={gesture}
              microphoneActive={codexMicrophoneActive}
              mode={gestureMode}
            />

            {currentApproval ? (
              <CodexApprovalPanel
                busy={approvalBusy}
                request={currentApproval}
                onDecision={(decision) => void respondCodexApproval(decision)}
              />
            ) : (
              <section className="session-console">
                <header>
                  <span>SESSION CONTROL</span>
                  <strong>镜头保持在主面板</strong>
                </header>
                <CodexIntegrationPanel
                  status={integrationStatus}
                  controlBusy={windowsControlBusy}
                  updateStatus={updateStatus}
                  onUpdateAction={() => void runUpdateAction()}
                  onWindowsControlToggle={(enabled) =>
                    void setWindowsControlEnabled(enabled)
                  }
                />
                <div className={`microphone-status ${codexMicrophoneActive ? 'is-active' : ''}`}>
                  <Mic size={16} aria-hidden="true" />
                  <span>
                    <strong>
                      {codexMicrophoneActive ? 'Codex 话筒已激活' : '食指手势激活话筒'}
                    </strong>
                    <small>食指向上保持 0.85 秒</small>
                  </span>
                </div>
              </section>
            )}
          </aside>}
        </div>
      </section>

      {toast && (
        <div className="widget-toast" role="status">
          <strong>Codex Gesture Dock</strong>
          <span>{toast}</span>
        </div>
      )}
    </main>
  )
}

function TaskPickerWindow() {
  const taskPickerRef = useRef<TaskPickerHandle>(null)
  const [open, setOpen] = useState(true)
  const [message, setMessage] = useState('')

  const closeTaskPicker = useCallback(() => {
    setOpen(false)
    if (window.widgetControls) {
      void window.widgetControls.closeTaskPicker().catch(() => {})
    } else {
      window.close()
    }
  }, [])

  const showMessage = useCallback((nextMessage: string) => {
    setMessage(nextMessage)
    void window.widgetControls?.showMessage(nextMessage).catch(() => {})
  }, [])

  useEffect(() => {
    const controls = window.widgetControls
    document.documentElement.classList.add('task-window')
    document.documentElement.classList.toggle('electron-runtime', Boolean(controls))
    if (!controls) return () => document.documentElement.classList.remove('task-window')

    const removeGestureListener = controls.onTaskPickerGesture((gesture) => {
      taskPickerRef.current?.handleGesture(gesture)
    })
    return () => {
      removeGestureListener()
      document.documentElement.classList.remove('task-window')
    }
  }, [])

  return (
    <main className="task-window-root">
      <TaskPicker
        ref={taskPickerRef}
        open={open}
        onClose={closeTaskPicker}
        onMessage={showMessage}
      />
      {message && (
        <div className="task-window-toast" role="status">
          {message}
        </div>
      )}
    </main>
  )
}

function App() {
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'tasks' ? <TaskPickerWindow /> : <WidgetApp />
}

export default App
