// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  calculateDocumentSize,
  captureFromImageFile,
  orderDocumentCorners,
} from './documentScanner'

describe('document scanner geometry', () => {
  it('orders four shuffled page corners consistently', () => {
    expect(orderDocumentCorners([
      { x: 90, y: 210 },
      { x: 210, y: 20 },
      { x: 20, y: 30 },
      { x: 220, y: 200 },
    ])).toEqual({
      topLeft: { x: 20, y: 30 },
      topRight: { x: 210, y: 20 },
      bottomRight: { x: 220, y: 200 },
      bottomLeft: { x: 90, y: 210 },
    })
  })

  it('preserves page proportions while limiting the longest edge', () => {
    expect(calculateDocumentSize({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 4_000, y: 0 },
      bottomRight: { x: 4_000, y: 2_000 },
      bottomLeft: { x: 0, y: 2_000 },
    })).toEqual({ width: 2_200, height: 1_100 })
  })

  it('requires an image and enforces the local memory limit', async () => {
    expect(() => captureFromImageFile(new File(['plain text'], 'notes.txt', { type: 'text/plain' })))
      .toThrow('请选择 PNG、JPEG、WebP 或 BMP 图像')

    const oversized = new File([new Uint8Array(35 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' })
    expect(() => captureFromImageFile(oversized)).toThrow('图像不能超过 35 MB')
  })

  it('reads an imported image into a local capture', async () => {
    const capture = await captureFromImageFile(new File(['pixels'], 'receipt.jpeg', { type: 'image/jpeg' }))
    expect(capture.filename).toBe('receipt.png')
    expect(capture.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
  })
})
