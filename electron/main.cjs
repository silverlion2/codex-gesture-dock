const {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  screen,
  session,
  shell,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { CodexAppServerClient } = require('./codex-app-server.cjs')

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

const COLLAPSED_SIZE = { width: 78, height: 78 }
const EXPANDED_SIZE = { width: 420, height: 700 }
const SCREEN_GAP = 14
const APP_HOST = 'codex-gesture-dock'
const APP_URL_PREFIX = `app://${APP_HOST}/`
const isSmokeTest = process.argv.includes('--smoke-test')
const smokeReportPath = path.join(process.cwd(), 'work', 'electron-smoke.json')

let widgetWindow = null
let expanded = false
let lastCodexActionAt = 0
const pendingCodexApprovals = new Map()
const codexTasks = new CodexAppServerClient({
  onServerRequest: handleCodexServerRequest,
  onServerRequestsCleared: clearPendingCodexApprovals,
})

const CODEX_ACTIONS = new Set([
  'quick_chat',
  'dictation',
  'command_menu',
  'review',
  'terminal',
  'sidebar',
  'search_tasks',
])

const CODEX_ACTION_LABELS = {
  quick_chat: '已打开 Codex 快速对话',
  dictation: '已启动 Codex 语音输入',
  command_menu: '已打开 Codex 命令菜单',
  review: '已打开 Codex 代码审查',
  terminal: '已切换 Codex 集成终端',
  sidebar: '已切换 Codex 任务侧栏',
  search_tasks: '已打开 Codex 历史任务搜索',
}

const TASK_FILTERS = new Set(['recent', 'completed', 'archived'])
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
      codexTasks.rejectServerRequest(
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
  setExpanded(true)
  widgetWindow.webContents.send('codex:approval-requested', approval)
}

function clearPendingCodexApprovals() {
  pendingCodexApprovals.clear()
  if (!widgetWindow || widgetWindow.isDestroyed()) return
  widgetWindow.webContents.send('codex:approvals-cleared')
}

function isValidThreadId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(value)
}

async function openCodexThread(threadId) {
  if (!isValidThreadId(threadId)) throw new Error('无效的 Codex 任务编号')
  await shell.openExternal(`codex://threads/${encodeURIComponent(threadId)}`)
}

function finishSmoke(payload, exitCode) {
  if (!isSmokeTest) return

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
  app.exit(exitCode)
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
  expanded = Boolean(nextExpanded)
  const size = expanded ? EXPANDED_SIZE : COLLAPSED_SIZE
  widgetWindow.setBounds(getAnchoredBounds(size), true)
  widgetWindow.webContents.send('widget:state-changed', expanded)
  return expanded
}

function getCodexControlScriptPath() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'electron',
      'codex-control.ps1',
    )
  }
  return path.join(__dirname, 'codex-control.ps1')
}

function runCodexAction(action) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        getCodexControlScriptPath(),
        '-Action',
        action,
      ],
      {
        timeout: 5_000,
        windowsHide: true,
      },
      (error) => {
        if (!error) {
          resolve({
            ok: true,
            action,
            message: CODEX_ACTION_LABELS[action],
          })
          return
        }

        const exitCode = Number(error.code)
        const message =
          exitCode === 2
            ? '没有找到正在运行的 Codex 窗口'
            : exitCode === 3 || exitCode === 4
              ? 'Codex 窗口未能安全获得焦点，已取消快捷键'
              : 'Codex 快捷键执行失败'
        resolve({ ok: false, action, message })
      },
    )
  })
}

function isTrustedSender(event) {
  if (!widgetWindow || event.sender !== widgetWindow.webContents) return false
  const senderUrl = event.senderFrame?.url ?? ''
  return (
    senderUrl.startsWith(APP_URL_PREFIX) ||
    senderUrl.startsWith('http://127.0.0.1:5173/')
  )
}

function registerIpc() {
  ipcMain.handle('widget:get-state', (event) => {
    if (!isTrustedSender(event)) return false
    return expanded
  })

  ipcMain.handle('widget:set-expanded', (event, value) => {
    if (!isTrustedSender(event) || typeof value !== 'boolean') return false
    return setExpanded(value)
  })

  ipcMain.handle('widget:close', (event) => {
    if (!isTrustedSender(event)) return false
    widgetWindow?.close()
    return true
  })

  ipcMain.handle('codex:run-action', async (event, action) => {
    if (!isTrustedSender(event) || !CODEX_ACTIONS.has(action)) {
      return { ok: false, action, message: '不支持的 Codex 动作' }
    }

    const now = Date.now()
    if (now - lastCodexActionAt < 700) {
      return { ok: false, action, message: '手势动作过快，已忽略' }
    }
    lastCodexActionAt = now
    return runCodexAction(action)
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
      const tasks = await codexTasks.listTasks(filter)
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
        codexTasks.respondToServerRequest(requestId, { decision })
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
      if (action === 'open') {
        await openCodexThread(threadId)
        return { ok: true, taskId: threadId, action, message: '已在 Codex 中打开任务' }
      }

      if (action === 'archive') {
        await codexTasks.archiveTask(threadId)
        return { ok: true, taskId: threadId, action, message: '任务已归档' }
      }

      const resumedThreadId = await codexTasks.startTaskAction(threadId, action)
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

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, _origin, details) =>
      isOwnContent(webContents) &&
      permission === 'media' &&
      (!details.mediaType || details.mediaType === 'video'),
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
          mediaTypes.every((mediaType) => mediaType === 'video'),
      )
    },
  )
}

function createWidgetWindow() {
  widgetWindow = new BrowserWindow({
    ...getInitialBounds(COLLAPSED_SIZE),
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
  widgetWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  widgetWindow.webContents.on('will-navigate', (event, url) => {
    const trusted =
      url.startsWith(APP_URL_PREFIX) ||
      url.startsWith('http://127.0.0.1:5173/')
    if (!trusted) event.preventDefault()
  })
  widgetWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isSmokeTest || !isMainFrame) return
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

  const devUrl = process.env.ELECTRON_START_URL
  if (devUrl) {
    widgetWindow.loadURL(`${devUrl}?widget=collapsed`)
  } else {
    widgetWindow.loadURL(`${APP_URL_PREFIX}index.html?widget=collapsed`)
  }

  widgetWindow.once('ready-to-show', () => {
    if (!isSmokeTest) widgetWindow.show()
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

  widgetWindow.on('closed', () => {
    widgetWindow = null
  })
}

app.whenReady().then(() => {
  registerAppProtocol()
  registerIpc()
  createWidgetWindow()
  void codexTasks.ensureStarted().catch((error) => {
    console.warn('Codex App Server preflight failed:', error)
  })
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => codexTasks.close())
