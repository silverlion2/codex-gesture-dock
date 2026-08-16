// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenshotBeautifierPanel } from './ScreenshotBeautifierPanel'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), preview: vi.fn(), export: vi.fn() }))
vi.mock('../lib/screenshotBeautifier', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/screenshotBeautifier')>()), prepareScreenshotBeautifierSource: mocks.prepare, renderScreenshotBeautifierPreview: mocks.preview, exportBeautifiedScreenshot: mocks.export }))

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })

describe('ScreenshotBeautifierPanel', () => {
  it('invalidates stale previews and explicitly exports the reviewed style', async () => {
    const file = new File(['shot'], 'shot.png', { type: 'image/png' })
    const source = { file, filename: file.name, originalWidth: 1200, originalHeight: 800, previewWidth: 1200, previewHeight: 800, previewBlob: new Blob(['preview'], { type: 'image/png' }) }
    mocks.prepare.mockResolvedValue(source)
    mocks.preview.mockResolvedValue({ blob: new Blob(['beauty'], { type: 'image/png' }), filename: 'shot-beautified.png', width: 1500, height: 1000, format: 'png', quality: null, settings: {} })
    mocks.export.mockResolvedValue({ blob: new Blob(['export'], { type: 'image/jpeg' }), filename: 'shot-beautified.jpg', width: 1800, height: 1200, format: 'jpeg', quality: 0.84, settings: {} })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:beauty'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn(); render(<ScreenshotBeautifierPanel onMessage={onMessage} />)
    fireEvent.change(screen.getByLabelText('选择待美化截图'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('button', { name: '海洋' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '海洋' })); fireEvent.change(screen.getByLabelText('截图美化画布比例'), { target: { value: '16:9' } }); fireEvent.change(screen.getByLabelText('截图美化窗口标题'), { target: { value: 'Local Demo' } }); fireEvent.change(screen.getByLabelText('截图美化留白'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: '生成美化预览' }))
    await waitFor(() => expect(screen.getByAltText('截图美化预览')).toBeTruthy())
    expect(mocks.preview).toHaveBeenCalledWith(source, expect.objectContaining({ background: 'ocean', aspect: '16:9', title: 'Local Demo', paddingPercent: 18 }), expect.any(AbortSignal))
    fireEvent.change(screen.getByLabelText('截图美化圆角'), { target: { value: '6' } })
    expect(screen.queryByAltText('截图美化预览')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '生成美化预览' })); await waitFor(() => expect(screen.getByAltText('截图美化预览')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('截图美化导出格式'), { target: { value: 'jpeg' } }); fireEvent.change(screen.getByLabelText('截图美化导出品质'), { target: { value: '84' } }); fireEvent.click(screen.getByRole('button', { name: '确认并导出' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(mocks.export).toHaveBeenCalledWith(source, expect.objectContaining({ cornerPercent: 6 }), 'jpeg', 0.84, expect.any(AbortSignal))
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('shot-beautified.jpg'))
  })
})
