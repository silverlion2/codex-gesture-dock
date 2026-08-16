// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageStickerOutlinePanel } from './ImageStickerOutlinePanel'

const stickerMocks = vi.hoisted(() => ({ prepare: vi.fn(), render: vi.fn(), export: vi.fn() }))

vi.mock('../lib/imageStickerOutline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/imageStickerOutline')>()
  return {
    ...actual,
    prepareStickerSource: stickerMocks.prepare,
    renderStickerOutlinePreview: stickerMocks.render,
    exportStickerOutline: stickerMocks.export,
  }
})

const prepared = {
  file: new File(['transparent'], 'subject.png', { type: 'image/png' }),
  filename: 'subject.png',
  originalWidth: 2400,
  originalHeight: 1600,
  previewWidth: 1200,
  previewHeight: 800,
  previewScale: 0.5,
  outputWidth: 2400,
  outputHeight: 1600,
  outputScale: 1,
  previewPixels: new Uint8ClampedArray(4),
  originalPreviewBlob: new Blob(['original'], { type: 'image/png' }),
}

const preview = {
  blob: new Blob(['preview'], { type: 'image/png' }),
  width: 900,
  height: 700,
  visiblePixels: 300_000,
  outlinePixels: 22_000,
  outlineRadius: 18,
  padding: 12,
  sourceBounds: { x: 100, y: 50, width: 840, height: 640 },
  settings: {},
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('ImageStickerOutlinePanel', () => {
  it('previews, checks multiple backdrops, invalidates settings, and explicitly exports PNG', async () => {
    stickerMocks.prepare.mockResolvedValue(prepared)
    stickerMocks.render.mockResolvedValue(preview)
    stickerMocks.export.mockResolvedValue({ ...preview, filename: 'subject-sticker.png', width: 1800, height: 1400 })
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:sticker')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageStickerOutlinePanel onMessage={onMessage} />)

    fireEvent.change(screen.getByLabelText('选择贴纸描边图片'), { target: { files: [prepared.file] } })
    await waitFor(() => expect(screen.getByAltText('贴纸描边透明原图预览')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('贴纸描边宽度'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('贴纸透明留白'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: '生成描边预览' }))
    await waitFor(() => expect(screen.getByAltText('贴纸描边结果预览')).toBeTruthy())
    expect(stickerMocks.render).toHaveBeenCalledWith(prepared, expect.objectContaining({ outlinePercent: 5, paddingPercent: 4 }), expect.any(AbortSignal))
    expect(screen.getByText('22,000 px')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '黑底' }))
    expect(screen.getByAltText('贴纸描边结果预览')).toBeTruthy()
    expect(screen.getByRole('button', { name: '黑底' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByLabelText('贴纸描边颜色'), { target: { value: '#ff0000' } })
    expect(screen.queryByAltText('贴纸描边结果预览')).toBeNull()
    expect((screen.getByRole('button', { name: '确认并导出 PNG' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '生成描边预览' }))
    await waitFor(() => expect(screen.getByAltText('贴纸描边结果预览')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '确认并导出 PNG' }))
    await waitFor(() => expect(stickerMocks.export).toHaveBeenCalledWith(prepared, expect.objectContaining({ color: '#FF0000' }), expect.any(AbortSignal)))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('recovers when the source has no transparent boundary', async () => {
    stickerMocks.prepare.mockRejectedValue(new Error('图片没有透明边界；请先使用人物、线稿或色彩抠图导出透明 PNG'))
    render(<ImageStickerOutlinePanel onMessage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('选择贴纸描边图片'), { target: { files: [prepared.file] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('图片没有透明边界'))
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('给透明人物、Logo 或线稿添加贴纸描边')).toBeTruthy()
  })
})
