import { ChevronDown, ListTodo, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CodexApprovalPanel } from './components/CodexApprovalPanel'
import { CompactCamera } from './components/CompactCamera'
import { FloatingButton } from './components/FloatingButton'
import { TaskPicker, type TaskPickerHandle } from './components/TaskPicker'
import { WidgetMetrics } from './components/WidgetMetrics'
import { WidgetSettings } from './components/WidgetSettings'
import { useGestureControl } from './hooks/useGestureControl'
import {
  usePoseMonitor,
  type ReminderSettings,
} from './hooks/usePoseMonitor'
import type { CodexAction, CodexActionResult } from './lib/gestures'
import type {
  CodexApprovalDecision,
  CodexApprovalRequest,
} from './lib/codexApprovals'

const initialSettings: ReminderSettings = {
  postureEnabled: true,
  sensitivity: 'medium',
  breakEnabled: true,
  breakMinutes: 50,
  gestureEnabled: true,
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

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const toastTimerRef = useRef<number | null>(null)
  const taskPickerRef = useRef<TaskPickerHandle>(null)
  const [expanded, setExpanded] = useState(initialExpandedState)
  const [settings, setSettings] = useState(initialSettings)
  const [gestureGuideOpen, setGestureGuideOpen] = useState(false)
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)
  const [approvalQueue, setApprovalQueue] =
    useState<CodexApprovalRequest[]>(initialApprovalQueue)
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [toast, setToast] = useState('')
  const currentApproval = approvalQueue[0] ?? null

  const showReminder = useCallback((message: string) => {
    setToast(message)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 5_000)
  }, [])

  const monitor = usePoseMonitor({
    videoRef,
    canvasRef,
    settings,
    onReminder: showReminder,
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
      showReminder(result.message)
      return result
    },
    [showReminder],
  )

  const openTaskPicker = useCallback(() => {
    setExpanded(true)
    void window.widgetControls?.setExpanded(true).catch(() => {})
    setGestureGuideOpen(false)
    setTaskPickerOpen(true)
  }, [])

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
    (name: Parameters<TaskPickerHandle['handleGesture']>[0]) => {
      if (currentApproval) {
        if (name === 'Thumb_Up') void respondCodexApproval('accept')
        if (name === 'Victory') void respondCodexApproval('decline')
        return true
      }
      if (taskPickerOpen) return taskPickerRef.current?.handleGesture(name) ?? true
      if (name === 'Open_Palm') {
        openTaskPicker()
        return true
      }
      return false
    },
    [currentApproval, openTaskPicker, respondCodexApproval, taskPickerOpen],
  )

  const gesture = useGestureControl({
    active: monitor.phase === 'monitoring',
    enabled: settings.gestureEnabled,
    onAction: runCodexAction,
    onGesture: handleGesture,
    videoRef,
  })

  useEffect(() => {
    const controls = window.widgetControls
    document.documentElement.classList.toggle('electron-runtime', Boolean(controls))
    if (!controls) return

    const enqueueApproval = (request: CodexApprovalRequest) => {
      setApprovalQueue((queue) =>
        queue.some((item) => item.id === request.id) ? queue : [...queue, request],
      )
      setTaskPickerOpen(false)
      setGestureGuideOpen(false)
      setExpanded(true)
    }

    void controls.getState().then(setExpanded).catch(() => {})
    void controls
      .getPendingCodexApprovals()
      .then((requests) => requests.forEach(enqueueApproval))
      .catch(() => {})
    const removeStateListener = controls.onStateChange(setExpanded)
    const removeApprovalListener = controls.onCodexApprovalRequest(enqueueApproval)
    const removeClearListener = controls.onCodexApprovalsCleared(() =>
      setApprovalQueue([]),
    )
    return () => {
      removeStateListener()
      removeApprovalListener()
      removeClearListener()
    }
  }, [])

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    },
    [],
  )

  const changeExpanded = useCallback((next: boolean) => {
    setExpanded(next)
    if (!next) setTaskPickerOpen(false)
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

  return (
    <main className={`widget-root ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <FloatingButton
        hidden={expanded}
        gestureActive={settings.gestureEnabled && monitor.phase === 'monitoring'}
        phase={monitor.phase}
        score={monitor.score}
        status={monitor.status}
        onExpand={() => changeExpanded(true)}
      />

      <section
        className="floating-panel"
        aria-label="Codex Gesture Dock 控制面板"
        hidden={!expanded}
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
              type="button"
              aria-label="打开 Codex 任务选择器"
              onClick={openTaskPicker}
            >
              <ListTodo size={18} aria-hidden="true" />
            </button>
            <button
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

        {currentApproval && (
          <CodexApprovalPanel
            busy={approvalBusy}
            request={currentApproval}
            onDecision={(decision) => void respondCodexApproval(decision)}
          />
        )}

        <TaskPicker
          ref={taskPickerRef}
          open={taskPickerOpen && !currentApproval}
          onClose={() => setTaskPickerOpen(false)}
          onMessage={showReminder}
        />

        <div
          className="widget-content"
          aria-hidden={taskPickerOpen || Boolean(currentApproval)}
          inert={taskPickerOpen || Boolean(currentApproval)}
        >
          <CompactCamera
            videoRef={videoRef}
            canvasRef={canvasRef}
            phase={monitor.phase}
            status={monitor.status}
            error={monitor.error}
            calibrationProgress={monitor.calibrationProgress}
            gesture={gesture}
            gestureEnabled={settings.gestureEnabled}
            showGestureGuide={gestureGuideOpen}
            onCloseGestureGuide={() => setGestureGuideOpen(false)}
            onRecalibrate={monitor.recalibrate}
          />

          <WidgetMetrics
            score={monitor.score}
            status={monitor.status}
            sessionSeconds={monitor.sessionSeconds}
            awayCount={monitor.awayCount}
            trend={monitor.trend}
          />

          <WidgetSettings
            settings={settings}
            onChange={setSettings}
            onOpenGestureGuide={() => setGestureGuideOpen(true)}
          />

          <button
            className={`widget-primary-action ${sessionActive ? 'is-stop' : ''}`}
            type="button"
            onClick={handlePrimaryAction}
          >
            {actionLabel}
          </button>
        </div>
      </section>

      {toast && expanded && (
        <div className="widget-toast" role="status">
          <strong>Codex Gesture Dock</strong>
          <span>{toast}</span>
        </div>
      )}
    </main>
  )
}

export default App
