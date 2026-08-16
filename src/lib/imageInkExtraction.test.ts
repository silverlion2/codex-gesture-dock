import { describe, expect, it } from 'vitest'
import {
  computeInkExtractionDimensions,
  defaultInkExtractionSettings,
  extractInkPixels,
  inkExtractionFilename,
} from './imageInkExtraction'

describe('image ink extraction', () => {
  it('removes a light background, preserves source alpha, and recolors retained ink', () => {
    const source = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 128,
      200, 200, 200, 255,
      100, 50, 20, 255,
    ])
    const result = extractInkPixels(source, 2, 2, { ...defaultInkExtractionSettings, threshold: 200, feather: 0, trim: false, color: '#123456' })
    expect([...result.pixels]).toEqual([
      0, 0, 0, 0,
      18, 52, 86, 128,
      0, 0, 0, 0,
      18, 52, 86, 255,
    ])
    expect(result.retainedPixels).toBe(2)
    expect(result.coverage).toBe(0.5)
  })

  it('supports soft edges, original ink colors, and dark-background extraction', () => {
    const source = new Uint8ClampedArray([
      180, 180, 180, 255,
      220, 220, 220, 255,
    ])
    const light = extractInkPixels(source, 2, 1, { ...defaultInkExtractionSettings, threshold: 220, feather: 40, trim: false, colorMode: 'original' })
    expect([...light.pixels]).toEqual([180, 180, 180, 255, 0, 0, 0, 0])
    const dark = extractInkPixels(source, 2, 1, { ...defaultInkExtractionSettings, background: 'dark', threshold: 180, feather: 40, trim: false, colorMode: 'original' })
    expect([...dark.pixels]).toEqual([0, 0, 0, 0, 220, 220, 220, 255])
  })

  it('trims to retained pixels with bounded padding', () => {
    const pixels = new Uint8ClampedArray(5 * 4 * 4).fill(255)
    const ink = (2 * 5 + 3) * 4
    pixels[ink] = pixels[ink + 1] = pixels[ink + 2] = 0
    const result = extractInkPixels(pixels, 5, 4, { ...defaultInkExtractionSettings, threshold: 200, feather: 0, padding: 1 })
    expect(result.sourceBounds).toEqual({ x: 3, y: 2, width: 1, height: 1 })
    expect([result.width, result.height]).toEqual([3, 3])
    expect(result.pixels[(1 * 3 + 1) * 4 + 3]).toBe(255)
  })

  it('rejects empty masks and unsafe parameters while bounding dimensions and names', () => {
    expect(() => extractInkPixels(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1, defaultInkExtractionSettings)).toThrow('没有保留任何线条')
    expect(() => extractInkPixels(new Uint8ClampedArray(4), 1, 1, { ...defaultInkExtractionSettings, feather: 65 })).toThrow('0–64')
    expect(computeInkExtractionDimensions(8_000, 6_000, 1_600, 2_400_000)).toEqual({ width: 1600, height: 1200, scale: 0.2 })
    expect(inkExtractionFilename('CON.jpg')).toBe('CON-file-ink.png')
    expect(inkExtractionFilename('bad/name?.jpg')).toBe('bad-name--ink.png')
  })
})
