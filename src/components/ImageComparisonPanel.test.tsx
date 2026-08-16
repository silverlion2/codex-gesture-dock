// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageComparisonPanel } from './ImageComparisonPanel'

const comparisonMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  render: vi.fn(),
  filename: vi.fn(() => 'baseline-vs-candidate-diff.png'),
}))

vi.mock('../lib/imageComparison', () => ({
  prepareImageComparison: comparisonMocks.prepare,
  renderPreparedComparison: comparisonMocks.render,
  comparisonFilename: comparisonMocks.filename,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const prepared = {
  baseline: { filename: 'baseline.png', originalWidth: 800, originalHeight: 600, dataUrl: 'data:image/png;base64,baseline' },
  candidate: { filename: 'candidate.png', originalWidth: 1_024, originalHeight: 768, dataUrl: 'data:image/png;base64,candidate' },
  baselinePixels: new Uint8ClampedArray(4),
  candidatePixels: new Uint8ClampedArray(4),
  width: 1_024,
  height: 768,
  scale: 1,
  dimensionsDiffer: true,
}

const comparison = {
  mismatchPixels: 12_345,
  mismatchPercentage: 1.57,
  matchPercentage: 98.43,
  changedBounds: { x: 40, y: 25, width: 300, height: 120 },
  diffPixels: new Uint8ClampedArray(4),
  diffDataUrl: 'data:image/png;base64,diff',
}

describe('ImageComparisonPanel', () => {
  it('requires two local images before starting', () => {
    render(<ImageComparisonPanel onMessage={vi.fn()} />)

    expect(screen.getByRole('button', { name: '两图像素对比' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '批量重复查找' }))
    expect(screen.getByText('查找近重复图片')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '图片优化' }))
    expect(screen.getByText('缩放、转换与压缩图片')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '裁剪旋转' }))
    expect(screen.getByText('裁剪、构图与旋转图片')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '图片检查' }))
    expect(screen.getByText('检查尺寸、曝光、透明度与边缘响应')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '图片标注' }))
    expect(screen.getByText('给截图或照片添加可复核标注')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '联系表' }))
    expect(screen.getByText('把一组图片排成可复核联系表')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '长图' }))
    expect(screen.getByText('按顺序拼成一张纵向或横向长图')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '调整' }))
    expect(screen.getByText('调整图片的明暗、对比与色彩')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '水印' }))
    expect(screen.getByText('给一批图片添加可见水印')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '批处理' }))
    expect(screen.getByText('批量缩放、转换与重命名图片')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '美化' }))
    expect(screen.getByText('把截图包装成可分享图片')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '线稿抠图' }))
    expect(screen.getByText('提取签名、印章或深浅线稿')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '色彩抠图' }))
    expect(screen.getByText('移除绿幕、纯色商品底或 Logo 背景')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '贴纸描边' }))
    expect(screen.getByText('给透明人物、Logo 或线稿添加贴纸描边')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '两图像素对比' }))
    expect((screen.getByText('查找近重复图片').closest('.image-analysis-duplicate-workspace') as HTMLElement).hidden).toBe(true)
    expect(screen.getByText('对比两张截图或照片')).toBeTruthy()
    expect((screen.getByRole('button', { name: '开始本机对比' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByLabelText('选择基准图').getAttribute('accept')).toContain('image/webp')
    expect(screen.getByLabelText('选择候选图')).toBeTruthy()
  }, 15_000)

  it('shows wipe, metrics, tolerance recompute, and an exportable diff', async () => {
    comparisonMocks.prepare.mockResolvedValue(prepared)
    comparisonMocks.render.mockReturnValue(comparison)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageComparisonPanel onMessage={onMessage} />)

    fireEvent.change(screen.getByLabelText('选择基准图'), {
      target: { files: [new File(['base'], 'baseline.png', { type: 'image/png' })] },
    })
    fireEvent.change(screen.getByLabelText('选择候选图'), {
      target: { files: [new File(['next'], 'candidate.png', { type: 'image/png' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始本机对比' }))

    await waitFor(() => expect(screen.getByText('98.43%')).toBeTruthy())
    expect(comparisonMocks.prepare).toHaveBeenCalledTimes(1)
    expect(comparisonMocks.render).toHaveBeenCalledWith(prepared, 0.1)
    expect(screen.getByAltText('基准图对比预览')).toBeTruthy()
    expect(screen.getByText(/两图尺寸不同/)).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('12,345'))

    fireEvent.change(screen.getByRole('slider', { name: '对照分界' }), { target: { value: '72' } })
    expect(screen.getByText('对照分界 72%')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('slider', { name: '对照分界' }), { key: 'ArrowRight' })
    expect(screen.getByText('对照分界 73%')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('slider', { name: '对照分界' }), { key: 'Home' })
    expect(screen.getByText('对照分界 0%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '差异热图' }))
    expect(screen.getByAltText('像素差异热图').getAttribute('src')).toBe(comparison.diffDataUrl)

    fireEvent.change(screen.getByRole('combobox', { name: '差异容差' }), { target: { value: '0.2' } })
    expect(comparisonMocks.render).toHaveBeenLastCalledWith(prepared, 0.2)
    expect(onMessage).toHaveBeenCalledWith('已按宽松 · 20%容差重新计算差异')

    fireEvent.click(screen.getByRole('button', { name: '导出差异 PNG' }))
    expect(comparisonMocks.filename).toHaveBeenCalledWith('baseline.png', 'candidate.png')
    expect(click).toHaveBeenCalledTimes(1)
  }, 15_000)

  it('lets users recover after an unreadable pair', async () => {
    comparisonMocks.prepare.mockRejectedValue(new Error('无法读取图片：broken.png'))
    render(<ImageComparisonPanel onMessage={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('选择基准图'), {
      target: { files: [new File(['base'], 'baseline.png', { type: 'image/png' })] },
    })
    fireEvent.change(screen.getByLabelText('选择候选图'), {
      target: { files: [new File(['bad'], 'broken.png', { type: 'image/png' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始本机对比' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('无法读取图片：broken.png'))
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('对比两张截图或照片')).toBeTruthy()
  })
})
