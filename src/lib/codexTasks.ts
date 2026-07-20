export type CodexTaskFilter = 'recent' | 'completed' | 'archived'

export type CodexTaskStatus =
  | 'active'
  | 'archived'
  | 'completed'
  | 'failed'
  | 'idle'
  | 'interrupted'

export type CodexTaskAction =
  | 'open'
  | 'continue'
  | 'summary'
  | 'review'
  | 'test_fix'
  | 'archive'

export interface CodexTask {
  archived: boolean
  createdAt: number
  cwd: string
  id: string
  preview: string
  project: string
  source: string
  status: CodexTaskStatus
  title: string
  updatedAt: number
}

export interface CodexTaskListResult {
  fallbackAvailable: boolean
  filter: CodexTaskFilter
  message: string
  ok: boolean
  tasks: CodexTask[]
}

export interface CodexTaskActionResult {
  action: CodexTaskAction
  message: string
  ok: boolean
  taskId: string
}

export interface TaskActionOption {
  action: CodexTaskAction
  description: string
  label: string
}

export const TASK_ACTIONS: TaskActionOption[] = [
  {
    action: 'open',
    label: '打开查看',
    description: '在 Codex 桌面应用中打开任务',
  },
  {
    action: 'continue',
    label: '继续处理',
    description: '检查未完成项并继续推进',
  },
  {
    action: 'summary',
    label: '总结状态',
    description: '只读总结完成项、风险和下一步',
  },
  {
    action: 'review',
    label: '审查改动',
    description: '只读检查正确性、风险和测试',
  },
  {
    action: 'test_fix',
    label: '测试并修复',
    description: '运行相关测试并修复失败',
  },
  {
    action: 'archive',
    label: '归档任务',
    description: '从最近任务中移到归档',
  },
]

export const TASK_FILTER_LABELS: Record<CodexTaskFilter, string> = {
  recent: '最近',
  completed: '已完成',
  archived: '已归档',
}

export function formatTaskTime(timestamp: number, now = Date.now()) {
  const elapsed = Math.max(0, now - timestamp * 1_000)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(timestamp * 1_000))
}

export function moveSelection(current: number, amount: number, length: number) {
  if (length <= 0) return 0
  return (current + amount + length) % length
}
