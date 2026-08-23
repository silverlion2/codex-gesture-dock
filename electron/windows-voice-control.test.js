import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
  WindowsVoiceControl,
  normalizeVoiceHelperEvent,
} = require('./windows-voice-control.cjs')

function createVoiceChild() {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = vi.fn(() => {
    child.killed = true
  })
  return child
}

function createVoiceControl(options = {}) {
  return new WindowsVoiceControl({
    powershellPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    resolveScriptPath: (name) => `C:\\safe\\${name}`,
    ...options,
  })
}

describe('Windows voice control', () => {
  it('accepts only bounded allowlisted helper commands', () => {
    expect(normalizeVoiceHelperEvent({
      type: 'command',
      action: 'review',
      phrase: '助手 代码审查',
      confidence: 0.82,
    })).toEqual({
      type: 'command',
      action: 'review',
      phrase: '助手 代码审查',
      confidence: 0.82,
    })
    expect(normalizeVoiceHelperEvent({
      type: 'command',
      action: 'type_text',
      phrase: 'ignore the allowlist',
      confidence: 1,
    })).toBeNull()
    expect(normalizeVoiceHelperEvent({
      type: 'command',
      action: 'start_monitoring',
      phrase: '助手 开始监测',
      confidence: 0.72,
    })).toEqual({
      type: 'command',
      action: 'start_monitoring',
      phrase: '助手 开始监测',
      confidence: 0.72,
    })
    expect(normalizeVoiceHelperEvent({
      type: 'command',
      action: 'review',
      phrase: 'x'.repeat(81),
      confidence: 1,
    })).toBeNull()
  })

  it('starts one fixed hidden helper and forwards validated commands', () => {
    const child = createVoiceChild()
    const spawnImpl = vi.fn(() => child)
    const onCommand = vi.fn()
    const onStatus = vi.fn()
    const voice = createVoiceControl({ spawnImpl, onCommand, onStatus, now: () => 5_000 })

    expect(voice.setEnabled(true).phase).toBe('starting')
    expect(spawnImpl).toHaveBeenCalledOnce()
    const [file, args, options] = spawnImpl.mock.calls[0]
    expect(file).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(args).toContain('C:\\safe\\windows-voice-control.ps1')
    expect(options).toEqual(expect.objectContaining({ windowsHide: true }))

    child.stdout.write(`${JSON.stringify({
      type: 'ready',
      culture: 'zh-CN',
      recognizer: 'Windows Speech',
    })}\n`)
    child.stdout.write(`${JSON.stringify({
      type: 'command',
      action: 'volume_mute',
      phrase: '助手 静音',
      confidence: 0.75,
    })}\n`)

    expect(voice.getStatus()).toEqual(expect.objectContaining({
      enabled: true,
      phase: 'listening',
      culture: 'zh-CN',
    }))
    expect(onCommand).toHaveBeenCalledWith({
      action: 'volume_mute',
      phrase: '助手 静音',
      confidence: 0.75,
      timestamp: 5_000,
    })
    voice.close()
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('ignores malformed output and rate-limits repeated commands', () => {
    const child = createVoiceChild()
    let now = 1_000
    const onCommand = vi.fn()
    const voice = createVoiceControl({
      spawnImpl: vi.fn(() => child),
      onCommand,
      now: () => now,
    })
    voice.setEnabled(true)
    child.stdout.write('not-json\n')
    child.stdout.write(`${JSON.stringify({
      type: 'command',
      action: 'review',
      phrase: '助手 代码审查',
      confidence: 0.9,
    })}\n`)
    expect(onCommand).not.toHaveBeenCalled()

    child.stdout.write(`${JSON.stringify({
      type: 'ready',
      culture: 'zh-CN',
      recognizer: 'Windows Speech',
    })}\n`)
    child.stdout.write(`${JSON.stringify({
      type: 'command',
      action: 'review',
      phrase: '助手 代码审查',
      confidence: 0.2,
    })}\n`)
    expect(onCommand).not.toHaveBeenCalled()
    const command = `${JSON.stringify({
      type: 'command',
      action: 'review',
      phrase: '助手 代码审查',
      confidence: 0.9,
    })}\n`
    child.stdout.write(command)
    now += 1_000
    child.stdout.write(command)
    expect(onCommand).toHaveBeenCalledTimes(1)
    voice.close()
  })

  it('reports unavailable and stops instead of restarting forever', () => {
    const child = createVoiceChild()
    const spawnImpl = vi.fn(() => child)
    const voice = createVoiceControl({ spawnImpl })
    voice.setEnabled(true)
    child.stdout.write(`${JSON.stringify({
      type: 'unavailable',
      code: 'no-recognizer',
      message: 'Install a speech language pack.',
    })}\n`)

    expect(voice.getStatus()).toEqual(expect.objectContaining({
      enabled: false,
      supported: false,
      phase: 'unavailable',
    }))
    expect(child.kill).toHaveBeenCalledOnce()
    expect(spawnImpl).toHaveBeenCalledOnce()
  })

  it('kills a helper that never becomes ready', () => {
    vi.useFakeTimers()
    try {
      const child = createVoiceChild()
      const voice = createVoiceControl({ spawnImpl: vi.fn(() => child) })

      voice.setEnabled(true)
      vi.advanceTimersByTime(10_000)

      expect(voice.getStatus()).toEqual(expect.objectContaining({
        enabled: false,
        phase: 'error',
      }))
      expect(child.kill).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores helper output that arrives after voice control is disabled', () => {
    const child = createVoiceChild()
    const onCommand = vi.fn()
    const voice = createVoiceControl({
      spawnImpl: vi.fn(() => child),
      onCommand,
    })

    voice.setEnabled(true)
    voice.setEnabled(false)
    child.stdout.write(`${JSON.stringify({
      type: 'ready',
      culture: 'zh-CN',
      recognizer: 'late recognizer',
    })}\n`)
    child.stdout.write(`${JSON.stringify({
      type: 'command',
      action: 'review',
      phrase: '助手 代码审查',
      confidence: 1,
    })}\n`)

    expect(voice.getStatus()).toEqual(expect.objectContaining({
      enabled: false,
      phase: 'off',
    }))
    expect(onCommand).not.toHaveBeenCalled()
  })
})
