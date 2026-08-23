const { execFile, spawn } = require('node:child_process')
const {
  assertWindowsPowerShellPath,
  getWindowsPowerShellPath,
} = require('./windows-powershell.cjs')

const CODEX_ACTION_LABELS = Object.freeze({
  quick_chat: '已打开 Codex 快速对话',
  dictation: '已激活 Codex 话筒',
  command_menu: '已打开 Codex 命令菜单',
  review: '已打开 Codex 代码审查',
  terminal: '已切换 Codex 集成终端',
  sidebar: '已切换 Codex 任务侧栏',
  search_tasks: '已打开 Codex 历史任务搜索',
})

const CODEX_ACTIONS = new Set(Object.keys(CODEX_ACTION_LABELS))
const WINDOWS_ACTION_LABELS = Object.freeze({
  show_desktop: '\u5df2\u663e\u793a Windows \u684c\u9762',
  task_view: '\u5df2\u6253\u5f00 Windows \u4efb\u52a1\u89c6\u56fe',
  open_explorer: '\u5df2\u6253\u5f00\u6587\u4ef6\u8d44\u6e90\u7ba1\u7406\u5668',
  volume_up: '\u5df2\u63d0\u9ad8\u7cfb\u7edf\u97f3\u91cf',
  volume_down: '\u5df2\u964d\u4f4e\u7cfb\u7edf\u97f3\u91cf',
  volume_mute: '\u5df2\u5207\u6362\u7cfb\u7edf\u9759\u97f3',
})
const WINDOWS_ACTIONS = new Set(Object.keys(WINDOWS_ACTION_LABELS))
const SAFE_NAMED_CONTROL_TYPES = new Set([
  'Button',
  'CheckBox',
  'MenuItem',
  'RadioButton',
  'TabItem',
  'TitleBar',
  'ToolBar',
  'Window',
])
const MAX_UI_ELEMENTS = 80
const MAX_UI_STRING = 120
const MONITOR_EVENT_TYPES = new Set([
  'attached',
  'detached',
  'waiting',
  'foreground',
  'show',
  'hide',
  'focus',
  'location',
  'name',
])
const POINTER_COMMAND_TYPES = new Set(['move', 'click', 'scroll'])
const POINTER_COORDINATE_LIMIT = 100_000
const POINTER_RATE_LIMIT_MS = Object.freeze({ move: 35, click: 320, scroll: 100 })
const POINTER_HELPER_RETRY_MS = 3_000

function cleanString(value, maximum = MAX_UI_STRING) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function normalizePointerCommand(value) {
  if (!value || typeof value !== 'object' || !POINTER_COMMAND_TYPES.has(value.kind)) {
    return null
  }
  if (value.kind === 'click') return { kind: 'click' }
  if (value.kind === 'scroll') {
    return value.delta === -1 || value.delta === 1
      ? { kind: 'scroll', delta: value.delta }
      : null
  }
  if (
    !Number.isInteger(value.x) ||
    !Number.isInteger(value.y) ||
    Math.abs(value.x) > POINTER_COORDINATE_LIMIT ||
    Math.abs(value.y) > POINTER_COORDINATE_LIMIT
  ) return null
  return { kind: 'move', x: value.x, y: value.y }
}

function emptyDesktopStatus(message = '尚未检查 Codex 桌面窗口') {
  return {
    connected: false,
    processId: null,
    processName: '',
    windowTitle: '',
    identityVerified: false,
    identityType: '',
    packageName: '',
    packageFamily: '',
    publisher: '',
    message,
  }
}

function emptyUiStatus(message = '尚未检查 Codex UI Automation') {
  return {
    ok: false,
    programId: 'codex',
    mode: 'read-only',
    processId: null,
    processName: '',
    windowTitle: '',
    identityVerified: false,
    identityType: '',
    packageName: '',
    elementCount: 0,
    observedCount: 0,
    truncated: false,
    elements: [],
    message,
  }
}

function emptyMonitorStatus() {
  return {
    running: false,
    connected: false,
    processId: null,
    processName: '',
    identityVerified: false,
    identityType: '',
    packageName: '',
    lastEvent: '',
    lastEventAt: 0,
    lastError: '',
  }
}

class WindowsControlCore {
  constructor({
    execFileImpl = execFile,
    spawnImpl = spawn,
    resolveScriptPath,
    powershellPath = getWindowsPowerShellPath(),
    onAudit,
    now = () => Date.now(),
  } = {}) {
    if (typeof resolveScriptPath !== 'function') {
      throw new TypeError('WindowsControlCore requires resolveScriptPath')
    }
    this.execFile = execFileImpl
    this.spawn = spawnImpl
    this.resolveScriptPath = resolveScriptPath
    this.powershellPath = assertWindowsPowerShellPath(powershellPath)
    this.onAudit = typeof onAudit === 'function' ? onAudit : () => {}
    this.now = now
    this.enabled = true
    this.monitorStatus = emptyMonitorStatus()
    this.monitorProcess = null
    this.monitorCallback = null
    this.monitorDesired = false
    this.monitorRestartTimer = null
    this.pointerProcess = null
    this.pointerRequested = false
    this.pointerRetryAfter = Number.NEGATIVE_INFINITY
    this.lastPointerCommandAt = { move: Number.NEGATIVE_INFINITY, click: Number.NEGATIVE_INFINITY, scroll: Number.NEGATIVE_INFINITY }
  }

  supportsAction(programId, action) {
    return (
      (programId === 'codex' && CODEX_ACTIONS.has(action)) ||
      (programId === 'windows' && WINDOWS_ACTIONS.has(action))
    )
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled)
    if (!this.enabled) this.#stopPointerProcess()
    this.#audit('control-state', {
      enabled: this.enabled,
      ok: true,
    })
    return this.getControlStatus()
  }

  getControlStatus() {
    return {
      enabled: this.enabled,
      actionPolicy: 'allowlist',
      auditEnabled: true,
      monitor: { ...this.monitorStatus },
      pointerEnabled: this.enabled && this.pointerRequested,
    }
  }

  setPointerEnabled(enabled) {
    const requested = Boolean(enabled)
    if (requested && !this.pointerRequested) {
      this.pointerRetryAfter = Number.NEGATIVE_INFINITY
    }
    this.pointerRequested = requested
    if (!this.pointerRequested || !this.enabled) this.#stopPointerProcess()
    const result = {
      enabled: this.enabled && this.pointerRequested,
      message: this.enabled && this.pointerRequested
        ? '空中鼠标已就绪'
        : this.enabled
          ? '空中鼠标已关闭'
          : 'Windows 桌面控制已暂停',
    }
    this.#audit('pointer-state', { enabled: result.enabled, ok: true })
    return result
  }

  sendPointerCommand(command) {
    const normalized = normalizePointerCommand(command)
    if (!normalized) {
      this.#audit('pointer-command', { ok: false, reason: 'invalid-command' })
      return { ok: false, message: '空中鼠标拒绝了无效输入' }
    }
    if (!this.enabled || !this.pointerRequested) {
      return { ok: false, message: '空中鼠标未启用或已急停' }
    }
    const now = this.now()
    if (now - this.lastPointerCommandAt[normalized.kind] < POINTER_RATE_LIMIT_MS[normalized.kind]) {
      return { ok: false, message: '空中鼠标输入过快，已合并' }
    }
    this.lastPointerCommandAt[normalized.kind] = now

    const child = this.#ensurePointerProcess(now)
    if (!child?.stdin || typeof child.stdin.write !== 'function') {
      return { ok: false, message: '空中鼠标 helper 正在冷却或暂时不可用' }
    }
    const line = normalized.kind === 'move'
      ? `move\t${normalized.x}\t${normalized.y}\n`
      : normalized.kind === 'scroll'
        ? `scroll\t${normalized.delta}\n`
        : 'click\n'
    try {
      child.stdin.write(line)
    } catch (error) {
      this.pointerRetryAfter = this.now() + POINTER_HELPER_RETRY_MS
      this.#stopPointerProcess()
      this.#audit('pointer-command', {
        kind: normalized.kind,
        ok: false,
        reason: cleanString(error?.message, 120) || 'write-failed',
      })
      return { ok: false, message: '空中鼠标 helper 暂时不可用' }
    }
    if (normalized.kind !== 'move') {
      this.#audit('pointer-command', {
        kind: normalized.kind,
        ok: true,
        ...(normalized.kind === 'scroll' ? { delta: normalized.delta } : {}),
      })
    }
    return { ok: true, message: '空中鼠标输入已发送' }
  }

  async runAction(programId, action) {
    if (!this.supportsAction(programId, action)) {
      const result = {
        ok: false,
        action,
        message: 'Windows 控制核心拒绝了未列入白名单的动作',
      }
      this.#audit('action', { programId, action, ok: false, reason: 'not-allowlisted' })
      return result
    }

    if (!this.enabled) {
      const result = { ok: false, action, message: 'Windows 桌面控制已暂停' }
      this.#audit('action', { programId, action, ok: false, reason: 'emergency-stop' })
      return result
    }

    if (programId === 'windows') {
      const { error, stdout } = await this.#runScript('windows-system-control.ps1', [
        '-Action',
        action,
      ])
      let scriptResult = {}
      if (!error) {
        try { scriptResult = JSON.parse(String(stdout).trim()) } catch { }
      }
      const validResult =
        !error &&
        scriptResult.ok === true &&
        scriptResult.action === action &&
        scriptResult.backend === 'fixed-system-key'
      if (!validResult) {
        this.#audit('action', {
          programId,
          action,
          ok: false,
          reason: error ? 'execution-failed' : 'invalid-helper-result',
        })
        return {
          ok: false,
          action,
          message: '\u0057\u0069\u006e\u0064\u006f\u0077\u0073 \u7cfb\u7edf\u52a8\u4f5c\u6267\u884c\u5931\u8d25\uff0c\u5df2\u5b89\u5168\u53d6\u6d88',
        }
      }
      const result = {
        ok: true,
        action,
        backend: 'fixed-system-key',
        message: WINDOWS_ACTION_LABELS[action],
      }
      this.#audit('action', { programId, action, ok: true, backend: result.backend })
      return result
    }

    const { error, stdout } = await this.#runScript('codex-control.ps1', [
      '-Action',
      action,
    ])
    if (!error) {
      let scriptResult = {}
      try { scriptResult = JSON.parse(String(stdout).trim()) } catch { }
      if (scriptResult.identityVerified !== true) {
        this.#audit('action', {
          programId,
          action,
          ok: false,
          reason: 'invalid-helper-result',
        })
        return {
          ok: false,
          action,
          message: 'Codex 控制 helper 未返回可信身份结果，已取消动作',
        }
      }
      const result = {
        ok: true,
        action,
        backend: cleanString(scriptResult.backend, 48) || 'verified-shortcut',
        processId: Number(scriptResult.processId) || null,
        identityVerified: scriptResult.identityVerified === true,
        identityType: cleanString(scriptResult.identityType, 48),
        packageName: cleanString(scriptResult.packageName, 80),
        message: CODEX_ACTION_LABELS[action],
      }
      this.#audit('action', {
        programId,
        action,
        ok: true,
        backend: result.backend,
        processId: result.processId,
        identityVerified: result.identityVerified,
      })
      return result
    }

    const exitCode = Number(error.code)
    const message =
      exitCode === 2
        ? '没有找到正在运行的 Codex 窗口'
        : exitCode === 3 || exitCode === 4
          ? 'Codex 窗口未能安全获得焦点，已取消快捷键'
          : exitCode === 5
            ? 'Codex 应用身份验证失败，已取消桌面动作'
            : 'Codex 快捷键执行失败'
    this.#audit('action', {
      programId,
      action,
      ok: false,
      reason: exitCode === 5 ? 'identity-rejected' : 'execution-failed',
      exitCode,
    })
    return { ok: false, action, message }
  }

  inspectProgram(programId) {
    if (programId !== 'codex') {
      return Promise.resolve(emptyDesktopStatus('Windows 控制核心不支持该程序'))
    }

    return this.#runScript('codex-control.ps1', [
      '-Action',
      'quick_chat',
      '-DryRun',
    ]).then(({ error, stdout }) => {
      if (error) {
        return emptyDesktopStatus(
          Number(error.code) === 2
            ? '没有找到正在运行的 Codex 桌面窗口'
            : 'Codex 桌面窗口诊断失败',
        )
      }

      try {
        const result = JSON.parse(String(stdout).trim())
        return {
          connected: result.identityVerified === true,
          processId: Number(result.processId) || null,
          processName: cleanString(result.processName, 64),
          windowTitle: cleanString(result.windowTitle),
          identityVerified: result.identityVerified === true,
          identityType: cleanString(result.identityType, 48),
          packageName: cleanString(result.packageName, 80),
          packageFamily: cleanString(result.packageFamily),
          publisher: cleanString(result.publisher),
          message: result.identityVerified === true
            ? 'Codex 桌面窗口与应用身份已验证'
            : 'Codex 桌面窗口身份验证失败',
        }
      } catch {
        return emptyDesktopStatus('Codex 桌面窗口返回了无效状态')
      }
    })
  }

  inspectProgramUi(programId) {
    if (programId !== 'codex') {
      return Promise.resolve(emptyUiStatus('UI Automation 不支持该程序'))
    }

    return this.#runScript('codex-ui-inspect.ps1', []).then(
      ({ error, stdout }) => {
        if (error) {
          return emptyUiStatus(
            Number(error.code) === 2
              ? '没有找到正在运行的 Codex 桌面窗口'
              : 'Codex UI Automation 只读检查失败',
          )
        }

        try {
          const result = JSON.parse(String(stdout).trim())
          const rawElements = Array.isArray(result.elements) ? result.elements : []
          const elements = rawElements.slice(0, MAX_UI_ELEMENTS).map((element) => {
            const controlType = cleanString(element.controlType, 48) || 'Unknown'
            const canExposeName =
              element.nameRedacted === false &&
              SAFE_NAMED_CONTROL_TYPES.has(controlType)
            return {
              controlType,
              automationId: cleanString(element.automationId),
              name: canExposeName ? cleanString(element.name) : '',
              nameRedacted: !canExposeName,
              isEnabled: Boolean(element.isEnabled),
              isOffscreen: Boolean(element.isOffscreen),
              isKeyboardFocusable: Boolean(element.isKeyboardFocusable),
              supportsInvoke: Boolean(element.supportsInvoke),
              supportsToggle: Boolean(element.supportsToggle),
              supportsSelectionItem: Boolean(element.supportsSelectionItem),
            }
          })

          return {
            ok: result.ok === true && result.identityVerified === true,
            programId: 'codex',
            mode: 'read-only',
            processId: Number(result.processId) || null,
            processName: cleanString(result.processName, 64),
            windowTitle: cleanString(result.windowTitle),
            identityVerified: result.identityVerified === true,
            identityType: cleanString(result.identityType, 48),
            packageName: cleanString(result.packageName, 80),
            elementCount: elements.length,
            observedCount: Math.min(
              Number(result.observedCount) || elements.length,
              240,
            ),
            truncated:
              Boolean(result.truncated) || rawElements.length > MAX_UI_ELEMENTS,
            elements,
            message: result.ok === true && result.identityVerified === true
              ? `UI Automation 已只读检查 ${elements.length} 个控件`
              : 'Codex UI Automation 身份验证或检查失败',
          }
        } catch {
          return emptyUiStatus('Codex UI Automation 返回了无效状态')
        }
      },
    )
  }

  startMonitoring(programId, callback) {
    if (programId !== 'codex') return this.getControlStatus()
    this.monitorDesired = true
    this.monitorCallback = typeof callback === 'function' ? callback : null
    if (!this.monitorProcess) this.#launchMonitor()
    return this.getControlStatus()
  }

  stopMonitoring() {
    this.monitorDesired = false
    if (this.monitorRestartTimer) {
      clearTimeout(this.monitorRestartTimer)
      this.monitorRestartTimer = null
    }
    const process = this.monitorProcess
    this.monitorProcess = null
    if (process && !process.killed) process.kill()
    this.monitorStatus = emptyMonitorStatus()
    return this.getControlStatus()
  }

  close() {
    this.pointerRequested = false
    this.#stopPointerProcess()
    this.stopMonitoring()
  }

  #ensurePointerProcess(now = this.now()) {
    if (this.pointerProcess && !this.pointerProcess.killed) return this.pointerProcess
    if (now < this.pointerRetryAfter) return null
    let child
    try {
      child = this.spawn(
        this.powershellPath,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          this.resolveScriptPath('windows-pointer-control.ps1'),
        ],
        { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] },
      )
    } catch (error) {
      this.pointerRetryAfter = now + POINTER_HELPER_RETRY_MS
      this.#audit('pointer-helper', {
        ok: false,
        reason: cleanString(error?.message, 500) || 'spawn-failed',
      })
      return null
    }
    this.pointerProcess = child
    let errorBuffer = ''
    child.stdin?.on('error', (error) => {
      errorBuffer = cleanString(error?.message, 500)
    })
    child.stderr?.on('data', (chunk) => {
      errorBuffer = `${errorBuffer}${String(chunk)}`.slice(-500)
    })
    child.once('error', (error) => {
      if (this.pointerProcess !== child) return
      this.pointerProcess = null
      this.pointerRetryAfter = this.now() + POINTER_HELPER_RETRY_MS
      this.#audit('pointer-helper', {
        ok: false,
        reason: cleanString(error?.message, 500) || 'spawn-failed',
      })
    })
    child.once('exit', (code) => {
      if (this.pointerProcess !== child) return
      this.pointerProcess = null
      this.pointerRetryAfter = this.now() + POINTER_HELPER_RETRY_MS
      this.#audit('pointer-helper', {
        ok: false,
        reason: cleanString(errorBuffer, 500) || `pointer helper exited (${Number(code) || 0})`,
      })
    })
    this.#audit('pointer-helper', { ok: true, state: 'started' })
    return child
  }

  #stopPointerProcess() {
    const child = this.pointerProcess
    this.pointerProcess = null
    if (child && !child.killed) child.kill()
  }

  #launchMonitor() {
    if (!this.monitorDesired || this.monitorProcess) return
    let child
    try {
      child = this.spawn(
        this.powershellPath,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          this.resolveScriptPath('codex-window-monitor.ps1'),
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (error) {
      this.monitorStatus = {
        ...emptyMonitorStatus(),
        lastError: cleanString(error?.message, 500) || 'monitor spawn failed',
      }
      this.#scheduleMonitorRestart()
      return
    }
    this.monitorProcess = child
    this.monitorStatus = {
      ...this.monitorStatus,
      running: true,
      lastError: '',
    }

    let outputBuffer = ''
    let errorBuffer = ''
    child.stdout?.on('data', (chunk) => {
      outputBuffer = `${outputBuffer}${String(chunk)}`.slice(-32_768)
      let newline = outputBuffer.indexOf('\n')
      while (newline >= 0) {
        const line = outputBuffer.slice(0, newline).trim()
        outputBuffer = outputBuffer.slice(newline + 1)
        if (line) this.#handleMonitorLine(line)
        newline = outputBuffer.indexOf('\n')
      }
    })
    child.stderr?.on('data', (chunk) => {
      errorBuffer = `${errorBuffer}${String(chunk)}`.slice(-500)
    })
    let finished = false
    const finish = (code, error) => {
      if (finished) return
      finished = true
      if (this.monitorProcess === child) this.monitorProcess = null
      this.monitorStatus = {
        ...emptyMonitorStatus(),
        lastError:
          cleanString(error?.message, 500) ||
          cleanString(errorBuffer, 500) ||
          `monitor exited (${Number(code) || 0})`,
      }
      this.#scheduleMonitorRestart()
    }
    child.once('error', (error) => finish(null, error))
    child.once('exit', (code) => finish(code))
  }

  #scheduleMonitorRestart() {
    if (!this.monitorDesired || this.monitorRestartTimer) return
    this.monitorRestartTimer = setTimeout(() => {
      this.monitorRestartTimer = null
      this.#launchMonitor()
    }, 2_000)
    this.monitorRestartTimer.unref?.()
  }

  #handleMonitorLine(line) {
    let raw
    try { raw = JSON.parse(line) } catch { return }
    const type = cleanString(raw.type, 32)
    if (!MONITOR_EVENT_TYPES.has(type)) return
    const attached = type === 'attached'
    const detached = type === 'detached' || type === 'waiting'
    this.monitorStatus = {
      ...this.monitorStatus,
      running: true,
      connected: attached
        ? raw.identityVerified === true
        : detached
          ? false
          : this.monitorStatus.connected,
      processId: attached
        ? Number(raw.processId) || null
        : detached
          ? null
          : this.monitorStatus.processId,
      processName: attached
        ? cleanString(raw.processName, 64)
        : detached
          ? ''
          : this.monitorStatus.processName,
      identityVerified: attached
        ? raw.identityVerified === true
        : detached
          ? false
          : this.monitorStatus.identityVerified,
      identityType: attached
        ? cleanString(raw.identityType, 48)
        : detached
          ? ''
          : this.monitorStatus.identityType,
      packageName: attached
        ? cleanString(raw.packageName, 80)
        : detached
          ? ''
          : this.monitorStatus.packageName,
      lastEvent: type,
      lastEventAt: Math.max(
        0,
        Math.min(Number(raw.timestamp) || this.now(), this.now() + 60_000),
      ),
      lastError: '',
    }
    const event = {
      type,
      processId: this.monitorStatus.processId,
      connected: this.monitorStatus.connected,
      identityVerified: this.monitorStatus.identityVerified,
      timestamp: this.monitorStatus.lastEventAt,
    }
    try { this.monitorCallback?.(event) } catch { }
    if (attached || detached) {
      this.#audit('window-monitor', {
        event: type,
        processId: event.processId,
        identityVerified: event.identityVerified,
        ok: attached ? event.identityVerified : true,
      })
    }
  }

  #audit(kind, fields) {
    try {
      this.onAudit({
        timestamp: new Date(this.now()).toISOString(),
        kind: cleanString(kind, 48),
        ...fields,
      })
    } catch { }
  }

  #runScript(scriptName, args) {
    return new Promise((resolve) => {
      this.execFile(
        this.powershellPath,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          this.resolveScriptPath(scriptName),
          ...args,
        ],
        { timeout: 5_000, windowsHide: true },
        (error, stdout = '', stderr = '') => resolve({ error, stdout, stderr }),
      )
    })
  }
}

module.exports = {
  CODEX_ACTIONS,
  WINDOWS_ACTIONS,
  WindowsControlCore,
  emptyDesktopStatus,
  emptyMonitorStatus,
  emptyUiStatus,
  normalizePointerCommand,
}
