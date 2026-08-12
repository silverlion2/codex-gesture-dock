// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageCropPanel } from './ImageCropPanel'

const cropMocks = vi.hoisted(() => ({ prepare: vi.fn(), render: vi.fn() }))

vi.mock('../lib/imageCrop', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/imageCrop')>()
  return { ...original, prepareCropSource: cropMocks.prepare, renderCroppedImage: cropMocks.render }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const source = {
  blob: new Blob(['prepared'], { type: 'image/png' }),
  filename: 'sample.png',
  originalWidth: 1200,
  originalHeight: 800,
  width: 1200,
  height: 800,
  rotation: 0,
  scale: 1,
}

const result = {
  blob: new Blob(['cropped'], { type: 'image/png' }),
  filename: 'sample-cropped.png',
  width: 1080,
  height: 720,
  format: 'png',
  quality: null,
}

describe('ImageCropPanel', () => {
  it('prepares, crops, previews, and exports without modifying the source', async () => {
    cropMocks.prepare.mockResolvedValue(source)
    cropMocks.render.mockResolvedValue(result)
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:source').mockReturnValueOnce('blob:result')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageCropPanel onMessage={onMessage} />)

    const file = new File(['source'], 'sample.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('选择待裁剪图片'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByAltText('待裁剪图片')).toBeTruthy())
    expect(cropMocks.prepare).toHaveBeenCalledWith(file, 0, expect.any(AbortSignal))

    const image = screen.getByAltText('待裁剪图片') as HTMLImageElement
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1200 },
      naturalHeight: { configurable: true, value: 800 },
      width: { configurable: true, value: 600 },
      height: { configurable: true, value: 400 },
    })
    fireEvent.load(image)
    fireEvent.click(screen.getByRole('button', { name: '生成裁剪预览' }))

    await waitFor(() => expect(screen.getByAltText('裁剪结果预览')).toBeTruthy())
    expect(cropMocks.render).toHaveBeenCalledWith(source, { x: 60, y: 40, width: 1080, height: 720 }, 'png', 0.9, expect.any(AbortSignal))
    expect(createObjectUrl).toHaveBeenCalledTimes(2)

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: '确认并导出' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('已导出 sample-cropped.png；源图片未被修改')
  })

  it('resets the crop after rotation and exposes format controls', async () => {
    cropMocks.prepare.mockResolvedValue(source)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const file = new File(['source'], 'sample.png', { type: 'image/png' })
    render(<ImageCropPanel onMessage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('选择待裁剪图片'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('button', { name: '向右旋转' })).toBeTruthy())
    fireEvent.change(screen.getByRole('combobox', { name: '裁剪输出格式' }), { target: { value: 'jpeg' } })
    expect((screen.getByRole('slider', { name: '裁剪输出品质' }) as HTMLInputElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '向右旋转' }))
    await waitFor(() => expect(cropMocks.prepare).toHaveBeenLastCalledWith(file, 90, expect.any(AbortSignal)))
  })

  it('shows a recoverable input error', async () => {
    cropMocks.prepare.mockRejectedValue(new Error('图片不能超过 35 MB'))
    render(<ImageCropPanel onMessage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('选择待裁剪图片'), { target: { files: [new File(['x'], 'large.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('图片不能超过 35 MB'))
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('裁剪、构图与旋转图片')).toBeTruthy()
  })
})
