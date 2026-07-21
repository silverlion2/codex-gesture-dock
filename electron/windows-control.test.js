import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { WindowsControlCore } = require('./windows-control.cjs')

function createCore(implementation, options = {}) {
  return new WindowsControlCore({
    execFileImpl: implementation,
    resolveScriptPath: (name) => `C:\\safe\\${name}`,
    ...options,
  })
}

describe('Windows control core', () => {
  it('rejects commands outside the program action allowlist before spawning', async () => {
    const execFileImpl = vi.fn()
    const core = createCore(execFileImpl)

    const result = await core.runAction('codex', 'type_arbitrary_text')

    expect(result.ok).toBe(false)
    expect(execFileImpl).not.toHaveBeenCalled()
  })

  it('passes only the fixed script and allowlisted action to PowerShell', async () => {
    const execFileImpl = vi.fn((_file, _args, _options, callback) =>
      callback(null, JSON.stringify({
        backend: 'verified-shortcut',
        processId: 42,
        identityVerified: true,
        identityType: 'msix',
        packageName: 'OpenAI.Codex',
      })),
    )
    const core = createCore(execFileImpl)

    const result = await core.runAction('codex', 'dictation')

    expect(result.ok).toBe(true)
    expect(execFileImpl).toHaveBeenCalledOnce()
    const [, args] = execFileImpl.mock.calls[0]
    expect(args).toContain('C:\\safe\\codex-control.ps1')
    expect(args.slice(-2)).toEqual(['-Action', 'dictation'])
  })

  it('runs Windows actions through the fixed system helper only', async () => {
    const execFileImpl = vi.fn((_file, _args, _options, callback) =>
      callback(null, JSON.stringify({
        ok: true,
        action: 'volume_up',
        backend: 'fixed-system-key',
      })),
    )
    const core = createCore(execFileImpl)

    const result = await core.runAction('windows', 'volume_up')

    expect(result.ok).toBe(true)
    const [, args] = execFileImpl.mock.calls[0]
    expect(args).toContain('C:\\safe\\windows-system-control.ps1')
    expect(args.slice(-2)).toEqual(['-Action', 'volume_up'])
  })

  it('rejects arbitrary Windows input before spawning', async () => {
    const execFileImpl = vi.fn()
    const core = createCore(execFileImpl)

    const result = await core.runAction('windows', 'type_arbitrary_text')

    expect(result.ok).toBe(false)
    expect(execFileImpl).not.toHaveBeenCalled()
  })

  it('fails closed when the Windows helper result is malformed', async () => {
    const core = createCore((_file, _args, _options, callback) =>
      callback(null, JSON.stringify({ ok: true, action: 'volume_down' })),
    )

    const result = await core.runAction('windows', 'volume_up')

    expect(result.ok).toBe(false)
  })

  it('defensively redacts content-bearing UI Automation names', async () => {
    const output = JSON.stringify({
      ok: true,
      processId: 42,
      processName: 'ChatGPT',
      windowTitle: 'Codex',
      identityVerified: true,
      identityType: 'msix',
      observedCount: 2,
      elements: [
        {
          controlType: 'Button',
          automationId: 'new-task',
          name: 'New task',
          nameRedacted: false,
          supportsInvoke: true,
        },
        {
          controlType: 'Edit',
          automationId: 'prompt',
          name: 'super secret prompt',
          nameRedacted: false,
          isKeyboardFocusable: true,
        },
      ],
    })
    const core = createCore((_file, _args, _options, callback) => callback(null, output))

    const result = await core.inspectProgramUi('codex')

    expect(result.ok).toBe(true)
    expect(result.mode).toBe('read-only')
    expect(result.elements[0].name).toBe('New task')
    expect(result.elements[1].name).toBe('')
    expect(JSON.stringify(result)).not.toContain('super secret prompt')
  })

  it('blocks every desktop action while the emergency stop is active', async () => {
    const execFileImpl = vi.fn()
    const core = createCore(execFileImpl)
    core.setEnabled(false)

    const result = await core.runAction('codex', 'dictation')

    expect(result.ok).toBe(false)
    expect(result.message).toContain('已暂停')
    expect(execFileImpl).not.toHaveBeenCalled()
  })

  it('applies the emergency stop to Windows system actions', async () => {
    const execFileImpl = vi.fn()
    const core = createCore(execFileImpl)
    core.setEnabled(false)

    const result = await core.runAction('windows', 'show_desktop')

    expect(result.ok).toBe(false)
    expect(execFileImpl).not.toHaveBeenCalled()
  })

  it('tracks only allowlisted events from the verified window monitor', () => {
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.killed = false
    child.kill = vi.fn(() => { child.killed = true })
    const spawnImpl = vi.fn(() => child)
    const callback = vi.fn()
    const core = createCore(vi.fn(), { spawnImpl })

    core.startMonitoring('codex', callback)
    child.stdout.write(`${JSON.stringify({
      type: 'attached',
      processId: 42,
      processName: 'ChatGPT',
      identityVerified: true,
      identityType: 'msix',
      packageName: 'OpenAI.Codex',
      timestamp: 123,
    })}\n`)

    expect(core.getControlStatus().monitor.connected).toBe(true)
    expect(core.getControlStatus().monitor.identityVerified).toBe(true)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ type: 'attached' }))
    core.close()
    expect(child.kill).toHaveBeenCalledOnce()
  })
})
