// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pdfMocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  destroy: vi.fn(() => Promise.resolve()),
  getDocument: vi.fn(),
  getPage: vi.fn(),
  render: vi.fn(() => ({ promise: Promise.resolve() })),
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfMocks.getDocument,
}))

import {
  captureFromPdfFile,
  DOCUMENT_MAX_FILE_BYTES,
  DOCUMENT_MAX_PDF_PAGES,
} from './documentScanner'

function pdfFile(name = 'Quarterly: report?.pdf') {
  const file = new File(['pdf'], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
  })
  return file
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cGFnZQ==')
  pdfMocks.getPage.mockImplementation(async () => ({
    cleanup: pdfMocks.cleanup,
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
    render: pdfMocks.render,
  }))
  pdfMocks.getDocument.mockReturnValue({
    destroy: pdfMocks.destroy,
    promise: Promise.resolve({
      getPage: pdfMocks.getPage,
      numPages: 2,
    }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('captureFromPdfFile', () => {
  it('renders PDF pages sequentially into bounded local PNG captures', async () => {
    const progress = vi.fn()
    const captures = await captureFromPdfFile(pdfFile(), progress)

    expect(captures).toEqual([
      { dataUrl: 'data:image/png;base64,cGFnZQ==', filename: 'Quarterly- report--page-1.png' },
      { dataUrl: 'data:image/png;base64,cGFnZQ==', filename: 'Quarterly- report--page-2.png' },
    ])
    expect(progress).toHaveBeenNthCalledWith(1, { page: 1, pageCount: 2 })
    expect(progress).toHaveBeenNthCalledWith(2, { page: 2, pageCount: 2 })
    expect(pdfMocks.getPage).toHaveBeenNthCalledWith(1, 1)
    expect(pdfMocks.getPage).toHaveBeenNthCalledWith(2, 2)
    expect(pdfMocks.render).toHaveBeenCalledTimes(2)
    expect(pdfMocks.cleanup).toHaveBeenCalledTimes(2)
    expect(pdfMocks.destroy).toHaveBeenCalledTimes(1)
  })

  it('rejects oversized or overlong PDFs before rasterizing pages', async () => {
    const oversized = {
      arrayBuffer: vi.fn(),
      name: 'oversized.pdf',
      size: DOCUMENT_MAX_FILE_BYTES + 1,
      type: 'application/pdf',
    } as unknown as File
    await expect(captureFromPdfFile(oversized)).rejects.toThrow('PDF 不能超过 35 MB')
    expect(oversized.arrayBuffer).not.toHaveBeenCalled()

    pdfMocks.getDocument.mockReturnValueOnce({
      destroy: pdfMocks.destroy,
      promise: Promise.resolve({
        getPage: pdfMocks.getPage,
        numPages: DOCUMENT_MAX_PDF_PAGES + 1,
      }),
    })
    await expect(captureFromPdfFile(pdfFile('long.pdf'))).rejects.toThrow('PDF 最多支持 20 页')
    expect(pdfMocks.getPage).not.toHaveBeenCalled()
    expect(pdfMocks.destroy).toHaveBeenCalledTimes(1)
  })
})
