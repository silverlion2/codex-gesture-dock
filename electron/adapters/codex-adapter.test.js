import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { CodexProgramAdapter } = require('./codex-adapter.cjs')

describe('Codex program adapter', () => {
  function createAppServer(connected = false) {
    return {
      getRuntimeInfo: vi.fn().mockReturnValue({ connected }),
      ensureStarted: vi.fn(),
      listTasks: vi.fn(),
      listRecentFiles: vi.fn(),
      archiveTask: vi.fn(),
      startTaskAction: vi.fn(),
      respondToServerRequest: vi.fn(),
      rejectServerRequest: vi.fn(),
      close: vi.fn(),
    }
  }

  it('reports the program and Windows layers independently', async () => {
    const appServerClient = createAppServer(false)
    const windowsControl = {
      inspectProgram: vi.fn().mockResolvedValue({
        connected: true,
        identityVerified: true,
      }),
      inspectProgramUi: vi.fn().mockResolvedValue({
        ok: true,
        mode: 'read-only',
        elementCount: 7,
        truncated: false,
        message: 'ready',
      }),
      getControlStatus: vi.fn().mockReturnValue({
        enabled: true,
        monitor: { running: true },
      }),
      runAction: vi.fn(),
    }
    const adapter = new CodexProgramAdapter({ appServerClient, windowsControl })

    const status = await adapter.getLayerStatus()

    expect(status.layers.windows.status).toBe('operational')
    expect(status.layers.program.status).toBe('unavailable')
    expect(status.uiAutomation.mode).toBe('read-only')
    expect(status.capabilities.desktopActions).toContain('dictation')
  })

  it('does not forward unknown desktop actions', async () => {
    const appServerClient = createAppServer()
    const windowsControl = {
      inspectProgram: vi.fn(),
      inspectProgramUi: vi.fn(),
      runAction: vi.fn(),
    }
    const adapter = new CodexProgramAdapter({ appServerClient, windowsControl })

    const result = await adapter.runDesktopAction('arbitrary')

    expect(result.ok).toBe(false)
    expect(windowsControl.runAction).not.toHaveBeenCalled()
  })
})
