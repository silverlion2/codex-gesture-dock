const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  screen,
  session,
  shell,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { pathToFileURL } = require('node:url')
const { CodexProgramAdapter } = require('./adapters/codex-adapter.cjs')
const { APP_SERVER_CLOSED_CODE } = require('./codex-app-server.cjs')
const { autoUpdater } = require('electron-updater')
const { DesktopAutoUpdater } = require('./auto-update.cjs')
const { createRecoveryLimiter } = require('./renderer-recovery.cjs')
const {
  chooseBoundTask,
  normalizeCodexNotification,
} = require('./codex-integration.cjs')
const { WindowsControlCore } = require('./windows-control.cjs')
const {
  constrainBounds,
  parseWidgetWindowState,
} = require('./window-bounds.cjs')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
])

const COLLAPSED_SIZE = { width: 348, height: 360 }
const EXPANDED_SIZE = { width: 1120, height: 760 }
const EXPANDED_MIN_SIZE = { width: 980, height: 760 }
const TASK_PICKER_SIZE = { width: 620, height: 720 }
const SCREEN_GAP = 14
const APP_HOST = 'codex-gesture-dock'
const APP_URL_PREFIX = `app://${APP_HOST}/`
const DEV_SERVER_ORIGIN = 'http://127.0.0.1:5173'
const isSmokeTest = process.argv.includes('--smoke-test')
const isTaskWindowSmokeTest = process.argv.includes('--smoke-test-tasks')
const isAnySmokeTest = isSmokeTest || isTaskWindowSmokeTest
if (isAnySmokeTest) {
  app.setPath(
    'userData',
    fs.mkdtempSync(path.join(os.tmpdir(), 'codex-gesture-dock-smoke-')),
  )
}
const hasSingleInstanceLock = app.requestSingleInstanceLock()
const smokeReportPath = path.join(
  process.cwd(),
  'work',
  isTaskWindowSmokeTest ? 'electron-task-window-smoke.json' : 'electron-smoke.json',
)

let widgetWindow = null
let taskPickerWindow = null
let isQuitting = false
let expanded = false
let widgetWindowState = { collapsed: null, expanded: null }
let widgetWindowStateTimer = null
let lastCodexActionAt = 0
let lastWindowsActionAt = 0
let boundCodexTaskId = ''
let lastCodexRuntimeEvent = null
let integrationTasks = []
let integrationTasksAt = 0
let integrationTasksPromise = null
const recentCodexFiles = new Map()
const pendingCodexApprovals = new Map()
const desktopAutoUpdater = new DesktopAutoUpdater({
  updater: autoUpdater,
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  isPortable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
  isSmokeTest: isAnySmokeTest,
  onStatus: (status) => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('updates:status', status)
    }
  },
})
const windowsControl = new WindowsControlCore({
  resolveScriptPath: getDesktopScriptPath,
  onAudit: appendWindowsControlAudit,
})
const codexAdapter = new CodexProgramAdapter({
  windowsControl,
  onNotification: handleCodexNotification,
  onServerRequest: handleCodexServerRequest,
  onServerRequestsCleared: clearPendingCodexApprovals,
})

const TASK_FILTERS = new Set(['recent', 'completed', 'archived'])
const GESTURE_NAMES = new Set([
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Up',
  'Victory',
  'ILoveYou',
])

function isTrustedRendererUrl(value) {
  if (value.startsWith(APP_URL_PREFIX)) return true
  if (app.isPackaged) return false
  try {
    return new URL(value).origin === DEV_SERVER_ORIGIN
  } catch {
    return false
  }
}

function getDevServerUrl() {
  if (app.isPackaged || !process.env.ELECTRON_START_URL) return ''
  try {
    return new URL(process.env.ELECTRON_START_URL).origin === DEV_SERVER_ORIGIN
      ? DEV_SERVER_ORIGIN
      : ''
  } catch {
    return ''
  }
}
const TASK_ACTIONS = new Set([
  'open',
  'continue',
  'summary',
  'review',
  'test_fix',
  'archive',
])
const APPROVAL_DECISIONS = new Set(['accept', 'decline'])

function cleanRequestText(value, fallback) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (!text) return fallback
  return text.length > 800 ? `${text.slice(0, 799)}…` : text
}

function normalizeCodexApproval(request) {
  const params = request.params && typeof request.params === 'object'
    ? request.params
    : {}
  const base = {
    id: request.id,
    threadId: String(params.threadId || ''),
    turnId: String(params.turnId || ''),
    reason: cleanRequestText(params.reason, ''),
  }

  if (request.method === 'item/commandExecution/requestApproval') {
    return {
      ...base,
      kind: 'command',
      title: '允许 Codex 执行命令？',
      detail: cleanRequestText(params.command, 'Codex 请求执行本地命令'),
      context: cleanRequestText(params.cwd, ''),
    }
  }

  if (request.method === 'item/fileChange/requestApproval') {
    return {
      ...base,
      kind: 'file',
      title: '允许 Codex 修改文件？',
      detail: cleanRequestText(
        params.reason,
        'Codex 请求修改当前任务中的文件',
      ),
      context: cleanRequestText(params.grantRoot, ''),
    }
  }

  return null
}

function handleCodexServerRequest(request) {
  const approval = normalizeCodexApproval(request)
  if (!approval) {
    try {
      codexAdapter.rejectServerRequest(
        request.id,
        '请在 Codex 桌面应用中处理此交互请求',
      )
    } catch (error) {
      console.warn('Codex interaction request could not be rejected:', error)
    }
    return
  }

  pendingCodexApprovals.set(approval.id, approval)
  if (!widgetWindow || widgetWindow.isDestroyed()) return
  closeTaskPickerWindow()
  setExpanded(true)
  widgetWindow.webContents.send('codex:approval-requested', approval)
}

function clearPendingCodexApprovals() {
  pendingCodexApprovals.clear()
  if (!widgetWindow || widgetWindow.isDestroyed()) return
  widgetWindow.webContents.send('codex:approvals-cleared')
}

function sendIntegrationChanged(channel, payload) {
  for (const targetWindow of [widgetWindow, taskPickerWindow]) {
    if (!targetWindow || targetWindow.isDestroyed()) continue
    targetWindow.webContents.send(channel, payload)
  }
}

function handleCodexNotification(notification) {
  const runtimeEvent = normalizeCodexNotification(notification)
  if (!runtimeEvent) return
  lastCodexRuntimeEvent = runtimeEvent
  integrationTasksAt = 0
  sendIntegrationChanged('codex:runtime-event', runtimeEvent)
}

function getTaskBindingPath() {
  return path.join(app.getPath('userData'), 'codex-task-binding.json')
}

function getWindowsControlStatePath() {
  return path.join(app.getPath('userData'), 'windows-control-state.json')
}

function loadWindowsControlEnabled() {
  try {
    const state = JSON.parse(
      fs.readFileSync(getWindowsControlStatePath(), 'utf8'),
    )
    return state?.enabled !== false
  } catch {
    return true
  }
}

function persistWindowsControlEnabled(enabled) {
  try {
    const targetPath = getWindowsControlStatePath()
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(
      targetPath,
      JSON.stringify({ enabled: Boolean(enabled) }, null, 2),
      'utf8',
    )
  } catch (error) {
    console.warn('Windows control state could not be persisted:', error)
  }
}

function appendWindowsControlAudit(entry) {
  try {
    const day = new Date().toISOString().slice(0, 10)
    const auditDirectory = path.join(app.getPath('userData'), 'audit')
    fs.mkdirSync(auditDirectory, { recursive: true })
    fs.appendFileSync(
      path.join(auditDirectory, `windows-control-${day}.jsonl`),
      `${JSON.stringify(entry)}\n`,
      'utf8',
    )
  } catch (error) {
    console.warn('Windows control audit could not be written:', error)
  }
}

function handleWindowsControlEvent(event) {
  sendIntegrationChanged('windows:control-event', event)
}

function loadTaskBinding() {
  try {
    const binding = JSON.parse(fs.readFileSync(getTaskBindingPath(), 'utf8'))
    boundCodexTaskId = isValidThreadId(binding?.threadId)
      ? binding.threadId
      : ''
  } catch {
    boundCodexTaskId = ''
  }
}

function persistTaskBinding() {
  try {
    const targetPath = getTaskBindingPath()
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(
      targetPath,
      JSON.stringify({ threadId: boundCodexTaskId }, null, 2),
      'utf8',
    )
  } catch (error) {
    console.warn('Codex task binding could not be persisted:', error)
  }
}

function bindCodexTask(threadId) {
  if (!isValidThreadId(threadId)) return false
  if (boundCodexTaskId === threadId) return true
  boundCodexTaskId = threadId
  persistTaskBinding()
  sendIntegrationChanged('codex:integration-changed', { threadId })
  return true
}

function isValidThreadId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(value)
}

async function openCodexThread(threadId) {
  if (!isValidThreadId(threadId)) throw new Error('无效的 Codex 任务编号')
  await shell.openExternal(`codex://threads/${encodeURIComponent(threadId)}`)
}

function finishSmoke(payload, exitCode) {
  if (!isAnySmokeTest) return

  const report = {
    ...payload,
    timestamp: new Date().toISOString(),
  }

  try {
    fs.mkdirSync(path.dirname(smokeReportPath), { recursive: true })
    fs.writeFileSync(smokeReportPath, JSON.stringify(report, null, 2))
  } catch (error) {
    report.reportWriteError = error instanceof Error ? error.message : String(error)
  }

  console.log(JSON.stringify(report))
  codexAdapter.close()
  setTimeout(() => process.exit(exitCode), 1_500)
  app.exit(exitCode)
}

async function saveSmokeScreenshot(targetWindow, filename) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    throw new Error(`Cannot capture ${filename}: window is unavailable.`)
  }
  const image = await targetWindow.webContents.capturePage()
  const targetPath = path.join(process.cwd(), 'work', filename)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, image.toPNG())
  return targetPath
}

function getInitialBounds(size) {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    width: size.width,
    height: size.height,
    x: workArea.x + workArea.width - size.width - SCREEN_GAP,
    y: workArea.y + workArea.height - size.height - SCREEN_GAP,
  }
}

function getWidgetWindowStatePath() {
  return path.join(app.getPath('userData'), 'widget-window-state.json')
}

function loadWidgetWindowState() {
  try {
    widgetWindowState = parseWidgetWindowState(
      JSON.parse(fs.readFileSync(getWidgetWindowStatePath(), 'utf8')),
    )
  } catch {
    widgetWindowState = { collapsed: null, expanded: null }
  }
}

function persistWidgetWindowState() {
  if (widgetWindowStateTimer !== null) {
    clearTimeout(widgetWindowStateTimer)
    widgetWindowStateTimer = null
  }
  try {
    const targetPath = getWidgetWindowStatePath()
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, JSON.stringify(widgetWindowState, null, 2), 'utf8')
  } catch (error) {
    console.warn('Widget window state could not be persisted:', error)
  }
}

function scheduleWidgetWindowStatePersist() {
  if (widgetWindowStateTimer !== null) clearTimeout(widgetWindowStateTimer)
  widgetWindowStateTimer = setTimeout(persistWidgetWindowState, 180)
}

function rememberCurrentWidgetBounds() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return
  const mode = expanded ? 'expanded' : 'collapsed'
  widgetWindowState[mode] = widgetWindow.getBounds()
  scheduleWidgetWindowStatePersist()
}

function getStoredWidgetBounds(mode) {
  const stored = widgetWindowState[mode]
  if (!stored) return null
  const { workArea } = screen.getDisplayMatching(stored)
  return constrainBounds(stored, workArea, {
    defaultSize: mode === 'expanded' ? EXPANDED_SIZE : COLLAPSED_SIZE,
    minSize: mode === 'expanded' ? EXPANDED_MIN_SIZE : COLLAPSED_SIZE,
    fixedSize: mode === 'collapsed',
  })
}

function getAnchoredBounds(size) {
  if (!widgetWindow) return getInitialBounds(size)
  const current = widgetWindow.getBounds()
  const display = screen.getDisplayMatching(current)
  const { workArea } = display
  const anchorRight = current.x + current.width
  const anchorBottom = current.y + current.height

  return {
    width: size.width,
    height: size.height,
    x: Math.min(
      Math.max(workArea.x, anchorRight - size.width),
      workArea.x + workArea.width - size.width,
    ),
    y: Math.min(
      Math.max(workArea.y, anchorBottom - size.height),
      workArea.y + workArea.height - size.height,
    ),
  }
}

function setExpanded(nextExpanded) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return false
  const next = Boolean(nextExpanded)
  if (next === expanded) return expanded
  rememberCurrentWidgetBounds()
  expanded = next
  const size = expanded ? EXPANDED_SIZE : COLLAPSED_SIZE
  const storedBounds = getStoredWidgetBounds(expanded ? 'expanded' : 'collapsed')
  widgetWindow.setMinimumSize(
    expanded ? EXPANDED_MIN_SIZE.width : COLLAPSED_SIZE.width,
    expanded ? EXPANDED_MIN_SIZE.height : COLLAPSED_SIZE.height,
  )
  widgetWindow.setResizable(expanded)
  widgetWindow.setBounds(storedBounds ?? getAnchoredBounds(size), true)
  widgetWindow.webContents.send('widget:state-changed', expanded)
  return expanded
}

function revealPrimaryWindow() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return false
  setExpanded(true)
  if (widgetWindow.isMinimized()) widgetWindow.restore()
  widgetWindow.show()
  widgetWindow.focus()
  return true
}

function sendTaskPickerState(open) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return
  widgetWindow.webContents.send('task-picker:state-changed', Boolean(open))
}

function closeTaskPickerWindow() {
  if (!taskPickerWindow || taskPickerWindow.isDestroyed()) return false
  taskPickerWindow.close()
  return true
}

function getTaskPickerBounds() {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    return getInitialBounds(TASK_PICKER_SIZE)
  }

  const widgetBounds = widgetWindow.getBounds()
  const { workArea } = screen.getDisplayMatching(widgetBounds)
  const preferredX = widgetBounds.x - TASK_PICKER_SIZE.width - 12
  return {
    width: TASK_PICKER_SIZE.width,
    height: Math.min(TASK_PICKER_SIZE.height, workArea.height),
    x: Math.max(workArea.x, preferredX),
    y: Math.min(
      Math.max(workArea.y, widgetBounds.y),
      workArea.y + workArea.height - Math.min(TASK_PICKER_SIZE.height, workArea.height),
    ),
  }
}

function attachRendererRecovery(browserWindow, label, critical) {
  if (isAnySmokeTest) return
  const limiter = createRecoveryLimiter()
  let unresponsiveTimer = null

  const clearUnresponsiveTimer = () => {
    if (unresponsiveTimer) clearTimeout(unresponsiveTimer)
    unresponsiveTimer = null
  }
  const recover = (reason) => {
    if (isQuitting || browserWindow.isDestroyed()) return
    const recovery = limiter.record()
    console.error(`${label} renderer recovery ${recovery.attempt}: ${reason}`)

    if (recovery.exhausted) {
      dialog.showErrorBox(
        'Codex Gesture Dock 无法恢复',
        critical
          ? '主界面连续发生错误，应用将退出。请重新启动；如果问题持续，请通过项目安全说明中的渠道报告。'
          : '任务窗口连续发生错误，窗口将关闭。主面板仍可继续使用并重新打开任务窗口。',
      )
      if (critical) app.quit()
      else browserWindow.close()
      return
    }

    setTimeout(() => {
      if (!isQuitting && !browserWindow.isDestroyed()) {
        browserWindow.webContents.reload()
      }
    }, 400 * recovery.attempt)
  }

  browserWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    recover(`${details.reason} (${details.exitCode})`)
  })
  browserWindow.on('unresponsive', () => {
    clearUnresponsiveTimer()
    unresponsiveTimer = setTimeout(
      () => recover('unresponsive for 20 seconds'),
      20_000,
    )
  })
  browserWindow.on('responsive', clearUnresponsiveTimer)
  browserWindow.on('closed', clearUnresponsiveTimer)
}

function createTaskPickerWindow() {
  if (taskPickerWindow && !taskPickerWindow.isDestroyed()) {
    taskPickerWindow.show()
    taskPickerWindow.focus()
    sendTaskPickerState(true)
    return taskPickerWindow
  }

  taskPickerWindow = new BrowserWindow({
    ...getTaskPickerBounds(),
    parent: widgetWindow ?? undefined,
    show: false,
    frame: false,
    backgroundColor: '#eef0ed',
    alwaysOnTop: true,
    resizable: true,
    minWidth: 520,
    minHeight: 560,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'Codex 任务选择器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  })

  taskPickerWindow.setAlwaysOnTop(true, 'floating')
  taskPickerWindow.setMenuBarVisibility(false)
  attachRendererRecovery(taskPickerWindow, 'Task picker', false)
  taskPickerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  taskPickerWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })

  const devUrl = getDevServerUrl()
  if (devUrl) taskPickerWindow.loadURL(`${devUrl}?view=tasks`)
  else taskPickerWindow.loadURL(`${APP_URL_PREFIX}index.html?view=tasks`)

  taskPickerWindow.once('ready-to-show', () => {
    if (!isAnySmokeTest) {
      taskPickerWindow?.show()
      taskPickerWindow?.focus()
    }
    sendTaskPickerState(true)
  })
  taskPickerWindow.on('closed', () => {
    taskPickerWindow = null
    sendTaskPickerState(false)
  })

  return taskPickerWindow
}

function getDesktopScriptPath(scriptName) {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'electron',
      scriptName,
    )
  }
  return path.join(__dirname, scriptName)
}

function loadIntegrationTasks({ force = false } = {}) {
  const now = Date.now()
  if (!force && integrationTasksAt && now - integrationTasksAt < 8_000) {
    return Promise.resolve(integrationTasks)
  }
  if (integrationTasksPromise) return integrationTasksPromise

  integrationTasksPromise = codexAdapter
    .listTasks('recent')
    .then((tasks) => {
      integrationTasks = tasks
      integrationTasksAt = Date.now()
      return tasks
    })
    .finally(() => {
      integrationTasksPromise = null
    })
  return integrationTasksPromise
}

async function getCodexIntegrationStatus() {
  const runtime = codexAdapter.getRuntimeInfo()
  const [taskResult, layerResult] = await Promise.allSettled([
    loadIntegrationTasks(),
    codexAdapter.getLayerStatus(),
  ])
  const tasks = taskResult.status === 'fulfilled' ? taskResult.value : []
  const boundTask = chooseBoundTask(tasks, boundCodexTaskId, process.cwd())
  if (boundTask && boundTask.id !== boundCodexTaskId) {
    boundCodexTaskId = boundTask.id
    persistTaskBinding()
  }

  const layerStatus = layerResult.status === 'fulfilled'
    ? layerResult.value
    : codexAdapter.getLayerSnapshot()
  const desktop = layerStatus.desktop
  const connected = runtime.connected

  return {
    ok: connected || desktop.connected,
    connected,
    controlMode: 'codex-adapter+windows-core',
    boundTask,
    taskCount: tasks.length,
    runtime,
    ...layerStatus,
    lastEvent: lastCodexRuntimeEvent,
    message: connected
      ? boundTask
        ? `已对接：${boundTask.title}`
        : 'Codex App Server 已连接，暂无可绑定任务'
      : runtime.lastError || 'Codex App Server 尚未连接',
  }
}

function isTrustedSender(event) {
  const ownsSender = [widgetWindow, taskPickerWindow].some(
    (window) => window && !window.isDestroyed() && event.sender === window.webContents,
  )
  if (!ownsSender) return false
  const senderUrl = event.senderFrame?.url ?? ''
  return isTrustedRendererUrl(senderUrl)
}

function isWidgetSender(event) {
  return (
    isTrustedSender(event) &&
    widgetWindow !== null &&
    !widgetWindow.isDestroyed() &&
    event.sender === widgetWindow.webContents
  )
}

function registerIpc() {
  ipcMain.handle('widget:get-state', (event) => {
    if (!isWidgetSender(event)) return false
    return expanded
  })

  ipcMain.handle('widget:set-expanded', (event, value) => {
    if (!isWidgetSender(event) || typeof value !== 'boolean') return false
    return setExpanded(value)
  })

  ipcMain.handle('widget:close', (event) => {
    if (!isWidgetSender(event)) return false
    widgetWindow?.close()
    return true
  })

  ipcMain.handle('task-picker:open', (event) => {
    if (!isWidgetSender(event)) return false
    createTaskPickerWindow()
    return true
  })

  ipcMain.handle('task-picker:close', (event) => {
    if (!isTrustedSender(event)) return false
    return closeTaskPickerWindow()
  })

  ipcMain.handle('task-picker:send-gesture', (event, gesture) => {
    if (!isWidgetSender(event) || !GESTURE_NAMES.has(gesture)) return false
    if (!taskPickerWindow || taskPickerWindow.isDestroyed()) return false
    taskPickerWindow.webContents.send('task-picker:gesture', gesture)
    return true
  })

  ipcMain.handle('widget:show-message', (event, message) => {
    if (!isTrustedSender(event) || typeof message !== 'string') return false
    const safeMessage = message.trim().slice(0, 500)
    if (!safeMessage || !widgetWindow || widgetWindow.isDestroyed()) return false
    widgetWindow.webContents.send('widget:message', safeMessage)
    return true
  })

  ipcMain.handle('codex:run-action', async (event, action) => {
    if (!isTrustedSender(event) || !codexAdapter.supportsDesktopAction(action)) {
      return { ok: false, action, message: '不支持的 Codex 动作' }
    }

    const now = Date.now()
    if (now - lastCodexActionAt < 700) {
      return { ok: false, action, message: '手势动作过快，已忽略' }
    }
    lastCodexActionAt = now
    return codexAdapter.runDesktopAction(action)
  })

  ipcMain.handle('windows:run-action', async (event, action) => {
    if (!isTrustedSender(event) || !windowsControl.supportsAction('windows', action)) {
      return { ok: false, action, message: '\u4e0d\u652f\u6301\u7684 Windows \u52a8\u4f5c' }
    }

    const now = Date.now()
    if (now - lastWindowsActionAt < 700) {
      return { ok: false, action, message: '\u624b\u52bf\u52a8\u4f5c\u8fc7\u5feb\uff0c\u5df2\u5ffd\u7565' }
    }
    lastWindowsActionAt = now
    return windowsControl.runAction('windows', action)
  })

  ipcMain.handle('updates:get-status', (event) => {
    if (!isTrustedSender(event)) return desktopAutoUpdater.getStatus()
    return desktopAutoUpdater.getStatus()
  })

  ipcMain.handle('updates:check', async (event) => {
    if (!isTrustedSender(event)) return desktopAutoUpdater.getStatus()
    return desktopAutoUpdater.check()
  })

  ipcMain.handle('updates:install', async (event) => {
    if (!isWidgetSender(event)) return false
    const status = desktopAutoUpdater.getStatus()
    if (status.phase !== 'downloaded') return false
    const response = await dialog.showMessageBox(widgetWindow, {
      type: 'info',
      title: '\u5b89\u88c5 Codex Gesture Dock \u66f4\u65b0',
      message: `\u65b0\u7248\u672c ${status.availableVersion || ''} \u5df2\u4e0b\u8f7d`,
      detail: '\u91cd\u542f\u5e94\u7528\u540e\u5c06\u5b89\u88c5\u66f4\u65b0\u3002\u672a\u4fdd\u5b58\u7684 Codex \u4efb\u52a1\u4e0d\u4f1a\u7531 Dock \u81ea\u52a8\u63d0\u4ea4\u3002',
      buttons: ['\u91cd\u542f\u5e76\u5b89\u88c5', '\u7a0d\u540e'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    return response.response === 0 ? desktopAutoUpdater.install() : false
  })

  ipcMain.handle('windows:inspect-codex-ui', async (event) => {
    if (!isTrustedSender(event)) {
      return {
        ok: false,
        mode: 'read-only',
        elementCount: 0,
        truncated: false,
        message: '无法从当前窗口执行 UI Automation 检查',
      }
    }
    return codexAdapter.inspectUi({ force: true })
  })

  ipcMain.handle('windows:set-control-enabled', (event, enabled) => {
    if (!isWidgetSender(event) || typeof enabled !== 'boolean') {
      return codexAdapter.getLayerSnapshot().control
    }
    const status = codexAdapter.setWindowsControlEnabled(enabled)
    persistWindowsControlEnabled(status.enabled)
    sendIntegrationChanged('codex:integration-changed', {
      windowsControlEnabled: status.enabled,
    })
    return status
  })

  ipcMain.handle('codex:get-integration-status', async (event) => {
    if (!isTrustedSender(event)) {
      return {
        ok: false,
        connected: false,
        controlMode: 'unavailable',
        boundTask: null,
        taskCount: 0,
        runtime: codexAdapter.getRuntimeInfo(),
        ...codexAdapter.getLayerSnapshot(),
        lastEvent: null,
        message: '无法从当前窗口读取 Codex 对接状态',
      }
    }
    return getCodexIntegrationStatus()
  })

  ipcMain.handle('codex:bind-task', (event, threadId) => {
    if (!isTrustedSender(event) || !bindCodexTask(threadId)) {
      return { ok: false, taskId: threadId, message: 'Codex 任务绑定请求无效' }
    }
    return { ok: true, taskId: threadId, message: '已绑定为当前 Codex 控制任务' }
  })

  ipcMain.handle('codex:list-tasks', async (event, filter) => {
    if (!isTrustedSender(event) || !TASK_FILTERS.has(filter)) {
      return {
        ok: false,
        filter,
        tasks: [],
        fallbackAvailable: true,
        message: '不支持的任务筛选方式',
      }
    }

    try {
      const tasks = await codexAdapter.listTasks(filter)
      if (filter === 'recent') {
        integrationTasks = tasks
        integrationTasksAt = Date.now()
      }
      return {
        ok: true,
        filter,
        tasks,
        fallbackAvailable: true,
        message: tasks.length ? '' : '没有找到符合条件的任务',
      }
    } catch (error) {
      return {
        ok: false,
        filter,
        tasks: [],
        fallbackAvailable: true,
        message:
          error instanceof Error
            ? `任务列表读取失败：${error.message}`
            : '任务列表读取失败',
      }
    }
  })

  ipcMain.handle('codex:list-recent-files', async (event) => {
    if (!isTrustedSender(event)) {
      return { ok: false, files: [], message: '无法从当前窗口读取文件' }
    }

    try {
      const files = await codexAdapter.listRecentFiles()
      recentCodexFiles.clear()
      for (const file of files) {
        recentCodexFiles.set(file.id, file.absolutePath)
      }
      return {
        ok: true,
        files: files.map(({ absolutePath: _absolutePath, ...file }) => file),
        message: files.length ? '' : '最近完成的任务没有产生文件改动',
      }
    } catch (error) {
      return {
        ok: false,
        files: [],
        message:
          error instanceof Error
            ? `最近文件读取失败：${error.message}`
            : '最近文件读取失败',
      }
    }
  })

  ipcMain.handle('codex:open-recent-file', async (event, fileId, mode) => {
    if (
      !isTrustedSender(event) ||
      typeof fileId !== 'string' ||
      !/^[a-f0-9]{32}$/.test(fileId) ||
      !['open', 'reveal'].includes(mode)
    ) {
      return { ok: false, fileId, message: '文件操作请求无效' }
    }

    const targetPath = recentCodexFiles.get(fileId)
    if (!targetPath) {
      return { ok: false, fileId, message: '文件列表已过期，请刷新后重试' }
    }

    try {
      const exists = fs.existsSync(targetPath)
      if (mode === 'reveal' && exists) {
        shell.showItemInFolder(targetPath)
        return { ok: true, fileId, message: '已在资源管理器中显示文件' }
      }

      const openPath = exists ? targetPath : path.dirname(targetPath)
      const openError = await shell.openPath(openPath)
      if (openError) throw new Error(openError)
      return {
        ok: true,
        fileId,
        message: exists ? '已打开文件' : '文件已删除，已打开原所在目录',
      }
    } catch (error) {
      return {
        ok: false,
        fileId,
        message: error instanceof Error ? `文件打开失败：${error.message}` : '文件打开失败',
      }
    }
  })

  ipcMain.handle('codex:get-pending-approvals', (event) => {
    if (!isTrustedSender(event)) return []
    return [...pendingCodexApprovals.values()]
  })

  ipcMain.handle(
    'codex:respond-approval',
    (event, requestId, decision) => {
      if (
        !isTrustedSender(event) ||
        typeof requestId !== 'string' ||
        !APPROVAL_DECISIONS.has(decision) ||
        !pendingCodexApprovals.has(requestId)
      ) {
        return {
          ok: false,
          requestId,
          message: 'Codex 审批请求无效或已失效',
        }
      }

      try {
        codexAdapter.respondToServerRequest(requestId, { decision })
        pendingCodexApprovals.delete(requestId)
        return {
          ok: true,
          requestId,
          message: decision === 'accept' ? '已允许本次操作' : '已拒绝本次操作',
        }
      } catch (error) {
        pendingCodexApprovals.delete(requestId)
        return {
          ok: false,
          requestId,
          message:
            error instanceof Error ? error.message : 'Codex 审批响应失败',
        }
      }
    },
  )

  ipcMain.handle('codex:run-task-action', async (event, threadId, action) => {
    if (
      !isTrustedSender(event) ||
      !isValidThreadId(threadId) ||
      !TASK_ACTIONS.has(action)
    ) {
      return { ok: false, taskId: threadId, action, message: '不支持的任务操作' }
    }

    try {
      bindCodexTask(threadId)
      if (action === 'open') {
        await openCodexThread(threadId)
        return { ok: true, taskId: threadId, action, message: '已在 Codex 中打开任务' }
      }

      if (action === 'archive') {
        await codexAdapter.archiveTask(threadId)
        return { ok: true, taskId: threadId, action, message: '任务已归档' }
      }

      const resumedThreadId = await codexAdapter.startTaskAction(threadId, action)
      await openCodexThread(resumedThreadId)
      const labels = {
        continue: 'Codex 已继续处理这个任务',
        summary: 'Codex 已开始总结任务状态',
        review: 'Codex 已开始审查任务改动',
        test_fix: 'Codex 已开始运行测试并修复',
      }
      return {
        ok: true,
        taskId: resumedThreadId,
        action,
        message: labels[action],
      }
    } catch (error) {
      return {
        ok: false,
        taskId: threadId,
        action,
        message:
          error instanceof Error ? `任务操作失败：${error.message}` : '任务操作失败',
      }
    }
  })
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    let requestUrl
    let requestedPath
    try {
      requestUrl = new URL(request.url)
      requestedPath = decodeURIComponent(requestUrl.pathname || '/index.html')
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    if (requestUrl.host !== APP_HOST) {
      return new Response('Not found', { status: 404 })
    }
    const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.slice(1)
    const distRoot = path.resolve(__dirname, '..', 'dist')
    const resolvedPath = path.resolve(distRoot, relativePath)
    const pathWithinDist = path.relative(distRoot, resolvedPath)

    if (pathWithinDist.startsWith('..') || path.isAbsolute(pathWithinDist)) {
      return new Response('Not found', { status: 404 })
    }

    const response = await net.fetch(pathToFileURL(resolvedPath).toString())
    if (!response.ok && isSmokeTest) {
      console.error(`Local asset failed: ${request.url} -> ${response.status}`)
    }
    return response
  })
}

function configurePermissions() {
  const isOwnContent = (webContents) => webContents === widgetWindow?.webContents
  const isAllowedMediaType = (mediaType) =>
    !mediaType || mediaType === 'video' || mediaType === 'audio'

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, _origin, details) =>
      isOwnContent(webContents) &&
      permission === 'media' &&
      isAllowedMediaType(details.mediaType),
  )

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const mediaTypes = Array.isArray(details.mediaTypes)
        ? details.mediaTypes
        : []
      callback(
        isOwnContent(webContents) &&
          permission === 'media' &&
          mediaTypes.length > 0 &&
          mediaTypes.every(isAllowedMediaType),
      )
    },
  )
}

function createWidgetWindow() {
  loadWidgetWindowState()
  widgetWindow = new BrowserWindow({
    ...(getStoredWidgetBounds('collapsed') ?? getInitialBounds(COLLAPSED_SIZE)),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    autoHideMenuBar: true,
    title: 'Codex Gesture Dock',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  })

  widgetWindow.setAlwaysOnTop(true, 'floating')
  widgetWindow.setMenuBarVisibility(false)
  widgetWindow.on('move', rememberCurrentWidgetBounds)
  widgetWindow.on('resize', rememberCurrentWidgetBounds)
  widgetWindow.on('close', () => {
    rememberCurrentWidgetBounds()
    persistWidgetWindowState()
  })
  attachRendererRecovery(widgetWindow, 'Widget', true)
  widgetWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  widgetWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })
  widgetWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isAnySmokeTest || !isMainFrame) return
      finishSmoke(
        {
          passed: false,
          stage: 'did-fail-load',
          errorCode,
          errorDescription,
          url: validatedURL,
        },
        1,
      )
    },
  )

  configurePermissions()

  const devUrl = getDevServerUrl()
  if (devUrl) {
    widgetWindow.loadURL(`${devUrl}?widget=collapsed`)
  } else {
    widgetWindow.loadURL(`${APP_URL_PREFIX}index.html?widget=collapsed`)
  }

  widgetWindow.once('ready-to-show', () => {
    if (!isAnySmokeTest) widgetWindow.show()
  })

  if (isSmokeTest) {
    const timeout = setTimeout(
      () =>
        finishSmoke(
          {
            passed: false,
            stage: 'timeout',
            url: widgetWindow?.webContents.getURL() ?? '',
          },
          1,
        ),
      20_000,
    )
    widgetWindow.webContents.once('did-finish-load', () => {
      clearTimeout(timeout)
      const bounds = widgetWindow.getBounds()
      const passed =
        widgetWindow.isAlwaysOnTop() &&
        Math.abs(bounds.width - COLLAPSED_SIZE.width) <= 2 &&
        Math.abs(bounds.height - COLLAPSED_SIZE.height) <= 2
      finishSmoke(
        {
          passed,
          stage: 'did-finish-load',
          alwaysOnTop: widgetWindow.isAlwaysOnTop(),
          bounds,
          url: widgetWindow.webContents.getURL(),
        },
        passed ? 0 : 1,
      )
    })
  }

  if (isTaskWindowSmokeTest) {
    const timeout = setTimeout(
      () =>
        finishSmoke(
          {
            passed: false,
            stage: 'task-window-timeout',
            widgetUrl: widgetWindow?.webContents.getURL() ?? '',
            taskUrl: taskPickerWindow?.webContents.getURL() ?? '',
          },
          1,
        ),
      25_000,
    )

    widgetWindow.webContents.once('did-finish-load', () => {
      setExpanded(true)
      const taskWindow = createTaskPickerWindow()
      taskWindow.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          try {
            await widgetWindow.webContents.executeJavaScript(
              'window.widgetControls.setExpanded(true)',
            )
            await new Promise((resolve) => setTimeout(resolve, 150))
            const layout = await widgetWindow.webContents.executeJavaScript(`
              (() => {
                const camera = document.querySelector('.compact-camera')
                const cameraRect = camera?.getBoundingClientRect()
                return {
                  expanded: document.querySelector('.widget-root')?.classList.contains('is-expanded') === true,
                  cameraVisible: Boolean(cameraRect && cameraRect.width > 300 && cameraRect.height > 240),
                  gestureCount: document.querySelectorAll('.gesture-book-grid article').length,
                }
              })()
            `)
            const safety = await widgetWindow.webContents.executeJavaScript(`
              (async () => {
                const paused = await window.widgetControls.setWindowsControlEnabled(false)
                const blocked = await window.widgetControls.runCodexAction('dictation')
                const windowsBlocked = await window.widgetControls.runWindowsAction('show_desktop')
                const resumed = await window.widgetControls.setWindowsControlEnabled(true)
                return {
                  paused: paused.enabled === false,
                  actionBlocked: blocked.ok === false,
                  windowsActionBlocked: windowsBlocked.ok === false,
                  resumed: resumed.enabled === true,
                }
              })()
            `)
            const taskPickerVisible = await taskWindow.webContents.executeJavaScript(`
              Boolean(document.querySelector('.task-window-root .task-picker'))
            `)
            widgetWindow.showInactive()
            taskWindow.showInactive()
            widgetWindow.webContents.invalidate()
            taskWindow.webContents.invalidate()
            await new Promise((resolve) => setTimeout(resolve, 120))
            const dashboardScreenshot = await saveSmokeScreenshot(
              widgetWindow,
              'electron-dashboard-smoke.png',
            )
            const taskPickerScreenshot = await saveSmokeScreenshot(
              taskWindow,
              'electron-task-picker-smoke.png',
            )
            const widgetBounds = widgetWindow.getBounds()
            const taskBounds = taskWindow.getBounds()
            const passed =
              widgetWindow.isAlwaysOnTop() &&
              Math.abs(widgetBounds.width - EXPANDED_SIZE.width) <= 2 &&
              Math.abs(widgetBounds.height - EXPANDED_SIZE.height) <= 2 &&
              taskWindow !== widgetWindow &&
              taskWindow.webContents.getURL().includes('view=tasks') &&
              taskPickerVisible &&
              layout.expanded &&
              layout.cameraVisible &&
              layout.gestureCount === 6 &&
              safety.paused &&
              safety.actionBlocked &&
              safety.windowsActionBlocked &&
              safety.resumed

            clearTimeout(timeout)
            finishSmoke(
              {
                passed,
                stage: 'task-window-ready',
                alwaysOnTop: widgetWindow.isAlwaysOnTop(),
                widgetBounds,
                taskBounds,
                widgetUrl: widgetWindow.webContents.getURL(),
                taskUrl: taskWindow.webContents.getURL(),
                ...layout,
                ...safety,
                taskPickerVisible,
                dashboardScreenshot,
                taskPickerScreenshot,
              },
              passed ? 0 : 1,
            )
          } catch (error) {
            clearTimeout(timeout)
            finishSmoke(
              {
                passed: false,
                stage: 'task-window-inspection',
                error: error instanceof Error ? error.message : String(error),
              },
              1,
            )
          }
        }, 180)
      })
    })
  }

  widgetWindow.on('closed', () => {
    closeTaskPickerWindow()
    widgetWindow = null
  })
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    revealPrimaryWindow()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.codexgesturedock.desktop')
    loadTaskBinding()
    codexAdapter.setWindowsControlEnabled(loadWindowsControlEnabled())
    codexAdapter.startWindowsMonitoring(handleWindowsControlEvent)
    registerAppProtocol()
    registerIpc()
    createWidgetWindow()
    desktopAutoUpdater.start()
    void codexAdapter.ensureStarted().catch((error) => {
      if (error?.code === APP_SERVER_CLOSED_CODE) return
      console.warn('Codex App Server preflight failed:', error)
    })
  })

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    isQuitting = true
    desktopAutoUpdater.close()
    codexAdapter.close()
  })
}
