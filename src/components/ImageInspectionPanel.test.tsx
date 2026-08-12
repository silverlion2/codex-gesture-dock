// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageInspectionPanel } from './ImageInspectionPanel'

const inspectionMocks = vi.hoisted(() => ({ prepare: vi.fn() }))

vi.mock('../lib/imageInspection', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/imageInspection')>()
  return { ...original, prepareImageInspection: inspectionMocks.prepare }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const histogram = {
  bins: 64,
  luminance: Array.from({ length: 64 }, (_, index) => index + 1),
  red: Array.from({ length: 64 }, (_, index) => 64 - index),
  green: Array.from({ length: 64 }, () => 2),
  blue: Array.from({ length: 64 }, () => 3),
}

const prepared = {
  previewBlob: new Blob(['preview'], { type: 'image/png' }),
  report: {
    filename: 'sample.png',
    mimeType: 'image/png',
    fileSize: 2_000_000,
    originalWidth: 2400,
    originalHeight: 1600,
    analysisWidth: 2400,
    analysisHeight: 1600,
    scale: 1,
    orientation: 'landscape' as const,
    aspectRatio: '3:2',
    visiblePixels: 3_840_000,
    meanLuminance: 123.4,
    contrast: 42.1,
    sharpness: 9.8,
    shadowClipRatio: 0.024,
    highlightClipRatio: 0.004,
    transparentRatio: 0.1,
    partialTransparencyRatio: 0.02,
    histogram,
    signals: [{ code: 'shadow-clipping' as const, label: '暗部可能截断', guidance: '请检查阴影细节。' }],
  },
}

describe('ImageInspectionPanel', () => {
  it('analyzes a local image, switches histograms, and exports JSON', async () => {
    inspectionMocks.prepare.mockResolvedValue(prepared)
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:preview').mockReturnValueOnce('blob:json')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageInspectionPanel onMessage={onMessage} />)

    const file = new File(['image'], 'sample.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('选择待检查图片'), { target: { files: [file] } })

    await waitFor(() => expect(screen.getByAltText('图片检查预览')).toBeTruthy())
    expect(inspectionMocks.prepare).toHaveBeenCalledWith(file, expect.any(AbortSignal))
    expect(screen.getAllByText('2400 × 1600')).toHaveLength(2)
    expect(screen.getByText('暗部可能截断')).toBeTruthy()
    expect(screen.getByRole('img', { name: '亮度直方图' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '红' }))
    expect(screen.getByRole('img', { name: '红直方图' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '导出检查 JSON' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(createObjectUrl).toHaveBeenCalledTimes(2)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:json')
    expect(onMessage).toHaveBeenCalledWith('已导出 sample-inspection.json')
  })

  it('shows a recoverable analysis error', async () => {
    inspectionMocks.prepare.mockRejectedValue(new Error('图片不能超过 35 MB'))
    render(<ImageInspectionPanel onMessage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('选择待检查图片'), {
      target: { files: [new File(['x'], 'large.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('图片不能超过 35 MB'))
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('检查尺寸、曝光、透明度与边缘响应')).toBeTruthy()
  })
})
