// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { computeOptimizedDimensions, optimizedImageFilename } from './imageOptimizer'

describe('imageOptimizer', () => {
  it('preserves aspect ratio and never upscales', () => {
    expect(computeOptimizedDimensions(4_000, 3_000, 1_600)).toEqual({ width: 1_600, height: 1_200, scale: 0.4 })
    expect(computeOptimizedDimensions(800, 600, 1_600)).toEqual({ width: 800, height: 600, scale: 1 })
  })

  it('applies the pixel guard even when original size is requested', () => {
    const result = computeOptimizedDimensions(8_000, 6_000, null)
    expect(result.width * result.height).toBeLessThanOrEqual(24_000_000)
    expect(result.scale).toBeLessThan(1)
    expect(computeOptimizedDimensions(12_000, 1_000, null).width).toBe(8_192)
  })

  it('rejects invalid limits and creates Windows-safe filenames', () => {
    expect(() => computeOptimizedDimensions(0, 600, 1_600)).toThrow('图片尺寸无效')
    expect(() => computeOptimizedDimensions(800, 600, 9_000)).toThrow('最长边必须')
    expect(optimizedImageFilename('客户<原图>.PNG', 'webp')).toBe('客户-原图--optimized.webp')
    expect(optimizedImageFilename('CON.png', 'jpeg')).toBe('CON-file-optimized.jpg')
    expect(optimizedImageFilename('..', 'png')).toBe('image-optimized.png')
  })
})
