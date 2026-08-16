// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageAdjustmentPanel } from './ImageAdjustmentPanel'
import { neutralImageAdjustments } from '../lib/imageAdjustment'

const adjustmentMocks = vi.hoisted(() => ({ prepare: vi.fn(), preview: vi.fn(), export: vi.fn() }))

vi.mock('../lib/imageAdjustment', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/imageAdjustment')>()
  return {
    ...original,
    prepareImageAdjustmentSource: adjustmentMocks.prepare,
    renderImageAdjustmentPreview: adjustmentMocks.preview,
    exportAdjustedImage: adjustmentMocks.export,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const file = new File(['photo'], 'photo.png', { type: 'image/png' })
const prepared = {
  file,
  filename: file.name,
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

describe('ImageAdjustmentPanel', () => {
  it('applies settings, compares a preview, and explicitly exports', async () => {
    adjustmentMocks.prepare.mockResolvedValue(prepared)
    adjustmentMocks.preview.mockImplementation(async (_source, settings) => ({ blob: new Blob(['preview'], { type: 'image/png' }), width: 1200, height: 800, settings }))
    adjustmentMocks.export.mockImplementation(async (_source, settings) => ({ blob: new Blob(['export'], { type: 'image/jpeg' }), filename: 'photo-adjusted.jpg', width: 2400, height: 1600, format: 'jpeg', quality: 0.82, settings }))
    let urlIndex = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:adjust-${++urlIndex}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageAdjustmentPanel onMessage={onMessage} />)

    fireEvent.change(screen.getByLabelText('选择待调整图片'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('button', { name: '鲜明' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '鲜明' }))
    expect(screen.getByText('饱和度')).toBeTruthy()
    fireEvent.change(screen.getByRole('slider', { name: '图片曝光' }), { target: { value: '0.5' } })
    fireEvent.click(screen.getByRole('button', { name: '生成调整预览' }))

    await waitFor(() => expect(screen.getByAltText('图片调整后预览')).toBeTruthy())
    expect(adjustmentMocks.preview).toHaveBeenCalledWith(prepared, {
      exposure: 0.5,
      contrast: 12,
      saturation: 24,
      temperature: 4,
      hue: 0,
      sharpness: 18,
      grayscale: 0,
    }, expect.any(AbortSignal))
    fireEvent.change(screen.getByRole('slider', { name: '图片调整前后分界' }), { target: { value: '72' } })
    expect(screen.getByText('前后分界 72%')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: '图片调整导出格式' }), { target: { value: 'jpeg' } })
    fireEvent.change(screen.getByRole('slider', { name: '图片调整导出质量' }), { target: { value: '82' } })
    fireEvent.click(screen.getByRole('button', { name: '确认并导出' }))

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(adjustmentMocks.export).toHaveBeenCalledWith(prepared, expect.objectContaining({ exposure: 0.5, saturation: 24 }), 'jpeg', 0.82, expect.any(AbortSignal))
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('photo-adjusted.jpg'))
  })

  it('recovers after an unreadable image and keeps export gated by preview', async () => {
    adjustmentMocks.prepare.mockRejectedValue(new Error('无法读取图片：broken.png'))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:adjust')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    render(<ImageAdjustmentPanel onMessage={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('选择待调整图片'), { target: { files: [new File(['bad'], 'broken.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('无法读取图片：broken.png'))
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('调整图片的明暗、对比与色彩')).toBeTruthy()

    adjustmentMocks.prepare.mockResolvedValue(prepared)
    fireEvent.change(screen.getByLabelText('选择待调整图片'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('button', { name: '确认并导出' })).toBeTruthy())
    expect((screen.getByRole('button', { name: '确认并导出' }) as HTMLButtonElement).disabled).toBe(true)
    expect(neutralImageAdjustments.exposure).toBe(0)
  })
})
