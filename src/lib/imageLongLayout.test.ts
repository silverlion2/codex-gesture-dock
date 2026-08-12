// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  computeLongImageJoinLayout,
  computeLongImageSplitLayout,
  longImageJoinFilename,
  longImageSplitFilename,
  validateLongImageJoinFiles,
} from './imageLongLayout'

describe('imageLongLayout', () => {
  it('validates join count and input types', () => {
    expect(() => validateLongImageJoinFiles([new File(['a'], 'one.png', { type: 'image/png' })])).toThrow('至少选择 2 张')
    expect(() => validateLongImageJoinFiles([
      new File(['a'], 'one.png', { type: 'image/png' }),
      new File(['b'], 'two.txt', { type: 'text/plain' }),
    ])).toThrow('不是受支持')
  })

  it('joins vertically at the smallest width without upscaling', () => {
    const layout = computeLongImageJoinLayout(
      [{ width: 1200, height: 900 }, { width: 800, height: 1000 }],
      [0, 10],
      { direction: 'vertical', gap: 8, background: 'light' },
    )
    expect(layout).toMatchObject({ width: 800, height: 1508, scale: 1, commonCrossAxis: 800 })
    expect(layout.slots[0]).toMatchObject({ sx: 0, sy: 0, sw: 1200, sh: 900, dw: 800, dh: 600 })
    expect(layout.slots[1]).toMatchObject({ sx: 0, sy: 100, sw: 800, sh: 900, dy: 608, dw: 800, dh: 900 })
  })

  it('joins horizontally and removes the leading edge', () => {
    const layout = computeLongImageJoinLayout(
      [{ width: 600, height: 400 }, { width: 800, height: 400 }],
      [0, 25],
      { direction: 'horizontal', gap: 0, background: 'transparent' },
    )
    expect(layout).toMatchObject({ width: 1200, height: 400, scale: 1 })
    expect(layout.slots[1]).toMatchObject({ sx: 200, sy: 0, sw: 600, sh: 400, dx: 600 })
  })

  it('bounds very long joined output by side and pixel budgets', () => {
    const layout = computeLongImageJoinLayout(
      Array.from({ length: 12 }, () => ({ width: 3200, height: 5000 })),
      Array.from({ length: 12 }, () => 0),
      { direction: 'vertical', gap: 24, background: 'dark' },
    )
    expect(layout.scale).toBeLessThan(1)
    expect(layout.width).toBeLessThanOrEqual(8192)
    expect(layout.height).toBeLessThanOrEqual(8192)
    expect(layout.width * layout.height).toBeLessThanOrEqual(24_000_000)
  })

  it('splits a vertical source without gaps or duplicate pixels', () => {
    const layout = computeLongImageSplitLayout({ width: 1200, height: 3001 }, 'vertical', 3)
    expect(layout.scale).toBe(1)
    expect(layout.parts.map((part) => [part.sy, part.sh])).toEqual([[0, 1000], [1000, 1001], [2001, 1000]])
    expect(layout.parts.every((part) => part.width === 1200)).toBe(true)
  })

  it('scales each oversized split part to safe output limits', () => {
    const layout = computeLongImageSplitLayout({ width: 5000, height: 15000 }, 'vertical', 2)
    expect(layout.scale).toBeLessThan(1)
    expect(layout.parts.every((part) => part.width <= 8192 && part.height <= 8192)).toBe(true)
    expect(layout.parts.every((part) => part.width * part.height <= 24_000_000)).toBe(true)
  })

  it('creates Windows-safe deterministic filenames', () => {
    expect(longImageJoinFilename('CON.png', 'vertical')).toBe('CON-file-vertical-long-image.png')
    expect(longImageSplitFilename('client<card>.jpg', 1, 12)).toBe('client-card--part-02-of-12.png')
  })
})
