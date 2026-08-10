// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { analyzeDocumentQualityPixels } from './documentQuality'

function pixels(width: number, height: number, valueAt: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = valueAt(x, y)
      const offset = (y * width + x) * 4
      data[offset] = value
      data[offset + 1] = value
      data[offset + 2] = value
      data[offset + 3] = 255
    }
  }
  return data
}

describe('document quality analysis', () => {
  it('accepts a sharp, high-contrast document-sized image', () => {
    const report = analyzeDocumentQualityPixels(
      pixels(1_200, 800, (x, y) => (x % 80 < 8 && y % 28 < 4 ? 25 : 235)),
      1_200,
      800,
    )
    expect(report.status).toBe('good')
    expect(report.issues).toEqual([])
    expect(report.sharpness).toBeGreaterThan(5.5)
  })

  it('separately reports dark, bright, and low-contrast captures', () => {
    const dark = analyzeDocumentQualityPixels(pixels(1_200, 800, () => 20), 1_200, 800)
    const bright = analyzeDocumentQualityPixels(pixels(1_200, 800, () => 250), 1_200, 800)
    expect(dark.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(['dark', 'low-contrast']))
    expect(bright.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(['bright', 'low-contrast']))
  })

  it('finds smooth blur, concentrated glare, and low resolution without blocking analysis', () => {
    const blurred = analyzeDocumentQualityPixels(
      pixels(1_200, 800, (x) => Math.round(x / 1_199 * 255)),
      1_200,
      800,
    )
    expect(blurred.issues.map((entry) => entry.code)).toContain('blur')

    const glare = analyzeDocumentQualityPixels(
      pixels(1_200, 800, (x, y) => (x > 900 && y < 600 ? 255 : 105)),
      1_200,
      800,
    )
    expect(glare.issues.map((entry) => entry.code)).toContain('glare')

    const small = analyzeDocumentQualityPixels(pixels(600, 400, (x) => x % 40 < 4 ? 20 : 235), 600, 400)
    expect(small.status).toBe('review')
    expect(small.issues.map((entry) => entry.code)).toEqual(['low-resolution'])
  })

  it('rejects inconsistent pixel buffers', () => {
    expect(() => analyzeDocumentQualityPixels(new Uint8ClampedArray(4), 10, 10)).toThrow('无效')
  })
})
