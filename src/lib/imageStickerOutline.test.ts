import { describe, expect, it } from 'vitest'
import {
  computeStickerSourceDimensions,
  defaultStickerOutlineSettings,
  renderStickerOutlinePixels,
  stickerOutlineFilename,
} from './imageStickerOutline'

describe('image sticker outline', () => {
  it('adds a near-round solid outline outside a trimmed transparent subject', () => {
    const pixels = new Uint8ClampedArray(5 * 5 * 4)
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        const offset = (y * 5 + x) * 4
        pixels.set([200, 50, 25, 255], offset)
      }
    }
    const result = renderStickerOutlinePixels(pixels, 5, 5, { outlinePercent: 1, paddingPercent: 0, color: '#FFFFFF' })
    expect(result.sourceBounds).toEqual({ x: 1, y: 1, width: 3, height: 3 })
    expect([result.width, result.height, result.outlineRadius, result.padding]).toEqual([5, 5, 1, 0])
    expect([...result.pixels.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)]).toEqual([200, 50, 25, 255])
    expect([...result.pixels.slice((0 * 5 + 2) * 4, (0 * 5 + 2) * 4 + 4)]).toEqual([255, 255, 255, 255])
    expect([...result.pixels.slice(0, 4)]).toEqual([0, 0, 0, 0])
    expect(result.outlinePixels).toBe(12)
  })

  it('preserves source alpha and RGB while applying a custom outline color', () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4)
    pixels.set([20, 40, 60, 128], (1 * 3 + 1) * 4)
    const result = renderStickerOutlinePixels(pixels, 3, 3, { outlinePercent: 8, paddingPercent: 0, color: '#123456' })
    const center = (1 * result.width + 1) * 4
    expect([...result.pixels.slice(center, center + 4)]).toEqual([20, 40, 60, 128])
    expect([...result.pixels.slice((0 * result.width + 1) * 4, (0 * result.width + 1) * 4 + 4)]).toEqual([18, 52, 86, 255])
  })

  it('scales outline and padding from the visible subject short side', () => {
    const pixels = new Uint8ClampedArray(12 * 12 * 4)
    for (let y = 1; y <= 10; y += 1) for (let x = 1; x <= 10; x += 1) pixels[(y * 12 + x) * 4 + 3] = 255
    const result = renderStickerOutlinePixels(pixels, 12, 12, { outlinePercent: 8, paddingPercent: 8, color: '#000000' })
    expect([result.outlineRadius, result.padding, result.width, result.height]).toEqual([1, 1, 14, 14])
  })

  it('fails closed for missing alpha boundaries and unsafe settings while bounding dimensions and names', () => {
    expect(() => renderStickerOutlinePixels(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1, defaultStickerOutlineSettings)).toThrow('没有透明边界')
    expect(() => renderStickerOutlinePixels(new Uint8ClampedArray(4), 1, 1, defaultStickerOutlineSettings)).toThrow('没有可描边')
    expect(() => renderStickerOutlinePixels(new Uint8ClampedArray([255, 0, 0, 128, 0, 0, 0, 0]), 2, 1, { ...defaultStickerOutlineSettings, outlinePercent: 9 })).toThrow('1%–8%')
    expect(computeStickerSourceDimensions(8_000, 6_000, 1_200, 1_500_000)).toEqual({ width: 1200, height: 900, scale: 0.15 })
    expect(stickerOutlineFilename('CON.png')).toBe('CON-file-sticker.png')
    expect(stickerOutlineFilename('bad/name?.webp')).toBe('bad-name--sticker.png')
  })
})
