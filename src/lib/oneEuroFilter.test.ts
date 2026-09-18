import { describe, expect, it } from 'vitest'
import {
  advanceOneEuroFilter,
  type OneEuroFilterState,
} from './oneEuroFilter'

function run(values: number[], beta: number) {
  let state: OneEuroFilterState | null = null
  return values.map((value, index) => {
    const result = advanceOneEuroFilter(state, value, index / 30, { beta })
    state = result.state
    return result.value ?? value
  })
}

describe('One Euro filter', () => {
  it('attenuates high-frequency coordinate noise', () => {
    const values = [0.5, 0.56, 0.44, 0.55, 0.45, 0.54, 0.46, 0.5]
    const filtered = run(values, 0)
    const rawRange = Math.max(...values) - Math.min(...values)
    const filteredRange = Math.max(...filtered) - Math.min(...filtered)

    expect(filteredRange).toBeLessThan(rawRange)
  })

  it('follows a fast step more closely when beta is increased', () => {
    const values = [0, 0, 0, 1, 1, 1]
    const slow = run(values, 0)
    const responsive = run(values, 4)

    expect(responsive[4]).toBeGreaterThan(slow[4])
    expect(responsive[5]).toBeGreaterThan(slow[5])
  })

  it('resets on duplicate or backward timestamps', () => {
    const first = advanceOneEuroFilter(null, 0.2, 1)
    const duplicate = advanceOneEuroFilter(first.state, 0.9, 1)
    const backward = advanceOneEuroFilter(duplicate.state, 0.1, 0.9)

    expect(duplicate.reset).toBe(true)
    expect(duplicate.value).toBe(0.9)
    expect(backward.reset).toBe(true)
    expect(backward.value).toBe(0.1)
  })

  it('resets after a long gap and does not reuse the old coordinate', () => {
    const first = advanceOneEuroFilter(null, 0.1, 1)
    const afterGap = advanceOneEuroFilter(first.state, 0.9, 1.6)

    expect(afterGap.reset).toBe(true)
    expect(afterGap.value).toBe(0.9)
  })
})
