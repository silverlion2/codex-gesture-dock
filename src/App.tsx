import { ChevronDown, ListTodo, Maximize2, Mic, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CodexApprovalPanel } from './components/CodexApprovalPanel'
import { CodexIntegrationPanel } from './components/CodexIntegrationPanel'
import { CompactCamera } from './components/CompactCamera'
import { CameraModeSwitcher } from './components/CameraModeSwitcher'
import { CameraToolPanel } from './components/CameraToolPanel'
import { GestureBook } from './components/GestureBook'
import { MiniCameraControls } from './components/MiniCameraControls'
import { TaskPicker, type TaskPickerHandle } from './components/TaskPicker'
import { WidgetMetrics } from './components/WidgetMetrics'
import { WidgetSettings } from './components/WidgetSettings'
import { useGestureControl } from './hooks/useGestureControl'
import { useCodeScanner } from './hooks/useCodeScanner'
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
import type { CameraMode } from './lib/cameraTools'

const initialSettings: ReminderSettings = {
  postureEnabled: true,
  sensitivity: 'medium',
  breakEnabled: true,
  breakMinutes: 50,
  gestureEnabled: true,
}

const GESTURE_MODE_STORAGE_KEY = 'codex-gesture-dock.gesture-mode.v1'

function initialGestureMode(): GestureMode {
  try {
    return window.localStorage.getItem(GESTURE_MODE_STORAGE_KEY) === 'windows'
      ? 'windows'
      : 'codex'
  } catch {
    return 'codex'
  }
}

function initialExpandedState() {
  return new URLSearchParams(window.location.search).get('widget') !== 'collapsed'
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
  const [expanded, setExpanded] = useState(initialExpandedState)
  const [settings, setSettings] = useState(initialSettings)
  const [cameraMode, setCameraMode] = useState<CameraMode>('monitor')
  const [cameraMirrored, setCameraMirrored] = useState(true)
  const [gestureMode, setGestureMode] = useState<GestureMode>(initialGestureMode)
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)
  const [approvalQueue, setApprovalQueue] =
    useState<CodexApprovalRequest[]>(initialApprovalQueue)
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [microphoneActive, setMicrophoneActive] = useState(false)
  const [integrationStatus, setIntegrationStatus] =
    useState<CodexIntegrationStatus | null>(null)
  const [windowsControlBusy, setWindowsControlBusy] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null)
  const currentApproval = approvalQueue[0] ?? null

  const showReminder = useCallback((message: string) => {
    setToast(message)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 5_000)
  }, [])

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
        showReminder(
          status.enabled
            ? 'Windows 桌面控制已恢复'
            : 'Windows 桌面控制已暂停',
        )
        await refreshIntegrationStatus()
      } catch (caught) {
        showReminder(
          caught instanceof Error ? caught.message : 'Windows 控制状态切换失败',
        )
      } finally {
        setWindowsControlBusy(false)
      }
    },
    [refreshIntegrationStatus, showReminder],
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
    onReminder: showReminder,
  })

  const codeScanner = useCodeScanner({
    active: cameraMode === 'codes' && monitor.phase === 'monitoring',
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
        setMicrophoneActive(result.ok)
        if (microphoneTimerRef.current !== null) {
          window.clearTimeout(microphoneTimerRef.current)
        }
        if (result.ok) {
          microphoneTimerRef.current = window.setTimeout(
            () => setMicrophoneActive(false),
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
        showReminder(result.message)
        return result
      } catch (caught) {
        const result = {
          ok: false as const,
          action,
          message:
            caught instanceof Error ? caught.message : 'Windows 控制桥暂时不可用',
        }
        showReminder(result.message)
        return result
      }
    },
    [runCodexAction, showReminder],
  )

  const openTaskPicker = useCallback(() => {
    setExpanded(true)
    setTaskPickerOpen(true)
    const controls = window.widgetControls
    if (controls) {
      void controls.setExpanded(true).catch(() => {})
      void controls.openTaskPicker().catch((caught) =>
        showReminder(
          caught instanceof Error ? caught.message : '任务选择窗口无法打开',
        ),
      )
      return
    }

    window.open(`${window.location.pathname}?view=tasks&mockTasks=1`, 'codex-tasks')
  }, [showReminder])

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
  const gesture = useGestureControl({
    active: cameraMode === 'monitor' && monitor.phase === 'monitoring',
    bindings: gestureBindings,
    enabled: settings.gestureEnabled,
    onAction: runGestureAction,
    onGesture: handleGesture,
    videoRef,
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(GESTURE_MODE_STORAGE_KEY, gestureMode)
    } catch {
      // Local persistence is optional; gesture control remains functional.
    }
  }, [gestureMode])

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
      setExpanded(true)
    }

    void controls.getState().then(setExpanded).catch(() => {})
    void refreshIntegrationStatus()
    void controls.getUpdateStatus().then(setUpdateStatus).catch(() => {})
    void controls
      .getPendingCodexApprovals()
      .then((requests) => requests.forEach(enqueueApproval))
      .catch(() => {})
    const removeStateListener = controls.onStateChange(setExpanded)
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
    const removeWindowsListener = controls.onWindowsControlEvent(() => {
      void refreshIntegrationStatus()
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
      removeStateListener()
      removeTaskPickerListener()
      removeMessageListener()
      removeApprovalListener()
      removeClearListener()
      removeRuntimeListener()
      removeIntegrationListener()
      removeWindowsListener()
      removeUpdateListener()
      window.clearInterval(integrationTimer)
    }
  }, [refreshIntegrationStatus, showReminder])

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
      if (microphoneTimerRef.current !== null) {
        window.clearTimeout(microphoneTimerRef.current)
      }
    },
    [],
  )

  const changeExpanded = useCallback((next: boolean) => {
    setExpanded(next)
    if (!next) {
      setTaskPickerOpen(false)
      void window.widgetControls?.closeTaskPicker().catch(() => {})
    }
    void window.widgetControls?.setExpanded(next).catch(() => {})
  }, [])

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

  const openDashboard = () => {
    changeExpanded(true)
  }

  return (
    <main className={`widget-root ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <section
        className="floating-panel"
        aria-label={expanded ? 'Codex Gesture Dock 控制面板' : 'Codex Gesture Dock 迷你摄像头'}
      >
        <header className="widget-header">
          <div className="widget-brand">
            <strong>Codex Dock</strong>
            <span>
              <ShieldCheck size={15} aria-hidden="true" />
              仅在本机处理
            </span>
          </div>
          <div className="window-actions">
            <button
              className="compact-only"
              type="button"
              aria-label="打开完整控制面板"
              onClick={openDashboard}
            >
              <Maximize2 size={17} aria-hidden="true" />
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
              aria-label="收起菜单"
              onClick={() => changeExpanded(false)}
            >
              <ChevronDown size={19} aria-hidden="true" />
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
                LIVE CAMERA
              </div>
              <CameraModeSwitcher mode={cameraMode} onChange={setCameraMode} />
            </header>

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
              mirrored={cameraMirrored}
              scanPhase={codeScanner.phase}
              onMirrorToggle={() => setCameraMirrored((current) => !current)}
              onRecalibrate={monitor.recalibrate}
            />

            {!expanded ? (
              <MiniCameraControls
                mode={cameraMode}
                phase={monitor.phase}
                status={monitor.status}
                score={monitor.score}
                actionLabel={actionLabel}
                mirrored={cameraMirrored}
                videoRef={videoRef}
                scanPhase={codeScanner.phase}
                scanResult={codeScanner.result}
                scanError={codeScanner.error}
                onClearScan={codeScanner.clearResult}
                onSessionToggle={handlePrimaryAction}
                onMessage={showReminder}
              />
            ) : cameraMode === 'monitor' ? (
              <>
                <div className="monitor-data-grid">
                  <WidgetMetrics
                    score={monitor.score}
                    status={monitor.status}
                    sessionSeconds={monitor.sessionSeconds}
                    awayCount={monitor.awayCount}
                    trend={monitor.trend}
                  />
                </div>

                <WidgetSettings
                  settings={settings}
                  gestureMode={gestureMode}
                  onChange={setSettings}
                  onGestureModeChange={setGestureMode}
                />
              </>
            ) : (
              <CameraToolPanel
                mode={cameraMode}
                videoRef={videoRef}
                mirrored={cameraMirrored}
                sessionReady={monitor.phase === 'monitoring'}
                scanPhase={codeScanner.phase}
                scanResult={codeScanner.result}
                scanError={codeScanner.error}
                onClearScan={codeScanner.clearResult}
                onMessage={showReminder}
              />
            )}
          </section>

          {expanded && <aside className="dashboard-controls" aria-label="手势手册与会话控制">
            <GestureBook
              enabled={settings.gestureEnabled}
              gesture={gesture}
              microphoneActive={microphoneActive}
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
                <button
                  className="open-task-window"
                  type="button"
                  onClick={openTaskPicker}
                >
                  <ListTodo size={17} aria-hidden="true" />
                  <span>
                    <strong>{taskPickerOpen ? '任务窗口已打开' : '打开任务选择窗口'}</strong>
                    <small>任务与文件操作在独立窗口完成</small>
                  </span>
                </button>
                <div className={`microphone-status ${microphoneActive ? 'is-active' : ''}`}>
                  <Mic size={16} aria-hidden="true" />
                  <span>
                    <strong>
                      {microphoneActive ? 'Codex 话筒已激活' : '食指手势激活话筒'}
                    </strong>
                    <small>食指向上保持 0.85 秒</small>
                  </span>
                </div>
                <button
                  className={`widget-primary-action ${sessionActive ? 'is-stop' : ''}`}
                  type="button"
                  onClick={handlePrimaryAction}
                >
                  {actionLabel}
                </button>
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
