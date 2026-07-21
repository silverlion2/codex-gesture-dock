const path = require('node:path')

const RUNTIME_NOTIFICATION_METHODS = new Set([
  'thread/started',
  'thread/status/changed',
  'turn/started',
  'turn/completed',
  'item/started',
  'item/completed',
])

function normalizeWindowsPath(value) {
  const candidate = String(value || '').trim()
  return candidate ? path.resolve(candidate).toLowerCase() : ''
}

function chooseBoundTask(tasks, preferredId, workspacePath) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null

  const preferred = tasks.find((task) => task.id === preferredId)
  if (preferred) return preferred

  const normalizedWorkspace = normalizeWindowsPath(workspacePath)
  const workspaceTask = normalizedWorkspace
    ? tasks.find((task) => normalizeWindowsPath(task.cwd) === normalizedWorkspace)
    : null

  return workspaceTask || tasks.find((task) => task.status === 'active') || tasks[0]
}

function normalizeCodexNotification(notification, timestamp = Date.now()) {
  if (!notification || !RUNTIME_NOTIFICATION_METHODS.has(notification.method)) {
    return null
  }

  const params = notification.params && typeof notification.params === 'object'
    ? notification.params
    : {}
  const turn = params.turn && typeof params.turn === 'object' ? params.turn : {}
  const item = params.item && typeof params.item === 'object' ? params.item : {}
  const statusValue = params.status && typeof params.status === 'object'
    ? params.status.type
    : params.status

  return {
    method: notification.method,
    threadId: String(params.threadId || ''),
    turnId: String(params.turnId || turn.id || ''),
    status: String(statusValue || turn.status || item.status || ''),
    itemType: String(item.type || ''),
    timestamp,
  }
}

module.exports = {
  chooseBoundTask,
  normalizeCodexNotification,
}
