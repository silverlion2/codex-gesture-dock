import { describe, expect, it } from 'vitest'
import {
  computeWatermarkDimensions,
  defaultWatermarkSettings,
  validateWatermarkFiles,
  validateWatermarkLogo,
  validateWatermarkSettings,
  watermarkAnchor,
  watermarkedImageFilename,
} from './imageWatermark'

function imageFile(name = 'photo.png', size = 10, type = 'image/png') {
  return new File([new Uint8Array(size)], name, { type })
}

describe('imageWatermark', () => {
  it('validates batch count, file types, item size, and total size', () => {
    expect(() => validateWatermarkFiles([imageFile()])).not.toThrow()
    expect(() => validateWatermarkFiles([])).toThrow('至少选择 1 张')
    expect(() => validateWatermarkFiles(Array.from({ length: 13 }, (_, index) => imageFile(`${index}.png`)))).toThrow('最多选择 12 张')
    expect(() => validateWatermarkFiles([imageFile('bad.gif', 10, 'image/gif')])).toThrow('不是受支持')
    expect(() => validateWatermarkFiles([imageFile('large.png', 35 * 1024 * 1024 + 1)])).toThrow('超过 35 MB')
    expect(() => validateWatermarkFiles(Array.from({ length: 5 }, (_, index) => imageFile(`${index}.png`, 33 * 1024 * 1024)))).toThrow('合计不能超过 160 MB')
  })

  it('validates text, logo, and numeric settings', () => {
    expect(() => validateWatermarkSettings(defaultWatermarkSettings)).not.toThrow()
    expect(() => validateWatermarkSettings({ ...defaultWatermarkSettings, text: '' })).toThrow('1–80')
    expect(() => validateWatermarkSettings({ ...defaultWatermarkSettings, opacity: 0.09 })).toThrow('10%–100%')
    expect(() => validateWatermarkSettings({ ...defaultWatermarkSettings, position: 'missing' as never })).toThrow('位置无效')
    expect(() => validateWatermarkSettings({ ...defaultWatermarkSettings, mode: 'logo' })).toThrow('需要选择')
    const logo = imageFile('logo.webp', 100, 'image/webp')
    expect(() => validateWatermarkLogo(logo)).not.toThrow()
    expect(() => validateWatermarkSettings({ ...defaultWatermarkSettings, mode: 'logo' }, logo)).not.toThrow()
    expect(() => validateWatermarkLogo(imageFile('logo.bmp', 100, 'image/bmp'))).toThrow('只支持')
  })

  it('computes bounded preview and output dimensions', () => {
    expect(computeWatermarkDimensions(4000, 2000, 1600, 2_400_000)).toEqual({ width: 1600, height: 800, scale: 0.4 })
    const result = computeWatermarkDimensions(8000, 4000, 8192, 24_000_000)
    expect(result.width * result.height).toBeLessThanOrEqual(24_000_000)
    expect(() => computeWatermarkDimensions(10_000, 9000, 8192, 24_000_000)).toThrow('8000 万')
  })

  it('places the nine anchors around the canvas deterministically', () => {
    expect(watermarkAnchor(1000, 600, 200, 100, 20, 'top-left')).toEqual({ x: 120, y: 70 })
    expect(watermarkAnchor(1000, 600, 200, 100, 20, 'center')).toEqual({ x: 500, y: 300 })
    expect(watermarkAnchor(1000, 600, 200, 100, 20, 'bottom-right')).toEqual({ x: 880, y: 530 })
  })

  it('creates Windows-safe format-aware filenames', () => {
    expect(watermarkedImageFilename('screen:one.png', 'jpeg')).toBe('screen-one-watermarked.jpg')
    expect(watermarkedImageFilename('CON.png', 'png')).toBe('CON-file-watermarked.png')
  })
})
