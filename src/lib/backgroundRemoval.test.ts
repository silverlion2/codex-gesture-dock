import { describe, expect, it } from 'vitest'
import { applyMaskCorrections, assessIdPhotoFaceLayout, backgroundFilename, buildPersonAlpha, computeBackgroundImageLayout, computeIdPhotoLayout, computeIdPhotoSheetLayout, validateBackgroundImageBatch, validateBackgroundImageFile } from './backgroundRemoval'

describe('background removal helpers', () => {
  it('turns confidence values into a soft foreground alpha mask', () => {
    expect([...buildPersonAlpha(new Float32Array([0, 0.4, 0.5, 0.6, 1]), 0.5, 0.1)])
      .toEqual([0, 0, 128, 255, 255])
  })

  it('clamps unsafe mask settings and creates a safe export name', () => {
    expect([...buildPersonAlpha(new Float32Array([0, 0.5, 1]), 2, 2)]).toEqual([0, 0, 128])
    expect(backgroundFilename('team:photo.jpg', 'transparent')).toBe('team-photo-background-transparent.png')
    expect(backgroundFilename('portrait.jpg', 'solid', 'one-inch')).toBe('portrait-id-photo-one-inch.png')
    expect(backgroundFilename('portrait.jpg', 'solid', 'one-inch', true)).toBe('portrait-id-photo-one-inch-4x6-sheet.png')
    expect(backgroundFilename('portrait.jpg', 'image')).toBe('portrait-background-image.png')
  })

  it('validates local background files and computes deterministic cover/contain placement', () => {
    expect(() => validateBackgroundImageFile({ type: 'image/png', size: 35 * 1024 * 1024 } as File)).not.toThrow()
    expect(() => validateBackgroundImageFile({ type: 'image/svg+xml', size: 100 } as File)).toThrow('PNG、JPEG、WebP 或 BMP')
    expect(() => validateBackgroundImageFile({ type: 'image/jpeg', size: 35 * 1024 * 1024 + 1 } as File)).toThrow('35 MB')

    expect(computeBackgroundImageLayout(1_000, 500, 600, 600, 'cover', 0, 100)).toEqual({
      drawX: 0,
      drawY: 0,
      drawWidth: 1_200,
      drawHeight: 600,
    })
    expect(computeBackgroundImageLayout(1_000, 500, 600, 600, 'cover', 100, 50)).toEqual({
      drawX: -600,
      drawY: 0,
      drawWidth: 1_200,
      drawHeight: 600,
    })
    expect(computeBackgroundImageLayout(1_000, 500, 600, 600, 'contain', 50, 100)).toEqual({
      drawX: 0,
      drawY: 300,
      drawWidth: 600,
      drawHeight: 300,
    })
    expect(() => computeBackgroundImageLayout(0, 500, 600, 600)).toThrow('尺寸无效')
    expect(() => computeBackgroundImageLayout(1_000, 500, 600, 600, 'cover', 101, 50)).toThrow('0%–100%')
  })

  it('bounds batch portrait selections by count, file type, per-file size, and aggregate size', () => {
    const file = (name: string, size = 1_000, type = 'image/png') => ({ name, size, type } as File)
    expect(() => validateBackgroundImageBatch([file('a.png'), file('b.png')])).not.toThrow()
    expect(() => validateBackgroundImageBatch([file('a.png')])).toThrow('2–12')
    expect(() => validateBackgroundImageBatch(Array.from({ length: 13 }, (_, index) => file(`${index}.png`)))).toThrow('2–12')
    expect(() => validateBackgroundImageBatch([file('a.svg', 1_000, 'image/svg+xml'), file('b.png')])).toThrow('PNG、JPEG、WebP 或 BMP')
    expect(() => validateBackgroundImageBatch(Array.from({ length: 5 }, (_, index) => file(`${index}.png`, 33 * 1024 * 1024)))).toThrow('160 MB')
  })

  it('centers the maximum whole-photo grid on a 4 by 6 inch sheet', () => {
    expect(computeIdPhotoSheetLayout(295, 413)).toEqual({ width: 1800, height: 1200, columns: 5, rows: 2, count: 10, startX: 114.5, startY: 175, gap: 24 })
    expect(computeIdPhotoSheetLayout(600, 600)).toMatchObject({ columns: 2, rows: 1, count: 2 })
    expect(() => computeIdPhotoSheetLayout(1801, 1200)).toThrow('无法放入')
  })

  it('reports single-person size and centering signals without claiming compliance', () => {
    const centered = assessIdPhotoFaceLayout([{ x: 0.35, y: 0.15, width: 0.3, height: 0.35, confidence: 0.9 }], 800, 1200, '35x45', 50)
    expect(centered).toMatchObject({ status: 'review', faceCount: 1, horizontalOffsetPercent: 0 })
    expect(centered.faceHeightPercent).toBeCloseTo(40.83, 1)
    expect(centered.signals).toEqual(['未发现明显的单人居中或脸部大小问题'])
    expect(assessIdPhotoFaceLayout([], 800, 1200, '35x45')).toMatchObject({ status: 'no-face', faceCount: 0 })
    expect(assessIdPhotoFaceLayout([
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2, confidence: 0.8 },
      { x: 0.6, y: 0.1, width: 0.2, height: 0.2, confidence: 0.8 },
    ], 800, 1200, '35x45')).toMatchObject({ status: 'multiple-faces', faceCount: 2 })
  })

  it('computes exact ID-photo canvas sizes with bounded vertical positioning', () => {
    expect(computeIdPhotoLayout(800, 1200, '35x45', 0)).toEqual({
      targetWidth: 413,
      targetHeight: 531,
      drawX: 0,
      drawY: 0,
      drawWidth: 413,
      drawHeight: 619.5,
    })
    expect(computeIdPhotoLayout(800, 1200, '35x45', 100).drawY).toBe(-88.5)
    expect(computeIdPhotoLayout(600, 600, 'us-2x2', 50)).toMatchObject({ targetWidth: 600, targetHeight: 600, drawX: 0, drawY: 0 })
    expect(() => computeIdPhotoLayout(800, 1200, 'one-inch', 101)).toThrow('垂直位置')
  })

  it('paints bounded soft keep/remove corrections over the generated alpha', () => {
    const kept = applyMaskCorrections(new Uint8ClampedArray(25), 5, 5, [{
      id: 'keep-center',
      mode: 'keep',
      radius: 0.3,
      points: [{ x: 0.5, y: 0.5 }],
    }])
    expect(kept[12]).toBe(255)
    expect(kept[0]).toBe(0)
    expect(kept[7]).toBeGreaterThan(0)

    const removed = applyMaskCorrections(new Uint8ClampedArray(25).fill(255), 5, 5, [{
      id: 'remove-line',
      mode: 'remove',
      radius: 0.2,
      points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }],
    }])
    expect(removed[11]).toBe(0)
    expect(removed[12]).toBe(0)
    expect(removed[13]).toBe(0)
    expect(removed[2]).toBe(255)
  })

  it('rejects malformed correction dimensions', () => {
    expect(() => applyMaskCorrections(new Uint8ClampedArray(3), 2, 2, []))
      .toThrow('人物分割蒙版尺寸无效')
  })
})
