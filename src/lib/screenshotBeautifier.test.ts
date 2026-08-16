// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { beautifiedScreenshotFilename, computeScreenshotBeautifierLayout, defaultScreenshotBeautifierSettings } from './screenshotBeautifier'

describe('screenshotBeautifier', () => {
  it('adds bounded padding and window chrome around an automatic canvas', () => {
    const layout = computeScreenshotBeautifierLayout(1200, 800, defaultScreenshotBeautifierSettings, 8192, 24_000_000)
    expect(layout.width).toBeGreaterThan(1200)
    expect(layout.height).toBeGreaterThan(800)
    expect(layout.frameHeight).toBeGreaterThan(0)
    expect(layout.scale).toBe(1)
  })

  it('expands rather than crops to a fixed aspect ratio', () => {
    const square = computeScreenshotBeautifierLayout(1200, 600, { ...defaultScreenshotBeautifierSettings, aspect: 'square' }, 8192, 24_000_000)
    expect(square.width).toBe(square.height)
    expect(square.imageWidth / square.imageHeight).toBe(2)
  })

  it('keeps oversized outputs inside side and pixel budgets', () => {
    const layout = computeScreenshotBeautifierLayout(8000, 6000, { ...defaultScreenshotBeautifierSettings, aspect: '16:9', paddingPercent: 24 }, 8192, 24_000_000)
    expect(layout.width).toBeLessThanOrEqual(8192)
    expect(layout.height).toBeLessThanOrEqual(8192)
    expect(layout.width * layout.height).toBeLessThanOrEqual(24_000_000)
    expect(layout.scale).toBeLessThan(1)
  })

  it('validates settings and creates safe filenames', () => {
    expect(() => computeScreenshotBeautifierLayout(100, 100, { ...defaultScreenshotBeautifierSettings, paddingPercent: 30 }, 1000, 1_000_000)).toThrow('留白')
    expect(beautifiedScreenshotFilename('CON.png', 'jpeg')).toBe('CON-file-beautified.jpg')
    expect(beautifiedScreenshotFilename('客户<截图>.png', 'webp')).toBe('客户-截图--beautified.webp')
  })
})
