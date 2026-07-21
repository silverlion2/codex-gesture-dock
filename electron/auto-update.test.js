import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { DesktopAutoUpdater } = require('./auto-update.cjs')

function createUpdater() {
  const updater = new EventEmitter()
  updater.checkForUpdates = vi.fn(() => Promise.resolve())
  updater.quitAndInstall = vi.fn()
  return updater
}

describe('desktop auto updater', () => {
  it('stays disabled outside a packaged Windows build', async () => {
    const updater = createUpdater()
    const manager = new DesktopAutoUpdater({
      updater,
      currentVersion: '0.5.0',
      isPackaged: false,
      platform: 'win32',
    })

    manager.start()
    const status = await manager.check()

    expect(status.phase).toBe('unsupported')
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('stays disabled in the packaged portable build', () => {
    const updater = createUpdater()
    const manager = new DesktopAutoUpdater({
      updater,
      currentVersion: '0.5.0',
      isPackaged: true,
      isPortable: true,
      platform: 'win32',
    })

    manager.start()

    expect(manager.getStatus().phase).toBe('unsupported')
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('downloads stable updates automatically and reports bounded progress', () => {
    const updater = createUpdater()
    const onStatus = vi.fn()
    const manager = new DesktopAutoUpdater({
      updater,
      currentVersion: '0.4.0',
      isPackaged: true,
      platform: 'win32',
      onStatus,
      initialDelayMs: 60_000,
      intervalMs: 60_000,
    })

    manager.start()
    updater.emit('update-available', { version: '0.5.0' })
    updater.emit('download-progress', { percent: 125 })
    updater.emit('update-downloaded', { version: '0.5.0' })

    expect(updater.autoDownload).toBe(true)
    expect(updater.allowPrerelease).toBe(false)
    expect(manager.getStatus()).toMatchObject({
      phase: 'downloaded',
      availableVersion: '0.5.0',
      progress: 100,
    })
    expect(onStatus).toHaveBeenCalled()
    manager.close()
  })

  it('installs only after a verified download event', () => {
    const updater = createUpdater()
    const manager = new DesktopAutoUpdater({
      updater,
      currentVersion: '0.4.0',
      isPackaged: true,
      platform: 'win32',
      initialDelayMs: 60_000,
      intervalMs: 60_000,
    })
    manager.start()

    expect(manager.install()).toBe(false)
    updater.emit('update-downloaded', { version: '0.5.0' })
    expect(manager.install()).toBe(true)
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    manager.close()
  })
})
