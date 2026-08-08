import {
  Archive,
  ArrowLeft,
  Check,
  ClipboardCheck,
  ExternalLink,
  Eye,
  FileClock,
  Files,
  FileText,
  Folder,
  FolderOpen,
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
  type CodexRecentFile,
  type CodexRecentFilesResult,
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
type WorkspaceView = 'files' | 'tasks'

const SEEN_FILES_KEY = 'codex-gesture-dock.seen-recent-files.v1'

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

const mockRecentFiles: CodexRecentFile[] = [
  {
    completedAt: 1_753_020_000,
    exists: true,
    id: '11111111111111111111111111111111',
    kind: 'update',
    name: 'TaskPicker.tsx',
    project: 'gesture-control',
    relativePath: 'src/components/TaskPicker.tsx',
    taskId: '019-demo-gesture',
    taskTitle: '完善 Codex 手势控制',
  },
  {
    completedAt: 1_753_019_000,
    exists: true,
    id: '22222222222222222222222222222222',
    kind: 'generated',
    name: 'release-notes.md',
    project: 'gesture-control',
    relativePath: 'release-notes.md',
    taskId: '019-demo-gesture',
    taskTitle: '完善 Codex 手势控制',
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

function readSeenFileIds() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SEEN_FILES_KEY) || '[]')
    return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function rememberSeenFile(fileId: string) {
  try {
    const seen = readSeenFileIds()
    seen.add(fileId)
    window.localStorage.setItem(SEEN_FILES_KEY, JSON.stringify([...seen].slice(-500)))
  } catch {
    // Local storage is optional; the current window still tracks the opened file.
  }
}

function fileKindLabel(file: CodexRecentFile) {
  if (!file.exists || file.kind === 'delete') return '已删除'
  if (file.kind === 'add') return '新增'
  if (file.kind === 'generated') return '生成'
  return '修改'
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
    const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('tasks')
    const [filter, setFilter] = useState<CodexTaskFilter>('completed')
    const [tasks, setTasks] = useState<CodexTask[]>([])
    const [recentFiles, setRecentFiles] = useState<CodexRecentFile[]>([])
    const [openedFileIds, setOpenedFileIds] = useState<Set<string>>(() => new Set())
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [selectedFileIndex, setSelectedFileIndex] = useState(0)
    const [actionIndex, setActionIndex] = useState(0)
    const [stage, setStage] = useState<PickerStage>('list')
    const [loading, setLoading] = useState(false)
    const [executing, setExecuting] = useState(false)
    const [error, setError] = useState('')
    const [fileError, setFileError] = useState('')
    const [filesLoading, setFilesLoading] = useState(false)
    const loadRequestIdRef = useRef(0)
    const fileRequestIdRef = useRef(0)

    const selectedTask = tasks[selectedIndex] ?? null
    const selectedFile = recentFiles[selectedFileIndex] ?? null
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

    const loadRecentFiles = useCallback(async () => {
      const requestId = ++fileRequestIdRef.current
      setFilesLoading(true)
      setFileError('')
      setSelectedFileIndex(0)

      try {
        let result: CodexRecentFilesResult
        if (window.widgetControls) {
          result = await window.widgetControls.listRecentCodexFiles()
        } else if (isMockMode()) {
          result = { ok: true, files: mockRecentFiles, message: '' }
        } else {
          result = {
            ok: false,
            files: [],
            message: '请在 Windows 桌面版中读取最近文件',
          }
        }

        if (requestId !== fileRequestIdRef.current) return
        if (!result.ok) throw new Error(result.message)
        const seen = readSeenFileIds()
        const unseen = result.files.filter((file) => !seen.has(file.id))
        setRecentFiles(unseen)
        setOpenedFileIds(new Set())
        if (unseen.length > 0) setWorkspaceView('files')
      } catch (caught) {
        if (requestId !== fileRequestIdRef.current) return
        setRecentFiles([])
        setFileError(caught instanceof Error ? caught.message : '最近文件读取失败')
      } finally {
        if (requestId === fileRequestIdRef.current) setFilesLoading(false)
      }
    }, [])

    useEffect(() => {
      if (!open) return
      void loadTasks(filter)
    }, [filter, loadTasks, open])

    useEffect(() => {
      if (!open) return
      void loadRecentFiles()
    }, [loadRecentFiles, open])

    useEffect(() => {
      const controls = window.widgetControls
      if (!open || !controls) return
      return controls.onCodexRuntimeEvent((runtimeEvent) => {
        if (
          runtimeEvent.method !== 'turn/completed' &&
          runtimeEvent.method !== 'item/completed'
        ) {
          return
        }
        void loadTasks(filter)
        if (
          runtimeEvent.method === 'turn/completed' ||
          runtimeEvent.itemType === 'fileChange' ||
          runtimeEvent.itemType === 'imageGeneration'
        ) {
          void loadRecentFiles()
        }
      })
    }, [filter, loadRecentFiles, loadTasks, open])

    useEffect(() => {
      if (!open) return
      const handleEscape = (event: globalThis.KeyboardEvent) => {
        if (event.defaultPrevented || event.key !== 'Escape') return
        event.preventDefault()
        if (stage === 'confirm') setStage('actions')
        else if (stage === 'actions') setStage('list')
        else onClose()
      }
      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }, [onClose, open, stage])

    const chooseFilter = useCallback((nextFilter: CodexTaskFilter) => {
      setFilter(nextFilter)
    }, [])

    const bindTask = useCallback(
      async (task: CodexTask) => {
        if (!window.widgetControls) return
        const result = await window.widgetControls.bindCodexTask(task.id)
        if (!result.ok) onMessage(result.message)
      },
      [onMessage],
    )

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

    const openRecentFile = useCallback(
      async (file: CodexRecentFile, mode: 'open' | 'reveal' = 'open') => {
        try {
          if (!window.widgetControls) {
            if (!isMockMode()) throw new Error('请在 Windows 桌面版中打开文件')
            onMessage(`演示：${mode === 'open' ? '打开' : '显示'} ${file.name}`)
          } else {
            const result = await window.widgetControls.openRecentCodexFile(file.id, mode)
            onMessage(result.message)
            if (!result.ok) return
          }
          rememberSeenFile(file.id)
          setOpenedFileIds((current) => new Set(current).add(file.id))
        } catch (caught) {
          onMessage(caught instanceof Error ? caught.message : '文件操作失败')
        }
      },
      [onMessage],
    )

    const handleGesture = useCallback(
      (gesture: GestureName) => {
        if (!open) return false

        if (stage === 'list') {
          if (workspaceView === 'files') {
            if (gesture === 'Pointing_Up') {
              setSelectedFileIndex((current) =>
                moveSelection(current, -1, recentFiles.length),
              )
            } else if (gesture === 'Closed_Fist') {
              setSelectedFileIndex((current) =>
                moveSelection(current, 1, recentFiles.length),
              )
            } else if (gesture === 'Thumb_Up' && selectedFile) {
              void openRecentFile(selectedFile)
            } else if (gesture === 'Open_Palm') {
              setWorkspaceView('tasks')
            } else if (gesture === 'ILoveYou') {
              void loadRecentFiles()
            } else if (gesture === 'Victory') {
              onClose()
            }
            return true
          }

          if (gesture === 'Pointing_Up') {
            setSelectedIndex((current) => moveSelection(current, -1, tasks.length))
          } else if (gesture === 'Closed_Fist') {
            setSelectedIndex((current) => moveSelection(current, 1, tasks.length))
          } else if (gesture === 'Thumb_Up' && selectedTask) {
            void bindTask(selectedTask)
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
      [bindTask, chooseFilter, executeAction, filter, loadRecentFiles, loadTasks, onClose, open, openRecentFile, recentFiles.length, selectedFile, selectedTask, stage, tasks.length, workspaceView],
    )

    useImperativeHandle(ref, () => ({ handleGesture }), [handleGesture])

    const title = useMemo(() => {
      if (stage === 'actions') return selectedTask?.title ?? '选择处理方式'
      if (stage === 'confirm') return '确认执行'
      return '文件与任务'
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
            <nav className="task-workspace-tabs" aria-label="文件与任务">
              <button
                className={workspaceView === 'files' ? 'is-active' : ''}
                type="button"
                aria-pressed={workspaceView === 'files'}
                onClick={() => setWorkspaceView('files')}
              >
                <Files size={14} aria-hidden="true" />
                未查看文件
                {recentFiles.length > 0 && (
                  <b>{recentFiles.filter((file) => !openedFileIds.has(file.id)).length}</b>
                )}
              </button>
              <button
                className={workspaceView === 'tasks' ? 'is-active' : ''}
                type="button"
                aria-pressed={workspaceView === 'tasks'}
                onClick={() => setWorkspaceView('tasks')}
              >
                <ClipboardCheck size={14} aria-hidden="true" />
                Codex 任务
              </button>
            </nav>

            {workspaceView === 'tasks' && (
              <nav className="task-filters" aria-label="任务筛选">
                {filters.map((item) => (
                  <button
                    className={filter === item ? 'is-active' : ''}
                    type="button"
                    aria-pressed={filter === item}
                    key={item}
                    onClick={() => chooseFilter(item)}
                  >
                    {TASK_FILTER_LABELS[item]}
                  </button>
                ))}
              </nav>
            )}

            {workspaceView === 'files' ? (
              <div className="task-list recent-file-list" aria-busy={filesLoading}>
                {filesLoading && (
                  <div className="task-empty" role="status">
                    <LoaderCircle className="spin-icon" size={24} aria-hidden="true" />
                    <strong>正在读取刚完成的文件</strong>
                    <span>从本机 Codex 任务记录中整理</span>
                  </div>
                )}

                {!filesLoading && fileError && (
                  <div className="task-empty task-empty-error" role="alert">
                    <FileClock size={24} aria-hidden="true" />
                    <strong>暂时无法读取最近文件</strong>
                    <span>{fileError}</span>
                  </div>
                )}

                {!filesLoading && !fileError && recentFiles.length === 0 && (
                  <div className="task-empty" role="status">
                    <Eye size={24} aria-hidden="true" />
                    <strong>没有遗漏的文件</strong>
                    <span>最近完成的任务没有新文件，或文件都已经查看</span>
                  </div>
                )}

                {!filesLoading && !fileError && recentFiles.map((file, index) => (
                  <div
                    className={`recent-file-row ${selectedFileIndex === index ? 'is-selected' : ''} ${openedFileIds.has(file.id) ? 'is-seen' : ''}`}
                    key={file.id}
                  >
                    <button
                      className="recent-file-main"
                      type="button"
                      aria-current={selectedFileIndex === index ? 'true' : undefined}
                      onClick={() => {
                        setSelectedFileIndex(index)
                        void openRecentFile(file)
                      }}
                    >
                      <FileText size={19} aria-hidden="true" />
                      <span>
                        <strong>{file.name}</strong>
                        <small>{file.relativePath}</small>
                        <em>{file.taskTitle} · {formatTaskTime(file.completedAt)}</em>
                      </span>
                      <i>{openedFileIds.has(file.id) ? '已查看' : fileKindLabel(file)}</i>
                    </button>
                    <button
                      className="recent-file-reveal"
                      type="button"
                      aria-label={`在资源管理器中显示 ${file.name}`}
                      onClick={() => void openRecentFile(file, 'reveal')}
                    >
                      <FolderOpen size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="task-list" aria-busy={loading}>
                {loading && (
                  <div className="task-empty" role="status">
                    <LoaderCircle className="spin-icon" size={24} aria-hidden="true" />
                    <strong>正在读取本机任务</strong>
                    <span>连接 Codex 历史记录</span>
                  </div>
                )}

                {!loading && error && (
                  <div className="task-empty task-empty-error" role="alert">
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
                  <div className="task-empty" role="status">
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
                      aria-current={selectedIndex === index ? 'true' : undefined}
                      key={task.id}
                      onClick={() => {
                        void bindTask(task)
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
            )}

            <footer className="task-picker-footer">
              <span>☝ 上移 · ✊ 下移 · 👍 {workspaceView === 'files' ? '打开' : '选择'}</span>
              <button
                type="button"
                onClick={() => void (workspaceView === 'files' ? loadRecentFiles() : loadTasks(filter))}
              >
                <RefreshCw size={13} aria-hidden="true" />
                刷新
              </button>
            </footer>
          </>
        )}

        {stage === 'actions' && selectedTask && (
          <div className="task-action-view">
            <div className="selected-task-summary">
              <span
                className={`task-status-dot status-${selectedTask.status}`}
                aria-hidden="true"
              />
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
                  aria-current={actionIndex === index ? 'true' : undefined}
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
