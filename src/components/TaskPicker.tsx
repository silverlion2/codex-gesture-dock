import {
  Archive,
  ArrowLeft,
  Check,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Folder,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Wrench,
  X,
} from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { GestureName } from '../lib/gestures'
import {
  formatTaskTime,
  moveSelection,
  TASK_ACTIONS,
  TASK_FILTER_LABELS,
  type CodexTask,
  type CodexTaskAction,
  type CodexTaskFilter,
  type CodexTaskListResult,
} from '../lib/codexTasks'

export interface TaskPickerHandle {
  handleGesture: (gesture: GestureName) => boolean
}

interface TaskPickerProps {
  onClose: () => void
  onMessage: (message: string) => void
  open: boolean
}

type PickerStage = 'list' | 'actions' | 'confirm'

const filters = Object.keys(TASK_FILTER_LABELS) as CodexTaskFilter[]

const mockTasks: CodexTask[] = [
  {
    id: '019-demo-gesture',
    title: '完善 Codex 手势控制',
    preview: '实现任务选择器与二次确认流程',
    cwd: 'C:\\Projects\\gesture-control',
    project: 'gesture-control',
    source: 'appServer',
    status: 'completed',
    archived: false,
    createdAt: 1_753_000_000,
    updatedAt: 1_753_020_000,
  },
  {
    id: '019-demo-review',
    title: '检查桌面应用发布包',
    preview: '验证 Windows portable 构建',
    cwd: 'C:\\Projects\\desktop-app',
    project: 'desktop-app',
    source: 'appServer',
    status: 'completed',
    archived: false,
    createdAt: 1_752_900_000,
    updatedAt: 1_753_010_000,
  },
  {
    id: '019-demo-docs',
    title: '整理项目交付文档',
    preview: '补充安装与手势使用说明',
    cwd: 'C:\\Projects\\docs',
    project: 'docs',
    source: 'appServer',
    status: 'idle',
    archived: false,
    createdAt: 1_752_800_000,
    updatedAt: 1_753_000_000,
  },
]

function isMockMode() {
  return new URLSearchParams(window.location.search).get('mockTasks') === '1'
}

function statusText(task: CodexTask) {
  if (task.archived || task.status === 'archived') return '已归档'
  if (task.status === 'active') return '处理中'
  if (task.status === 'completed') return '已完成'
  if (task.status === 'failed') return '失败'
  if (task.status === 'interrupted') return '已中断'
  return '空闲'
}

function ActionIcon({ action }: { action: CodexTaskAction }) {
  const props = { size: 17, strokeWidth: 2 } as const
  if (action === 'open') return <ExternalLink {...props} />
  if (action === 'continue') return <Play {...props} />
  if (action === 'summary') return <FileText {...props} />
  if (action === 'review') return <ClipboardCheck {...props} />
  if (action === 'test_fix') return <Wrench {...props} />
  return <Archive {...props} />
}

export const TaskPicker = forwardRef<TaskPickerHandle, TaskPickerProps>(
  function TaskPicker({ onClose, onMessage, open }, ref) {
    const [filter, setFilter] = useState<CodexTaskFilter>('completed')
    const [tasks, setTasks] = useState<CodexTask[]>([])
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [actionIndex, setActionIndex] = useState(0)
    const [stage, setStage] = useState<PickerStage>('list')
    const [loading, setLoading] = useState(false)
    const [executing, setExecuting] = useState(false)
    const [error, setError] = useState('')
    const loadRequestIdRef = useRef(0)

    const selectedTask = tasks[selectedIndex] ?? null
    const selectedAction = TASK_ACTIONS[actionIndex]

    const loadTasks = useCallback(async (nextFilter: CodexTaskFilter) => {
      const requestId = ++loadRequestIdRef.current
      setLoading(true)
      setError('')
      setSelectedIndex(0)
      setStage('list')

      try {
        let result: CodexTaskListResult
        if (window.widgetControls) {
          result = await window.widgetControls.listCodexTasks(nextFilter)
        } else if (isMockMode()) {
          const filtered = mockTasks.filter((task) =>
            nextFilter === 'completed'
              ? task.status === 'completed'
              : nextFilter === 'archived'
                ? task.archived
                : !task.archived,
          )
          result = {
            ok: true,
            filter: nextFilter,
            tasks: filtered,
            message: '',
            fallbackAvailable: true,
          }
        } else {
          result = {
            ok: false,
            filter: nextFilter,
            tasks: [],
            message: '请在 Windows 桌面版中读取 Codex 任务',
            fallbackAvailable: false,
          }
        }

        if (requestId !== loadRequestIdRef.current) return
        if (!result.ok) throw new Error(result.message)
        setTasks(result.tasks)
      } catch (caught) {
        if (requestId !== loadRequestIdRef.current) return
        setTasks([])
        setError(caught instanceof Error ? caught.message : '任务列表读取失败')
      } finally {
        if (requestId === loadRequestIdRef.current) setLoading(false)
      }
    }, [])

    useEffect(() => {
      if (!open) return
      void loadTasks(filter)
    }, [filter, loadTasks, open])

    const chooseFilter = useCallback((nextFilter: CodexTaskFilter) => {
      setFilter(nextFilter)
    }, [])

    const executeAction = useCallback(async () => {
      if (!selectedTask || !selectedAction || executing) return
      setExecuting(true)
      try {
        if (!window.widgetControls) {
          if (!isMockMode()) throw new Error('请在 Windows 桌面版中执行任务')
          onMessage(`演示：${selectedAction.label}`)
          onClose()
          return
        }

        const result = await window.widgetControls.runCodexTaskAction(
          selectedTask.id,
          selectedAction.action,
        )
        onMessage(result.message)
        if (!result.ok) return

        if (selectedAction.action === 'archive') {
          await loadTasks(filter)
        } else {
          onClose()
        }
      } catch (caught) {
        onMessage(caught instanceof Error ? caught.message : '任务操作失败')
      } finally {
        setExecuting(false)
      }
    }, [executing, filter, loadTasks, onClose, onMessage, selectedAction, selectedTask])

    const handleGesture = useCallback(
      (gesture: GestureName) => {
        if (!open) return false

        if (stage === 'list') {
          if (gesture === 'Pointing_Up') {
            setSelectedIndex((current) => moveSelection(current, -1, tasks.length))
          } else if (gesture === 'Closed_Fist') {
            setSelectedIndex((current) => moveSelection(current, 1, tasks.length))
          } else if (gesture === 'Thumb_Up' && selectedTask) {
            setActionIndex(0)
            setStage('actions')
          } else if (gesture === 'Open_Palm') {
            const next = filters[(filters.indexOf(filter) + 1) % filters.length]
            chooseFilter(next)
          } else if (gesture === 'ILoveYou') {
            void loadTasks(filter)
          } else if (gesture === 'Victory') {
            onClose()
          }
          return true
        }

        if (stage === 'actions') {
          if (gesture === 'Pointing_Up') {
            setActionIndex((current) => moveSelection(current, -1, TASK_ACTIONS.length))
          } else if (gesture === 'Closed_Fist') {
            setActionIndex((current) => moveSelection(current, 1, TASK_ACTIONS.length))
          } else if (gesture === 'Thumb_Up') {
            setStage('confirm')
          } else if (gesture === 'Victory') {
            setStage('list')
          }
          return true
        }

        if (gesture === 'Thumb_Up') void executeAction()
        if (gesture === 'Victory') setStage('actions')
        return true
      },
      [chooseFilter, executeAction, filter, loadTasks, onClose, open, selectedTask, stage, tasks.length],
    )

    useImperativeHandle(ref, () => ({ handleGesture }), [handleGesture])

    const title = useMemo(() => {
      if (stage === 'actions') return selectedTask?.title ?? '选择处理方式'
      if (stage === 'confirm') return '确认执行'
      return '选择 Codex 任务'
    }, [selectedTask, stage])

    if (!open) return null

    return (
      <section className="task-picker" aria-label="Codex 任务选择器">
        <header className="task-picker-header">
          <div>
            {stage !== 'list' && (
              <button
                className="task-icon-button"
                type="button"
                aria-label="返回上一步"
                onClick={() => setStage(stage === 'confirm' ? 'actions' : 'list')}
              >
                <ArrowLeft size={17} aria-hidden="true" />
              </button>
            )}
            <strong>{title}</strong>
          </div>
          <button
            className="task-icon-button"
            type="button"
            aria-label="关闭任务选择器"
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        {stage === 'list' && (
          <>
            <nav className="task-filters" aria-label="任务筛选">
              {filters.map((item) => (
                <button
                  className={filter === item ? 'is-active' : ''}
                  type="button"
                  key={item}
                  onClick={() => chooseFilter(item)}
                >
                  {TASK_FILTER_LABELS[item]}
                </button>
              ))}
            </nav>

            <div className="task-list" aria-busy={loading}>
              {loading && (
                <div className="task-empty">
                  <LoaderCircle className="spin-icon" size={24} aria-hidden="true" />
                  <strong>正在读取本机任务</strong>
                  <span>连接 Codex 历史记录</span>
                </div>
              )}

              {!loading && error && (
                <div className="task-empty task-empty-error">
                  <Search size={24} aria-hidden="true" />
                  <strong>暂时无法读取任务</strong>
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() =>
                      void window.widgetControls
                        ?.runCodexAction('search_tasks')
                        .catch((caught) =>
                          onMessage(
                            caught instanceof Error
                              ? caught.message
                              : 'Codex 控制桥暂时不可用',
                          ),
                        )
                    }
                  >
                    在 Codex 中搜索
                  </button>
                </div>
              )}

              {!loading && !error && tasks.length === 0 && (
                <div className="task-empty">
                  <Archive size={24} aria-hidden="true" />
                  <strong>这里还没有任务</strong>
                  <span>切换上方分类，或刷新后重试</span>
                </div>
              )}

              {!loading &&
                !error &&
                tasks.slice(0, 7).map((task, index) => (
                  <button
                    className={`task-row ${selectedIndex === index ? 'is-selected' : ''}`}
                    type="button"
                    key={task.id}
                    onClick={() => {
                      setSelectedIndex(index)
                      setActionIndex(0)
                      setStage('actions')
                    }}
                  >
                    <span className={`task-status-dot status-${task.status}`} aria-hidden="true" />
                    <span className="task-row-copy">
                      <strong>{task.title}</strong>
                      <small>
                        <Folder size={11} aria-hidden="true" />
                        {task.project}
                        <i>·</i>
                        {formatTaskTime(task.updatedAt)}
                      </small>
                    </span>
                    <span className={`task-status status-${task.status}`}>
                      {statusText(task)}
                    </span>
                  </button>
                ))}
            </div>

            <footer className="task-picker-footer">
              <span>☝ 上移 · ✊ 下移 · 👍 选择</span>
              <button type="button" onClick={() => void loadTasks(filter)}>
                <RefreshCw size={13} aria-hidden="true" />
                刷新
              </button>
            </footer>
          </>
        )}

        {stage === 'actions' && selectedTask && (
          <div className="task-action-view">
            <div className="selected-task-summary">
              <span className={`task-status-dot status-${selectedTask.status}`} />
              <div>
                <strong>{selectedTask.title}</strong>
                <small>{selectedTask.project}</small>
              </div>
            </div>
            <div className="task-action-list">
              {TASK_ACTIONS.map((option, index) => (
                <button
                  className={actionIndex === index ? 'is-selected' : ''}
                  type="button"
                  key={option.action}
                  onClick={() => {
                    setActionIndex(index)
                    setStage('confirm')
                  }}
                >
                  <b aria-hidden="true">
                    <ActionIcon action={option.action} />
                  </b>
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="task-gesture-help">☝ 上移 · ✊ 下移 · 👍 选择 · ✌ 返回</p>
          </div>
        )}

        {stage === 'confirm' && selectedTask && selectedAction && (
          <div className="task-confirm-view">
            <span className="task-confirm-icon" aria-hidden="true">
              {selectedAction.action === 'open' ? (
                <ExternalLink size={25} />
              ) : (
                <Check size={27} />
              )}
            </span>
            <strong>{selectedAction.label}</strong>
            <p>{selectedTask.title}</p>
            <small>{selectedAction.description}</small>
            <button
              className="task-confirm-button"
              type="button"
              disabled={executing}
              onClick={() => void executeAction()}
            >
              {executing ? (
                <LoaderCircle className="spin-icon" size={16} aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
              {executing ? '正在执行' : '确认执行'}
            </button>
            <p className="task-gesture-help">👍 确认执行 · ✌ 返回</p>
          </div>
        )}
      </section>
    )
  },
)
