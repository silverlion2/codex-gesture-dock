import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { WindowsControlCore, normalizePointerCommand } = require('./windows-control.cjs')

function createCore(implementation, options = {}) {
  return new WindowsControlCore({
    execFileImpl: implementation,
    powershellPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    resolveScriptPath: (name) => `C:\\safe\\${name}`,
    ...options,
  })
}

function createPointerChild() {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = vi.fn(() => { child.killed = true })
  return child
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
    const [file, args] = execFileImpl.mock.calls[0]
    expect(file).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
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

  it('normalizes only bounded pointer commands', () => {
    expect(normalizePointerCommand({ kind: 'move', x: 320, y: -40 })).toEqual({
      kind: 'move',
      x: 320,
      y: -40,
    })
    expect(normalizePointerCommand({ kind: 'move', x: Number.NaN, y: 2 })).toBeNull()
    expect(normalizePointerCommand({ kind: 'scroll', delta: 120 })).toBeNull()
    expect(normalizePointerCommand({ kind: 'type', text: 'secret' })).toBeNull()
  })

  it('starts one lazy pointer helper and writes only fixed commands', () => {
    const child = createPointerChild()
    const spawnImpl = vi.fn(() => child)
    const output = []
    child.stdin.on('data', (chunk) => output.push(String(chunk)))
    const core = createCore(vi.fn(), { spawnImpl, now: () => 1_000 })

    core.setPointerEnabled(true)
    expect(spawnImpl).not.toHaveBeenCalled()
    expect(core.sendPointerCommand({ kind: 'move', x: 100, y: 200 }).ok).toBe(true)
    expect(core.sendPointerCommand({ kind: 'click' }).ok).toBe(true)

    expect(spawnImpl).toHaveBeenCalledOnce()
    expect(spawnImpl.mock.calls[0][0]).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )
    expect(output.join('')).toBe('move\t100\t200\nclick\n')
    core.close()
  })

  it('backs off after pointer helper exit before allowing a restart', () => {
    let now = 1_000
    const children = [createPointerChild(), createPointerChild()]
    const spawnImpl = vi.fn(() => children.shift())
    const core = createCore(vi.fn(), { spawnImpl, now: () => now })

    core.setPointerEnabled(true)
    expect(core.sendPointerCommand({ kind: 'move', x: 10, y: 20 }).ok).toBe(true)
    const firstChild = spawnImpl.mock.results[0].value
    firstChild.emit('exit', 1)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      now += 40
      expect(core.sendPointerCommand({ kind: 'move', x: 11, y: 21 }).ok).toBe(false)
    }
    expect(spawnImpl).toHaveBeenCalledOnce()

    now += 3_000
    expect(core.sendPointerCommand({ kind: 'move', x: 12, y: 22 }).ok).toBe(true)
    expect(spawnImpl).toHaveBeenCalledTimes(2)
    core.close()
  })

  it('fails closed when pointer helper spawn throws synchronously', () => {
    const spawnImpl = vi.fn(() => {
      throw new Error('PowerShell is unavailable')
    })
    const core = createCore(vi.fn(), { spawnImpl, now: () => 1_000 })

    core.setPointerEnabled(true)
    expect(() => core.sendPointerCommand({ kind: 'click' })).not.toThrow()
    expect(core.sendPointerCommand({ kind: 'move', x: 1, y: 2 }).ok).toBe(false)
    expect(spawnImpl).toHaveBeenCalledOnce()
  })

  it('fails closed and stops the pointer helper during emergency stop', () => {
    const child = createPointerChild()
    const spawnImpl = vi.fn(() => child)
    const core = createCore(vi.fn(), { spawnImpl, now: () => 1_000 })

    core.setPointerEnabled(true)
    core.sendPointerCommand({ kind: 'click' })
    core.setEnabled(false)
    const blocked = core.sendPointerCommand({ kind: 'move', x: 10, y: 20 })

    expect(child.kill).toHaveBeenCalledOnce()
    expect(blocked.ok).toBe(false)
  })

  it('rate-limits each pointer command category independently', () => {
    const child = createPointerChild()
    let now = 1_000
    const core = createCore(vi.fn(), {
      spawnImpl: vi.fn(() => child),
      now: () => now,
    })
    core.setPointerEnabled(true)

    expect(core.sendPointerCommand({ kind: 'move', x: 1, y: 1 }).ok).toBe(true)
    now += 10
    expect(core.sendPointerCommand({ kind: 'move', x: 2, y: 2 }).ok).toBe(false)
    expect(core.sendPointerCommand({ kind: 'scroll', delta: 1 }).ok).toBe(true)
    core.close()
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

  it('contains synchronous window-monitor launch failure and schedules bounded retry', () => {
    vi.useFakeTimers()
    try {
      const spawnImpl = vi.fn(() => {
        throw new Error('monitor unavailable')
      })
      const core = createCore(vi.fn(), { spawnImpl })

      expect(() => core.startMonitoring('codex', vi.fn())).not.toThrow()
      expect(core.getControlStatus().monitor).toEqual(expect.objectContaining({
        running: false,
        lastError: 'monitor unavailable',
      }))
      expect(spawnImpl).toHaveBeenCalledOnce()
      core.stopMonitoring()
      vi.advanceTimersByTime(2_000)
      expect(spawnImpl).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
