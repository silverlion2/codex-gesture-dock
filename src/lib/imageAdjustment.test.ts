// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  adjustImagePixels,
  adjustedImageFilename,
  assertImageAdjustments,
  computeImageAdjustmentDimensions,
  imageAdjustmentPresets,
  isNeutralImageAdjustment,
  neutralImageAdjustments,
  validateImageAdjustmentFile,
} from './imageAdjustment'

describe('imageAdjustment', () => {
  it('validates file type and adjustment ranges', () => {
    expect(() => validateImageAdjustmentFile(new File(['x'], 'note.txt', { type: 'text/plain' }))).toThrow('请选择 PNG')
    expect(() => assertImageAdjustments({ ...neutralImageAdjustments, exposure: 2.1 })).toThrow('曝光')
    expect(() => assertImageAdjustments({ ...neutralImageAdjustments, grayscale: -1 })).toThrow('黑白')
  })

  it('computes bounded preview and output dimensions', () => {
    expect(computeImageAdjustmentDimensions(4000, 3000, 1600, 2_400_000)).toEqual({ width: 1600, height: 1200, scale: 0.4 })
    const safe = computeImageAdjustmentDimensions(8000, 6000, 8192, 24_000_000)
    expect(safe.width * safe.height).toBeLessThanOrEqual(24_000_000)
    expect(safe.scale).toBeLessThan(1)
  })

  it('keeps neutral RGB and alpha bytes unchanged', () => {
    const source = new Uint8ClampedArray([10, 20, 30, 40, 200, 150, 100, 255])
    expect([...adjustImagePixels(source, neutralImageAdjustments)]).toEqual([...source])
  })

  it('applies one stop of exposure while preserving alpha', () => {
    expect([...adjustImagePixels(new Uint8ClampedArray([40, 60, 90, 123]), { ...neutralImageAdjustments, exposure: 1 })]).toEqual([80, 120, 180, 123])
  })

  it('warms red and cools blue channels deterministically', () => {
    const warm = adjustImagePixels(new Uint8ClampedArray([100, 100, 100, 255]), { ...neutralImageAdjustments, temperature: 50 })
    const cool = adjustImagePixels(new Uint8ClampedArray([100, 100, 100, 255]), { ...neutralImageAdjustments, temperature: -50 })
    expect([...warm]).toEqual([136, 100, 64, 255])
    expect([...cool]).toEqual([64, 100, 136, 255])
  })

  it('mixes to weighted grayscale at 100%', () => {
    const result = adjustImagePixels(new Uint8ClampedArray([255, 0, 0, 77]), { ...neutralImageAdjustments, grayscale: 100 })
    expect([...result]).toEqual([54, 54, 54, 77])
  })

  it('provides distinct validated presets and neutral detection', () => {
    expect(isNeutralImageAdjustment(neutralImageAdjustments)).toBe(true)
    expect(isNeutralImageAdjustment(imageAdjustmentPresets.vivid)).toBe(false)
    Object.values(imageAdjustmentPresets).forEach((preset) => expect(() => assertImageAdjustments(preset)).not.toThrow())
  })

  it('creates safe format-aware filenames', () => {
    expect(adjustedImageFilename('CON.png', 'jpeg')).toBe('CON-file-adjusted.jpg')
    expect(adjustedImageFilename('client<photo>.webp', 'png')).toBe('client-photo--adjusted.png')
  })
})
