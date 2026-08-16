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

import { CODE_IMAGE_MAX_BYTES, codeScanBatchCsv, decodeCodeImage, decodeCodeImageBatch } from './codeImageScanner'

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:code-image')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

describe('batch code image scanning', () => {
  it('keeps ordered successes and per-file not-found failures', async () => {
    zxingMocks.decodeFromImageUrl
      .mockResolvedValueOnce({ getText: () => 'FIRST', getBarcodeFormat: () => 1 })
      .mockRejectedValueOnce(new Error('NotFoundException'))
    const progress: string[] = []
    const files = [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })]
    const results = await decodeCodeImageBatch(files, (completed, total) => progress.push(`${completed}/${total}`))
    expect(results.map((item) => item.status)).toEqual(['detected', 'not-found'])
    expect(results[0].text).toBe('FIRST')
    expect(progress).toEqual(['1/2', '2/2'])
  })

  it('creates spreadsheet-safe CSV and validates batch bounds', async () => {
    const csv = codeScanBatchCsv([{ filename: '=bad.png', status: 'detected', format: 'QR_CODE', text: '+formula', error: '' }])
    expect(csv).toContain("'=bad.png")
    expect(csv).toContain("'+formula")
    await expect(decodeCodeImageBatch([new File(['x'], 'one.png', { type: 'image/png' })])).rejects.toThrow('2–20')
  })
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
