const { spawn } = require('node:child_process')
const {
  assertWindowsPowerShellPath,
  getWindowsPowerShellPath,
} = require('./windows-powershell.cjs')

const VOICE_COMMAND_ACTIONS = new Set([
  'quick_chat',
  'dictation',
  'command_menu',
  'review',
  'terminal',
  'sidebar',
  'search_tasks',
  'show_desktop',
  'task_view',
  'open_explorer',
  'volume_up',
  'volume_down',
  'volume_mute',
  'open_task_picker',
  'start_monitoring',
  'stop_monitoring',
  'minimize_window',
  'restore_window',
  'disable_voice_commands',
])
const VOICE_COMMAND_RATE_LIMIT_MS = 900
const VOICE_ACTION_REPEAT_LIMIT_MS = 1_800
const VOICE_MIN_CONFIDENCE = 0.55
const VOICE_STARTUP_TIMEOUT_MS = 10_000
const MAX_OUTPUT_BUFFER = 32_768

function cleanString(value, maximum) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum)
}

function emptyVoiceControlStatus(message = '语音命令已关闭') {
  return {
    enabled: false,
    supported: true,
    phase: 'off',
    culture: '',
    recognizer: '',
    message,
  }
}

function normalizeVoiceHelperEvent(value) {
  if (!value || typeof value !== 'object') return null
  const type = cleanString(value.type, 24)
  if (type === 'ready') {
    const culture = cleanString(value.culture, 16)
    const recognizer = cleanString(value.recognizer, 120)
    if (!culture || !recognizer) return null
    return { type, culture, recognizer }
  }
  if (type === 'unavailable' || type === 'error') {
    const message = cleanString(value.message, 240)
    const code = cleanString(value.code, 48)
    if (!message) return null
    return { type, code, message }
  }
  if (type !== 'command' || !VOICE_COMMAND_ACTIONS.has(value.action)) return null
  if (typeof value.phrase !== 'string' || value.phrase.length > 80) return null
  const phrase = cleanString(value.phrase, 80)
  const confidence = Number(value.confidence)
  if (!phrase || !Number.isFinite(confidence)) return null
  return {
    type,
    action: value.action,
    phrase,
    confidence: Math.max(0, Math.min(1, confidence)),
  }
}

class WindowsVoiceControl {
  constructor({
    spawnImpl = spawn,
    resolveScriptPath,
    powershellPath = getWindowsPowerShellPath(),
    onCommand,
    onStatus,
    onAudit,
    now = () => Date.now(),
  } = {}) {
    if (typeof resolveScriptPath !== 'function') {
      throw new TypeError('WindowsVoiceControl requires resolveScriptPath')
    }
    this.spawn = spawnImpl
    this.resolveScriptPath = resolveScriptPath
    this.powershellPath = assertWindowsPowerShellPath(powershellPath)
    this.onCommand = typeof onCommand === 'function' ? onCommand : () => {}
    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {}
    this.onAudit = typeof onAudit === 'function' ? onAudit : () => {}
    this.now = now
    this.requested = false
    this.process = null
    this.startupTimer = null
    this.status = emptyVoiceControlStatus()
    this.lastCommandAt = Number.NEGATIVE_INFINITY
    this.lastActionAt = new Map()
  }

  getStatus() {
    return { ...this.status }
  }

  setEnabled(enabled) {
    if (!enabled) {
      this.requested = false
      this.#stopProcess()
      this.lastCommandAt = Number.NEGATIVE_INFINITY
      this.lastActionAt.clear()
      this.#setStatus(emptyVoiceControlStatus())
      this.#audit('voice-state', { enabled: false, ok: true })
      return this.getStatus()
    }

    if (this.process && !this.process.killed) return this.getStatus()
    this.requested = true
    this.#setStatus({
      ...emptyVoiceControlStatus('正在启动本机语音命令'),
      enabled: true,
      phase: 'starting',
    })
    this.#launch()
    return this.getStatus()
  }

  close() {
    this.requested = false
    this.#stopProcess()
    this.status = emptyVoiceControlStatus()
  }

  #launch() {
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
          this.resolveScriptPath('windows-voice-control.ps1'),
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (error) {
      this.#fail('spawn-failed', error?.message || '无法启动语音命令 helper')
      return
    }

    this.process = child
    this.startupTimer = setTimeout(() => {
      if (this.process === child && this.status.phase === 'starting') {
        this.#fail('startup-timeout', '本机语音识别器启动超时，请关闭后重试')
      }
    }, VOICE_STARTUP_TIMEOUT_MS)
    this.startupTimer.unref?.()
    let outputBuffer = ''
    let errorBuffer = ''
    child.stdout?.on('data', (chunk) => {
      if (this.process !== child) return
      outputBuffer = `${outputBuffer}${String(chunk)}`.slice(-MAX_OUTPUT_BUFFER)
      let newline = outputBuffer.indexOf('\n')
      while (newline >= 0) {
        const line = outputBuffer.slice(0, newline).trim()
        outputBuffer = outputBuffer.slice(newline + 1)
        if (line) this.#handleLine(line)
        newline = outputBuffer.indexOf('\n')
      }
    })
    child.stderr?.on('data', (chunk) => {
      if (this.process !== child) return
      errorBuffer = `${errorBuffer}${String(chunk)}`.slice(-500)
    })
    child.once('error', (error) => {
      if (this.process !== child) return
      this.process = null
      this.#fail('process-error', error?.message || '语音命令 helper 启动失败')
    })
    child.once('exit', (code) => {
      if (this.process !== child) return
      this.process = null
      if (!this.requested) return
      if (this.status.phase === 'unavailable' || this.status.phase === 'error') {
        this.requested = false
        return
      }
      this.#fail(
        'unexpected-exit',
        cleanString(errorBuffer, 240) || `语音命令 helper 已退出（${Number(code) || 0}）`,
      )
    })
    this.#audit('voice-helper', { ok: true, state: 'started' })
  }

  #handleLine(line) {
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      this.#audit('voice-helper', { ok: false, reason: 'invalid-json' })
      return
    }
    const event = normalizeVoiceHelperEvent(parsed)
    if (!event) {
      this.#audit('voice-helper', { ok: false, reason: 'invalid-event' })
      return
    }
    if (event.type === 'ready') {
      if (!this.requested) return
      this.#clearStartupTimer()
      this.#setStatus({
        enabled: true,
        supported: true,
        phase: 'listening',
        culture: event.culture,
        recognizer: event.recognizer,
        message: `正在监听固定语音命令（${event.culture}）`,
      })
      this.#audit('voice-state', {
        enabled: true,
        ok: true,
        culture: event.culture,
      })
      return
    }
    if (event.type === 'unavailable' || event.type === 'error') {
      this.#fail(event.code || event.type, event.message, event.type)
      return
    }
    if (!this.requested || this.status.phase !== 'listening') return

    if (event.confidence < VOICE_MIN_CONFIDENCE) {
      this.#audit('voice-command', {
        action: event.action,
        confidence: event.confidence,
        ok: false,
        reason: 'low-confidence',
      })
      return
    }

    const now = this.now()
    const lastActionAt = this.lastActionAt.get(event.action) ?? Number.NEGATIVE_INFINITY
    if (
      now - this.lastCommandAt < VOICE_COMMAND_RATE_LIMIT_MS ||
      now - lastActionAt < VOICE_ACTION_REPEAT_LIMIT_MS
    ) {
      this.#audit('voice-command', {
        action: event.action,
        ok: false,
        reason: 'rate-limited',
      })
      return
    }
    this.lastCommandAt = now
    this.lastActionAt.set(event.action, now)
    const command = {
      action: event.action,
      phrase: event.phrase,
      confidence: event.confidence,
      timestamp: now,
    }
    try {
      this.onCommand(command)
      this.#audit('voice-command', {
        action: event.action,
        confidence: event.confidence,
        ok: true,
      })
    } catch (error) {
      this.#audit('voice-command', {
        action: event.action,
        ok: false,
        reason: cleanString(error?.message, 120) || 'callback-failed',
      })
    }
  }

  #fail(code, message, type = 'error') {
    this.requested = false
    this.#stopProcess()
    this.#setStatus({
      enabled: false,
      supported: type !== 'unavailable',
      phase: type === 'unavailable' ? 'unavailable' : 'error',
      culture: this.status.culture,
      recognizer: this.status.recognizer,
      message: cleanString(message, 240) || '语音命令不可用',
    })
    this.#audit('voice-helper', {
      ok: false,
      reason: cleanString(code, 48) || type,
    })
  }

  #setStatus(status) {
    this.status = { ...status }
    try {
      this.onStatus(this.getStatus())
    } catch { }
  }

  #stopProcess() {
    this.#clearStartupTimer()
    const child = this.process
    this.process = null
    if (child && !child.killed) child.kill()
  }

  #clearStartupTimer() {
    if (!this.startupTimer) return
    clearTimeout(this.startupTimer)
    this.startupTimer = null
  }

  #audit(kind, fields) {
    try {
      this.onAudit({
        timestamp: new Date(this.now()).toISOString(),
        kind,
        ...fields,
      })
    } catch { }
  }
}

module.exports = {
  VOICE_COMMAND_ACTIONS,
  WindowsVoiceControl,
  emptyVoiceControlStatus,
  normalizeVoiceHelperEvent,
}
