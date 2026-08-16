import { describe, expect, it } from 'vitest'
import {
  colorKeyDistance,
  colorKeyFilename,
  computeColorKeyDimensions,
  defaultColorKeySettings,
  removeColorKeyPixels,
  rgbToOklab,
  sampleColorKeyColor,
} from './imageColorKey'

describe('image color key', () => {
  it('removes perceptually matching pixels, preserves source alpha, and clears hidden RGB', () => {
    const source = new Uint8ClampedArray([
      0, 255, 0, 255,
      0, 250, 0, 255,
      255, 0, 0, 128,
    ])
    const result = removeColorKeyPixels(source, 3, 1, { keyColor: '#00FF00', tolerance: 2, feather: 0, despill: 0 })
    expect([...result.pixels]).toEqual([
      0, 0, 0, 0,
      0, 0, 0, 0,
      255, 0, 0, 128,
    ])
    expect(result.visibleSourcePixels).toBe(3)
    expect(result.removedPixels).toBe(2)
    expect(result.remainingPixels).toBe(1)
    expect(result.removedCoverage).toBeCloseTo(2 / 3)
  })

  it('uses an OKLab feather band and reports partially transparent edges', () => {
    const distance = colorKeyDistance(
      { red: 0, green: 0, blue: 0 },
      { red: 32, green: 32, blue: 32 },
    )
    const feather = Math.ceil(distance * 2)
    const expectedAlpha = Math.round(distance / feather * 255)
    const result = removeColorKeyPixels(new Uint8ClampedArray([
      32, 32, 32, 255,
      255, 255, 255, 255,
    ]), 2, 1, { keyColor: '#000000', tolerance: 0, feather, despill: 0 })
    expect(result.pixels[3]).toBe(expectedAlpha)
    expect(result.pixels[7]).toBe(255)
    expect(result.partialPixels).toBe(1)
    expect(result.despilledPixels).toBe(0)
    expect(rgbToOklab(255, 255, 255).l).toBeCloseTo(1, 6)
  })

  it('optionally neutralizes only partially keyed edge colors in proportion to alpha loss', () => {
    const source = new Uint8ClampedArray([
      0, 180, 0, 255,
      255, 0, 0, 255,
    ])
    const distance = colorKeyDistance(
      { red: 0, green: 255, blue: 0 },
      { red: 0, green: 180, blue: 0 },
    )
    const feather = Math.ceil(distance * 2)
    const result = removeColorKeyPixels(source, 2, 1, { keyColor: '#00FF00', tolerance: 0, feather, despill: 100 })
    expect(result.pixels[3]).toBeGreaterThan(100)
    expect(result.pixels[3]).toBeLessThan(155)
    expect(result.pixels[0]).toBeGreaterThan(0)
    expect(result.pixels[1]).toBeLessThan(180)
    expect([...result.pixels.slice(4, 8)]).toEqual([255, 0, 0, 255])
    expect(result.despilledPixels).toBe(1)
  })

  it('samples an alpha-weighted local color and ignores hidden transparent RGB', () => {
    const pixels = new Uint8ClampedArray([
      10, 20, 30, 255,
      30, 40, 50, 255,
      255, 0, 255, 0,
      50, 60, 70, 255,
    ])
    expect(sampleColorKeyColor(pixels, 2, 2, 0.25, 0.25, 1)).toEqual({ red: 30, green: 40, blue: 50, hex: '#1E2832', x: 0, y: 0 })
    expect(() => sampleColorKeyColor(new Uint8ClampedArray([255, 0, 0, 0]), 1, 1, 0.5, 0.5)).toThrow('完全透明')
  })

  it('fails closed for empty results and unsafe settings while bounding output and names', () => {
    expect(() => removeColorKeyPixels(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1, defaultColorKeySettings)).toThrow('移除了全部')
    expect(() => removeColorKeyPixels(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1, { ...defaultColorKeySettings, tolerance: 101 })).toThrow('0–100')
    expect(computeColorKeyDimensions(8_000, 6_000, 1_600, 2_400_000)).toEqual({ width: 1600, height: 1200, scale: 0.2 })
    expect(colorKeyFilename('CON.jpg')).toBe('CON-file-color-key.png')
    expect(colorKeyFilename('bad/name?.jpg')).toBe('bad-name--color-key.png')
  })
})
