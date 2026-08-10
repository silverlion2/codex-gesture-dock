// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const zxingMocks = vi.hoisted(() => ({
  decodeFromImageUrl: vi.fn(),
}))

vi.mock('@zxing/browser', () => ({
  BarcodeFormat: { 11: 'QR_CODE' },
  BrowserMultiFormatReader: class {
    decodeFromImageUrl = zxingMocks.decodeFromImageUrl
  },
}))

import { CODE_IMAGE_MAX_BYTES, decodeCodeImage } from './codeImageScanner'

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:code-image')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('decodeCodeImage', () => {
  it('decodes a supported image locally and releases its object URL', async () => {
    zxingMocks.decodeFromImageUrl.mockResolvedValue({
      getBarcodeFormat: () => 11,
      getText: () => 'https://example.test/local',
    })
    const result = await decodeCodeImage(new File(['png'], 'qr.png', { type: 'image/png' }))

    expect(result).toEqual({ text: 'https://example.test/local', format: 'QR_CODE' })
    expect(zxingMocks.decodeFromImageUrl).toHaveBeenCalledWith('blob:code-image')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:code-image')
  })

  it('maps no-code errors and rejects unsupported or oversized files', async () => {
    zxingMocks.decodeFromImageUrl.mockRejectedValue(new Error('NotFoundException'))
    await expect(decodeCodeImage(new File(['png'], 'empty.png', { type: 'image/png' }))).rejects.toThrow('图片中未找到')
    expect(URL.revokeObjectURL).toHaveBeenCalled()

    await expect(decodeCodeImage(new File(['text'], 'code.txt', { type: 'text/plain' }))).rejects.toThrow('请选择 PNG')
    await expect(decodeCodeImage(new File(['svg'], 'code.svg', { type: 'image/svg+xml' }))).rejects.toThrow('请选择 PNG')
    const oversized = { name: 'huge.png', type: 'image/png', size: CODE_IMAGE_MAX_BYTES + 1 } as File
    await expect(decodeCodeImage(oversized)).rejects.toThrow('不能超过 35 MB')
  })
})
