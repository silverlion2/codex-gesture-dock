// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageWatermarkPanel } from './ImageWatermarkPanel'

const watermarkMocks = vi.hoisted(() => ({ prepare: vi.fn(), preview: vi.fn(), render: vi.fn() }))

vi.mock('../lib/imageWatermark', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/imageWatermark')>()
  return {
    ...original,
    prepareWatermarkBatch: watermarkMocks.prepare,
    renderWatermarkPreview: watermarkMocks.preview,
    renderWatermarkedImage: watermarkMocks.render,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const first = new File(['first'], 'first.png', { type: 'image/png' })
const second = new File(['second'], 'second.jpg', { type: 'image/jpeg' })
const prepared = {
  files: [first, second],
  firstFilename: first.name,
  firstOriginalWidth: 2400,
  firstOriginalHeight: 1600,
  previewWidth: 1200,
  previewHeight: 800,
  previewScale: 0.5,
  firstPreviewBlob: new Blob(['original'], { type: 'image/png' }),
}

describe('ImageWatermarkPanel', () => {
  it('previews text watermark settings and explicitly exports every file', async () => {
    watermarkMocks.prepare.mockResolvedValue(prepared)
    watermarkMocks.preview.mockResolvedValue({ blob: new Blob(['preview'], { type: 'image/png' }), filename: 'first-watermarked.png', width: 1200, height: 800, format: 'png' })
    watermarkMocks.render.mockImplementation(async (file: File) => ({ blob: new Blob(['export'], { type: 'image/jpeg' }), filename: `${file.name}-watermarked.jpg`, width: 2400, height: 1600, format: 'jpeg' }))
    let urlIndex = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:watermark-${++urlIndex}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageWatermarkPanel onMessage={onMessage} />)

    fireEvent.change(screen.getByLabelText('选择待加水印图片'), { target: { files: [first, second] } })
    await waitFor(() => expect(screen.getByLabelText('水印文字')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('水印文字'), { target: { value: '© Demo' } })
    fireEvent.change(screen.getByRole('combobox', { name: '水印位置' }), { target: { value: 'tile' } })
    fireEvent.change(screen.getByRole('slider', { name: '水印不透明度' }), { target: { value: '55' } })
    fireEvent.click(screen.getByRole('button', { name: '生成首图预览' }))

    await waitFor(() => expect(screen.getByAltText('加水印后预览')).toBeTruthy())
    expect(watermarkMocks.preview).toHaveBeenCalledWith(prepared, expect.objectContaining({ text: '© Demo', position: 'tile', opacity: 0.55 }), null, expect.any(AbortSignal))
    fireEvent.change(screen.getByRole('slider', { name: '图片水印前后分界' }), { target: { value: '68' } })
    expect(screen.getByText('前后分界 68%')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: '水印导出格式' }), { target: { value: 'jpeg' } })
    fireEvent.change(screen.getByRole('slider', { name: '水印导出质量' }), { target: { value: '82' } })
    fireEvent.click(screen.getByRole('button', { name: '确认并导出 2 张' }))

    await waitFor(() => expect(click).toHaveBeenCalledTimes(2))
    expect(watermarkMocks.render).toHaveBeenCalledTimes(2)
    expect(watermarkMocks.render).toHaveBeenNthCalledWith(1, first, expect.objectContaining({ text: '© Demo' }), null, 'jpeg', 0.82, expect.any(AbortSignal))
    expect(watermarkMocks.render).toHaveBeenNthCalledWith(2, second, expect.any(Object), null, 'jpeg', 0.82, expect.any(AbortSignal))
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('已请求导出 2 张'))
  })

  it('gates Logo preview until a supported logo is selected', async () => {
    watermarkMocks.prepare.mockResolvedValue(prepared)
    watermarkMocks.preview.mockResolvedValue({ blob: new Blob(['preview'], { type: 'image/png' }), filename: 'first-watermarked.png', width: 1200, height: 800, format: 'png' })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:watermark')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    render(<ImageWatermarkPanel onMessage={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('选择待加水印图片'), { target: { files: [first] } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Logo' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Logo' }))
    expect((screen.getByRole('button', { name: '生成首图预览' }) as HTMLButtonElement).disabled).toBe(true)
    const logo = new File(['logo'], 'logo.webp', { type: 'image/webp' })
    fireEvent.change(screen.getByLabelText('选择水印 Logo'), { target: { files: [logo] } })
    expect((screen.getByRole('button', { name: '生成首图预览' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '生成首图预览' }))
    await waitFor(() => expect(watermarkMocks.preview).toHaveBeenCalledWith(prepared, expect.objectContaining({ mode: 'logo' }), logo, expect.any(AbortSignal)))
  })
})
