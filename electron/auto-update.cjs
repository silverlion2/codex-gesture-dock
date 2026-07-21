const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1_000
const INITIAL_CHECK_DELAY_MS = 15_000

function cleanVersion(value) {
  return typeof value === 'string'
    ? value.replace(/[^0-9A-Za-z.+-]/g, '').slice(0, 48)
    : ''
}

function cleanMessage(value) {
  const text = value instanceof Error ? value.message : String(value || '')
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)
}

class DesktopAutoUpdater {
  constructor({
    updater,
    currentVersion,
    isPackaged,
    isPortable = false,
    platform = process.platform,
    isSmokeTest = false,
    onStatus,
    initialDelayMs = INITIAL_CHECK_DELAY_MS,
    intervalMs = UPDATE_INTERVAL_MS,
  }) {
    this.updater = updater
    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {}
    this.initialDelayMs = initialDelayMs
    this.intervalMs = intervalMs
    this.supported = Boolean(
      isPackaged && platform === 'win32' && !isSmokeTest && !isPortable,
    )
    this.started = false
    this.initialTimer = null
    this.intervalTimer = null
    this.status = {
      supported: this.supported,
      phase: this.supported ? 'idle' : 'unsupported',
      currentVersion: cleanVersion(currentVersion),
      availableVersion: '',
      progress: 0,
      message: this.supported
        ? '\u81ea\u52a8\u66f4\u65b0\u5df2\u5c31\u7eea'
        : '\u81ea\u52a8\u66f4\u65b0\u4ec5\u652f\u6301 Windows \u5b89\u88c5\u7248',
    }
  }

  getStatus() {
    return { ...this.status }
  }

  start() {
    if (this.started || !this.supported) return this.getStatus()
    this.started = true
    this.updater.autoDownload = true
    this.updater.autoInstallOnAppQuit = true
    this.updater.allowPrerelease = false
    this.updater.allowDowngrade = false

    this.updater.on('checking-for-update', () =>
      this.#setStatus({ phase: 'checking', message: '\u6b63\u5728\u68c0\u67e5\u66f4\u65b0' }),
    )
    this.updater.on('update-available', (info) =>
      this.#setStatus({
        phase: 'available',
        availableVersion: cleanVersion(info?.version),
        message: `\u53d1\u73b0\u65b0\u7248\u672c ${cleanVersion(info?.version)}`,
      }),
    )
    this.updater.on('update-not-available', () =>
      this.#setStatus({
        phase: 'up-to-date',
        progress: 0,
        message: '\u5f53\u524d\u5df2\u662f\u6700\u65b0\u7248\u672c',
      }),
    )
    this.updater.on('download-progress', (progress) =>
      this.#setStatus({
        phase: 'downloading',
        progress: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
        message: `\u6b63\u5728\u4e0b\u8f7d\u66f4\u65b0 ${Math.round(Number(progress?.percent) || 0)}%`,
      }),
    )
    this.updater.on('update-downloaded', (info) =>
      this.#setStatus({
        phase: 'downloaded',
        availableVersion: cleanVersion(info?.version) || this.status.availableVersion,
        progress: 100,
        message: '\u66f4\u65b0\u5df2\u4e0b\u8f7d\uff0c\u53ef\u91cd\u542f\u5b89\u88c5',
      }),
    )
    this.updater.on('error', (error) =>
      this.#setStatus({
        phase: 'error',
        message: cleanMessage(error) || '\u81ea\u52a8\u66f4\u65b0\u5931\u8d25',
      }),
    )

    this.initialTimer = setTimeout(() => void this.check(), this.initialDelayMs)
    this.initialTimer.unref?.()
    this.intervalTimer = setInterval(() => void this.check(), this.intervalMs)
    this.intervalTimer.unref?.()
    return this.getStatus()
  }

  async check() {
    if (!this.supported) return this.getStatus()
    if (['checking', 'available', 'downloading'].includes(this.status.phase)) {
      return this.getStatus()
    }
    try {
      await this.updater.checkForUpdates()
    } catch (error) {
      this.#setStatus({
        phase: 'error',
        message: cleanMessage(error) || '\u81ea\u52a8\u66f4\u65b0\u5931\u8d25',
      })
    }
    return this.getStatus()
  }

  install() {
    if (!this.supported || this.status.phase !== 'downloaded') return false
    this.updater.quitAndInstall(false, true)
    return true
  }

  close() {
    if (this.initialTimer) clearTimeout(this.initialTimer)
    if (this.intervalTimer) clearInterval(this.intervalTimer)
    this.initialTimer = null
    this.intervalTimer = null
  }

  #setStatus(next) {
    this.status = { ...this.status, ...next }
    try { this.onStatus(this.getStatus()) } catch { }
  }
}

module.exports = {
  DesktopAutoUpdater,
  INITIAL_CHECK_DELAY_MS,
  UPDATE_INTERVAL_MS,
}
