// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { addDailySample, loadDailyStats, ratioFromStats } from './storage'

const STORAGE_KEY = 'duanzheng.daily-stats.v1'

describe('daily posture storage', () => {
  beforeEach(() => localStorage.clear())

  it('rejects malformed or impossible counters from local storage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        goodSeconds: 20,
        trackedSeconds: 5,
      }),
    )

    const stats = loadDailyStats()
    expect(stats.goodSeconds).toBe(0)
    expect(stats.trackedSeconds).toBe(0)
    expect(ratioFromStats(stats)).toBe(0)
  })

  it('records a valid sample after recovering from malformed data', () => {
    localStorage.setItem(STORAGE_KEY, '{broken json')
    const stats = addDailySample(true)
    expect(stats.goodSeconds).toBe(1)
    expect(stats.trackedSeconds).toBe(1)
  })
})
