// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageColorKeyPanel } from './ImageColorKeyPanel'

const colorKeyMocks = vi.hoisted(() => ({ prepare: vi.fn(), render: vi.fn(), export: vi.fn(), sample: vi.fn() }))

vi.mock('../lib/imageColorKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/imageColorKey')>()
  return {
    ...actual,
    prepareColorKeySource: colorKeyMocks.prepare,
    renderColorKeyPreview: colorKeyMocks.render,
    exportColorKey: colorKeyMocks.export,
    sampleColorKeyColor: colorKeyMocks.sample,
  }
})

const prepared = {
  file: new File(['green'], 'product.jpg', { type: 'image/jpeg' }),
  filename: 'product.jpg',
  originalWidth: 2400,
  originalHeight: 1600,
  previewWidth: 1500,
  previewHeight: 1000,
  previewScale: 0.625,
  outputWidth: 2400,
  outputHeight: 1600,
  outputScale: 1,
  previewPixels: new Uint8ClampedArray(4),
  originalPreviewBlob: new Blob(['original'], { type: 'image/png' }),
}

const preview = {
  blob: new Blob(['preview'], { type: 'image/png' }),
  width: 1500,
  height: 1000,
  visibleSourcePixels: 1_500_000,
  removedPixels: 900_000,
  partialPixels: 12_345,
  despilledPixels: 8_765,
  remainingPixels: 600_000,
  removedCoverage: 0.6,
  settings: {},
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('ImageColorKeyPanel', () => {
  it('samples a background, invalidates changed settings, and explicitly exports PNG', async () => {
    colorKeyMocks.prepare.mockResolvedValue(prepared)
    colorKeyMocks.sample.mockReturnValueOnce({ hex: '#00FF00' }).mockReturnValueOnce({ hex: '#F0F0F0' })
    colorKeyMocks.render.mockResolvedValue(preview)
    colorKeyMocks.export.mockResolvedValue({ ...preview, filename: 'product-color-key.png', width: 2400, height: 1600 })
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:color-key')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}) })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageColorKeyPanel onMessage={onMessage} />)

    fireEvent.change(screen.getByLabelText('选择色彩抠图图片'), { target: { files: [prepared.file] } })
    await waitFor(() => expect(screen.getByAltText('色彩抠图原图预览')).toBeTruthy())
    fireEvent.pointerDown(screen.getByRole('button', { name: '点击图片取样要移除的背景颜色' }), { clientX: 100, clientY: 25 })
    expect(screen.getByText('#F0F0F0')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已取样目标背景色 #F0F0F0；请生成预览检查同色主体')

    fireEvent.change(screen.getByLabelText('色彩抠图颜色容差'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: '生成透明预览' }))
    await waitFor(() => expect(screen.getByAltText('透明色彩抠图结果预览')).toBeTruthy())
    expect(colorKeyMocks.render).toHaveBeenCalledWith(prepared, expect.objectContaining({ keyColor: '#F0F0F0', tolerance: 18 }), expect.any(AbortSignal))
    expect(screen.getByText('60%')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('色彩抠图边缘柔化'), { target: { value: '12' } })
    expect(screen.queryByAltText('透明色彩抠图结果预览')).toBeNull()
    expect((screen.getByRole('button', { name: '确认并导出 PNG' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '生成透明预览' }))
    await waitFor(() => expect(screen.getByAltText('透明色彩抠图结果预览')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('色彩抠图边缘溢色中和'), { target: { value: '60' } })
    expect(screen.queryByAltText('透明色彩抠图结果预览')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '生成透明预览' }))
    await waitFor(() => expect(screen.getByAltText('透明色彩抠图结果预览')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '确认并导出 PNG' }))
    await waitFor(() => expect(colorKeyMocks.export).toHaveBeenCalledWith(prepared, expect.objectContaining({ feather: 12, despill: 60 }), expect.any(AbortSignal)))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('recovers from an unreadable source and keeps the semantic limitation visible', async () => {
    colorKeyMocks.prepare.mockRejectedValue(new Error('无法读取图片：broken.png'))
    render(<ImageColorKeyPanel onMessage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('选择色彩抠图图片'), { target: { files: [new File(['bad'], 'broken.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('无法读取图片：broken.png'))
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('移除绿幕、纯色商品底或 Logo 背景')).toBeTruthy()
  })
})
