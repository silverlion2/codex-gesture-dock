// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageInkExtractionPanel } from './ImageInkExtractionPanel'

const inkMocks = vi.hoisted(() => ({ prepare: vi.fn(), render: vi.fn(), export: vi.fn() }))

vi.mock('../lib/imageInkExtraction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/imageInkExtraction')>()
  return {
    ...actual,
    prepareInkExtractionSource: inkMocks.prepare,
    renderInkExtractionPreview: inkMocks.render,
    exportInkExtraction: inkMocks.export,
  }
})

const prepared = {
  file: new File(['ink'], 'signature.jpg', { type: 'image/jpeg' }),
  filename: 'signature.jpg',
  originalWidth: 2400,
  originalHeight: 1200,
  previewWidth: 1600,
  previewHeight: 800,
  previewScale: 2 / 3,
  outputWidth: 2400,
  outputHeight: 1200,
  outputScale: 1,
  previewPixels: new Uint8ClampedArray(4),
  originalPreviewBlob: new Blob(['original'], { type: 'image/png' }),
}

const preview = {
  blob: new Blob(['preview'], { type: 'image/png' }),
  width: 900,
  height: 320,
  retainedPixels: 12_000,
  coverage: 0.015,
  sourceBounds: { x: 120, y: 180, width: 880, height: 300 },
  settings: {},
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('ImageInkExtractionPanel', () => {
  it('previews, invalidates changed settings, and explicitly exports transparent PNG', async () => {
    inkMocks.prepare.mockResolvedValue(prepared)
    inkMocks.render.mockResolvedValue(preview)
    inkMocks.export.mockResolvedValue({ ...preview, filename: 'signature-ink.png', width: 1800, height: 640 })
    let objectUrl = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:ink-${++objectUrl}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageInkExtractionPanel onMessage={onMessage} />)

    expect(screen.getByText('提取签名、印章或深浅线稿')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('选择线稿抠图图片'), { target: { files: [prepared.file] } })
    await waitFor(() => expect(screen.getByAltText('线稿抠图原图预览')).toBeTruthy())
    expect((screen.getByRole('button', { name: '确认并导出 PNG' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '深色背景 / 浅色线' }))
    expect((screen.getByLabelText('线稿亮度阈值') as HTMLInputElement).value).toBe('35')
    fireEvent.change(screen.getByLabelText('线稿亮度阈值'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: '生成透明预览' }))
    await waitFor(() => expect(screen.getByAltText('透明线稿结果预览')).toBeTruthy())
    expect(inkMocks.render).toHaveBeenCalledWith(prepared, expect.objectContaining({ background: 'dark', threshold: 50 }), expect.any(AbortSignal))
    expect(screen.getByText('1.5%')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('线稿颜色模式'), { target: { value: 'original' } })
    expect(screen.queryByAltText('透明线稿结果预览')).toBeNull()
    expect((screen.getByRole('button', { name: '确认并导出 PNG' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '生成透明预览' }))
    await waitFor(() => expect(screen.getByAltText('透明线稿结果预览')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '确认并导出 PNG' }))
    await waitFor(() => expect(inkMocks.export).toHaveBeenCalledWith(prepared, expect.objectContaining({ colorMode: 'original' }), expect.any(AbortSignal)))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('已导出 signature-ink.png：1800 × 640 透明 PNG')
  })

  it('recovers from an unreadable source and keeps the legal boundary visible', async () => {
    inkMocks.prepare.mockRejectedValue(new Error('无法读取图片：broken.png'))
    render(<ImageInkExtractionPanel onMessage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('选择线稿抠图图片'), { target: { files: [new File(['bad'], 'broken.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('无法读取图片：broken.png'))
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('提取签名、印章或深浅线稿')).toBeTruthy()
  })
})
