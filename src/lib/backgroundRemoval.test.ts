import { describe, expect, it } from 'vitest'
import { applyMaskCorrections, backgroundFilename, buildPersonAlpha } from './backgroundRemoval'

describe('background removal helpers', () => {
  it('turns confidence values into a soft foreground alpha mask', () => {
    expect([...buildPersonAlpha(new Float32Array([0, 0.4, 0.5, 0.6, 1]), 0.5, 0.1)])
      .toEqual([0, 0, 128, 255, 255])
  })

  it('clamps unsafe mask settings and creates a safe export name', () => {
    expect([...buildPersonAlpha(new Float32Array([0, 0.5, 1]), 2, 2)]).toEqual([0, 0, 128])
    expect(backgroundFilename('team:photo.jpg', 'transparent')).toBe('team-photo-background-transparent.png')
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
