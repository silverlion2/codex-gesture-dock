import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { configureSmokeRuntime } = require('./smoke-runtime.cjs')

describe('smoke runtime', () => {
  it('prevents hardware and software GPU subprocesses in smoke mode', () => {
    const disableHardwareAcceleration = vi.fn()
    const appendSwitch = vi.fn()

    configureSmokeRuntime({
      disableHardwareAcceleration,
      commandLine: { appendSwitch },
    })

    expect(disableHardwareAcceleration).toHaveBeenCalledOnce()
    expect(appendSwitch).toHaveBeenNthCalledWith(1, 'disable-gpu')
    expect(appendSwitch).toHaveBeenNthCalledWith(2, 'disable-software-rasterizer')
  })
})
