const { CODEX_ACTIONS, emptyDesktopStatus, emptyUiStatus } = require('../windows-control.cjs')
const { CodexAppServerClient } = require('../codex-app-server.cjs')

const DESKTOP_CACHE_MS = 10_000
const UI_CACHE_MS = 30_000

class CodexProgramAdapter {
  constructor({
    appServerClient,
    windowsControl,
    onNotification,
    onServerRequest,
    onServerRequestsCleared,
    now = () => Date.now(),
  } = {}) {
    if (!windowsControl) throw new TypeError('CodexProgramAdapter requires windowsControl')
    this.appServerClient = appServerClient ?? new CodexAppServerClient({
      onNotification,
      onServerRequest,
      onServerRequestsCleared,
    })
    this.windowsControl = windowsControl
    this.now = now
    this.desktopStatus = emptyDesktopStatus()
    this.desktopStatusAt = 0
    this.desktopPromise = null
    this.uiStatus = emptyUiStatus()
    this.uiStatusAt = 0
    this.uiPromise = null
  }

  get id() {
    return 'codex'
  }

  get capabilities() {
    return {
      appServer: ['tasks', 'history', 'events', 'approvals', 'recent-files'],
      desktopActions: [...CODEX_ACTIONS],
      uiAutomation: 'read-only',
      windowEvents: 'live',
      audit: 'metadata-only',
      emergencyStop: true,
      arbitraryInput: false,
    }
  }

  ensureStarted() {
    return this.appServerClient.ensureStarted()
  }

  getRuntimeInfo() {
    return this.appServerClient.getRuntimeInfo()
  }

  listTasks(filter) {
    return this.appServerClient.listTasks(filter)
  }

  listRecentFiles() {
    return this.appServerClient.listRecentFiles()
  }

  archiveTask(threadId) {
    return this.appServerClient.archiveTask(threadId)
  }

  startTaskAction(threadId, action) {
    return this.appServerClient.startTaskAction(threadId, action)
  }

  respondToServerRequest(requestId, result) {
    return this.appServerClient.respondToServerRequest(requestId, result)
  }

  rejectServerRequest(requestId, message) {
    return this.appServerClient.rejectServerRequest(requestId, message)
  }

  setWindowsControlEnabled(enabled) {
    return this.windowsControl.setEnabled(enabled)
  }

  startWindowsMonitoring(callback) {
    return this.windowsControl.startMonitoring(this.id, callback)
  }

  close() {
    this.windowsControl.close()
    this.appServerClient.close()
  }

  supportsDesktopAction(action) {
    return CODEX_ACTIONS.has(action)
  }

  runDesktopAction(action) {
    if (!this.supportsDesktopAction(action)) {
      return Promise.resolve({ ok: false, action, message: '不支持的 Codex 动作' })
    }
    return this.windowsControl.runAction(this.id, action)
  }

  inspectDesktop({ force = false } = {}) {
    const now = this.now()
    if (!force && this.desktopStatusAt && now - this.desktopStatusAt < DESKTOP_CACHE_MS) {
      return Promise.resolve(this.desktopStatus)
    }
    if (this.desktopPromise) return this.desktopPromise

    this.desktopPromise = this.windowsControl
      .inspectProgram(this.id)
      .then((status) => {
        this.desktopStatus = status
        this.desktopStatusAt = this.now()
        return status
      })
      .finally(() => {
        this.desktopPromise = null
      })
    return this.desktopPromise
  }

  inspectUi({ force = false } = {}) {
    const now = this.now()
    if (!force && this.uiStatusAt && now - this.uiStatusAt < UI_CACHE_MS) {
      return Promise.resolve(this.uiStatus)
    }
    if (this.uiPromise) return this.uiPromise

    this.uiPromise = this.windowsControl
      .inspectProgramUi(this.id)
      .then((status) => {
        this.uiStatus = status
        this.uiStatusAt = this.now()
        return status
      })
      .finally(() => {
        this.uiPromise = null
      })
    return this.uiPromise
  }

  async getLayerStatus(options = {}) {
    const runtime = this.getRuntimeInfo()
    const [desktop, uiAutomation] = await Promise.all([
      this.inspectDesktop(options),
      this.inspectUi(options),
    ])
    return this.#createLayerStatus(runtime, desktop, uiAutomation)
  }

  getLayerSnapshot() {
    return this.#createLayerStatus(
      this.getRuntimeInfo(),
      this.desktopStatus,
      this.uiStatus,
    )
  }

  #createLayerStatus(runtime, desktop, uiAutomation) {
    const programConnected = Boolean(runtime?.connected)
    const control = this.windowsControl.getControlStatus()
    return {
      desktop,
      control,
      uiAutomation: {
        ok: uiAutomation.ok,
        mode: uiAutomation.mode,
        elementCount: uiAutomation.elementCount,
        truncated: uiAutomation.truncated,
        message: uiAutomation.message,
      },
      layers: {
        windows: {
          id: 'windows-control-core',
          connected: desktop.connected,
          status: desktop.connected ? 'operational' : 'unavailable',
          enabled: control.enabled,
          monitoring: control.monitor.running,
          identityVerified: desktop.identityVerified === true,
          actionPolicy: 'allowlist',
          uiAutomation: 'read-only',
        },
        program: {
          id: this.id,
          connected: programConnected,
          status: programConnected ? 'operational' : 'unavailable',
          transport: 'app-server',
          capabilityCount: this.capabilities.appServer.length,
        },
      },
      capabilities: this.capabilities,
    }
  }
}

module.exports = { CodexProgramAdapter }
