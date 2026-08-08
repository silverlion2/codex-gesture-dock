import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createRecoveryLimiter } = require('./renderer-recovery.cjs')

describe('renderer recovery limiter', () => {
  it('allows two recoveries and stops a crash loop', () => {
    const limiter = createRecoveryLimiter({ now: () => 100 })

    expect(limiter.record()).toEqual({ attempt: 1, exhausted: false })
    expect(limiter.record()).toEqual({ attempt: 2, exhausted: false })
    expect(limiter.record()).toEqual({ attempt: 3, exhausted: true })
  })

  it('starts a new recovery window after the cooldown', () => {
    let current = 100
    const limiter = createRecoveryLimiter({
      now: () => current,
      windowMs: 1_000,
    })

    limiter.record()
    limiter.record()
    current = 1_101

    expect(limiter.record()).toEqual({ attempt: 1, exhausted: false })
  })
})
