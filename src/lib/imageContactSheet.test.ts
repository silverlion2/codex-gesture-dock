// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  computeContactSheetLayout,
  contactSheetFilename,
  fitContactSheetImage,
  validateContactSheetFiles,
  type ContactSheetOptions,
} from './imageContactSheet'

const options: ContactSheetOptions = {
  columns: 3,
  width: 1200,
  aspect: 'square',
  fit: 'contain',
  background: 'light',
  spacing: 'regular',
  showLabels: true,
}

describe('imageContactSheet', () => {
  it('validates image count, types, per-file size, and total size', () => {
    expect(() => validateContactSheetFiles([new File(['a'], 'one.png', { type: 'image/png' })])).toThrow('至少选择 2 张')
    expect(() => validateContactSheetFiles([
      new File(['a'], 'one.png', { type: 'image/png' }),
      new File(['b'], 'two.txt', { type: 'text/plain' }),
    ])).toThrow('不是受支持')
    const valid = [new File(['a'], 'one.png', { type: 'image/png' }), new File(['b'], 'two.jpg', { type: 'image/jpeg' })]
    expect(() => validateContactSheetFiles(valid)).not.toThrow()
  })

  it('computes a stable labelled grid in source order', () => {
    const layout = computeContactSheetLayout(6, options)
    expect(layout).toMatchObject({ width: 1200, height: 910, columns: 3, rows: 2, scale: 1, padding: 14, gap: 14 })
    expect(layout.slots).toHaveLength(6)
    expect(layout.slots[0]).toMatchObject({ x: 14, y: 14, width: 381, imageHeight: 381, labelHeight: 53 })
    expect(layout.slots[3].y).toBe(462)
  })

  it('safely scales tall sheets to the side and pixel budgets', () => {
    const layout = computeContactSheetLayout(20, { ...options, columns: 2, width: 3200, aspect: 'portrait', spacing: 'wide' })
    expect(layout.scale).toBeLessThan(1)
    expect(layout.width).toBeLessThanOrEqual(8192)
    expect(layout.height).toBeLessThanOrEqual(8192)
    expect(layout.width * layout.height).toBeLessThanOrEqual(24_000_000)
    expect(layout.slots).toHaveLength(20)
  })

  it('centers contained images without cropping', () => {
    expect(fitContactSheetImage(1600, 900, 400, 400, 'contain')).toEqual({
      sx: 0,
      sy: 0,
      sw: 1600,
      sh: 900,
      dx: 0,
      dy: 87.5,
      dw: 400,
      dh: 225,
    })
  })

  it('center-crops covered images to the target aspect', () => {
    expect(fitContactSheetImage(1600, 900, 400, 400, 'cover')).toEqual({
      sx: 350,
      sy: 0,
      sw: 900,
      sh: 900,
      dx: 0,
      dy: 0,
      dw: 400,
      dh: 400,
    })
  })

  it('rejects invalid dimensions and runtime fit values', () => {
    expect(() => fitContactSheetImage(0, 900, 400, 400, 'contain')).toThrow('图片尺寸无效')
    expect(() => fitContactSheetImage(1600, 900, 400, 400, 'stretch' as never)).toThrow('图片适配设置无效')
  })

  it('creates a Windows-safe PNG filename from the first image', () => {
    expect(contactSheetFilename('客户<参考>.JPG', 7)).toBe('客户-参考--contact-sheet-7.png')
    expect(contactSheetFilename('CON.png', 2)).toBe('CON-file-contact-sheet-2.png')
    expect(contactSheetFilename('..', 30)).toBe('images-contact-sheet-20.png')
  })
})
