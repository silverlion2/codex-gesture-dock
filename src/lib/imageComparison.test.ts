import { describe, expect, it } from 'vitest'
import {
  comparePixelBuffers,
  comparisonFilename,
  computeComparisonCanvasSize,
  findChangedBounds,
} from './imageComparison'

function pixel(red: number, green: number, blue: number, alpha = 255) {
  return new Uint8ClampedArray([red, green, blue, alpha])
}

describe('imageComparison', () => {
  it('keeps small images at natural scale and bounds large comparisons', () => {
    expect(computeComparisonCanvasSize(800, 600, 640, 480)).toEqual({
      width: 800,
      height: 600,
      scale: 1,
    })
    expect(computeComparisonCanvasSize(4_000, 2_000, 3_000, 2_000)).toEqual({
      width: 2_400,
      height: 1_200,
      scale: 0.6,
    })
    expect(computeComparisonCanvasSize(4_000, 4_000, 3_000, 3_000)).toEqual({
      width: 2_000,
      height: 2_000,
      scale: 0.5,
    })
  })

  it('reports identical pixels as a complete match', () => {
    const baseline = pixel(20, 80, 120)
    const result = comparePixelBuffers(baseline, baseline.slice(), 1, 1, 0.1)

    expect(result.mismatchPixels).toBe(0)
    expect(result.mismatchPercentage).toBe(0)
    expect(result.matchPercentage).toBe(100)
    expect(result.changedBounds).toBeNull()
  })

  it('returns exact mismatch metrics and changed bounds', () => {
    const baseline = pixel(255, 255, 255)
    const candidate = pixel(0, 0, 0)
    const result = comparePixelBuffers(baseline, candidate, 1, 1, 0.1)

    expect(result.mismatchPixels).toBe(1)
    expect(result.mismatchPercentage).toBe(100)
    expect(result.matchPercentage).toBe(0)
    expect(result.changedBounds).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect([...result.diffPixels]).toEqual([47, 111, 191, 255])
  })

  it('lets tolerance suppress small perceptual differences', () => {
    const baseline = pixel(100, 100, 100)
    const candidate = pixel(125, 125, 125)

    expect(comparePixelBuffers(baseline, candidate, 1, 1, 0.01).mismatchPixels).toBe(1)
    expect(comparePixelBuffers(baseline, candidate, 1, 1, 0.5).mismatchPixels).toBe(0)
  })

  it('finds the enclosing changed rectangle in an RGBA mask', () => {
    const mask = new Uint8ClampedArray(4 * 3 * 4)
    mask[(1 * 4 + 2) * 4 + 3] = 255
    mask[(2 * 4 + 3) * 4 + 3] = 255

    expect(findChangedBounds(mask, 4, 3)).toEqual({ x: 2, y: 1, width: 2, height: 2 })
  })

  it('creates a safe, bounded diff filename', () => {
    expect(comparisonFilename('baseline:home.png', 'candidate?.webp')).toBe('baseline-home-vs-candidate--diff.png')
  })
})
