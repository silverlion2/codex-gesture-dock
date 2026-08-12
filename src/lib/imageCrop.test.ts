// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { clampCropRectangle, croppedImageFilename, normalizeRotation, rotatedDimensions } from './imageCrop'

describe('imageCrop', () => {
  it('normalizes rotations and swaps dimensions for quarter turns', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(rotatedDimensions(1200, 800, 90)).toEqual({ width: 800, height: 1200 })
    expect(rotatedDimensions(1200, 800, 180)).toEqual({ width: 1200, height: 800 })
  })

  it('clamps crop rectangles to pixel bounds and rejects tiny areas', () => {
    expect(clampCropRectangle({ x: -2.4, y: 10.8, width: 200.2, height: 95.7 }, 160, 100)).toEqual({ x: 0, y: 10, width: 160, height: 90 })
    expect(() => clampCropRectangle({ x: 10, y: 10, width: 4, height: 20 }, 100, 100)).toThrow('不能小于 8 像素')
    expect(() => clampCropRectangle({ x: Number.NaN, y: 0, width: 20, height: 20 }, 100, 100)).toThrow('裁剪坐标无效')
  })

  it('creates safe format-aware filenames', () => {
    expect(croppedImageFilename('客户<照片>.PNG', 'webp')).toBe('客户-照片--cropped.webp')
    expect(croppedImageFilename('CON.png', 'jpeg')).toBe('CON-file-cropped.jpg')
    expect(croppedImageFilename('..', 'png')).toBe('image-cropped.png')
  })
})
