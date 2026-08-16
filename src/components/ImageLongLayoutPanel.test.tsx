// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageLongLayoutPanel } from './ImageLongLayoutPanel'

const longImageMocks = vi.hoisted(() => ({ join: vi.fn(), split: vi.fn(), overlaps: vi.fn() }))

vi.mock('../lib/imageLongLayout', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/imageLongLayout')>()
  return { ...original, renderLongImageJoin: longImageMocks.join, renderLongImageSplit: longImageMocks.split, analyzeLongImageOverlaps: longImageMocks.overlaps }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('ImageLongLayoutPanel', () => {
  it('reorders, trims, previews, and exports an ordered long image', async () => {
    const joined = {
      blob: new Blob(['joined'], { type: 'image/png' }),
      filename: 'one-vertical-long-image.png',
      width: 800,
      height: 2200,
      imageCount: 3,
      scale: 1,
    }
    longImageMocks.join.mockResolvedValue(joined)
    let urlIndex = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:long-${++urlIndex}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageLongLayoutPanel onMessage={onMessage} />)

    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
      new File(['three'], 'three.webp', { type: 'image/webp' }),
    ]
    fireEvent.change(screen.getByLabelText('选择长图拼接图片'), { target: { files } })
    fireEvent.click(screen.getByRole('button', { name: '上移 three.webp' }))
    const order = within(screen.getByLabelText('长图拼接图片顺序')).getAllByRole('strong')
    expect(order.map((entry) => entry.textContent)).toEqual(['one.png', 'three.webp', 'two.jpg'])
    fireEvent.change(screen.getByRole('combobox', { name: '裁去 three.webp 开头' }), { target: { value: '15' } })
    fireEvent.change(screen.getByRole('combobox', { name: '长图拼接间距' }), { target: { value: '24' } })
    fireEvent.change(screen.getByRole('combobox', { name: '长图拼接背景' }), { target: { value: 'dark' } })
    fireEvent.click(screen.getByRole('button', { name: '生成长图预览' }))

    await waitFor(() => expect(screen.getByAltText('长图拼接结果预览')).toBeTruthy())
    expect(longImageMocks.join).toHaveBeenCalledWith(
      [files[0], files[2], files[1]],
      [0, 15, 0],
      { direction: 'vertical', gap: 24, background: 'dark' },
      expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) }),
    )
    fireEvent.click(screen.getByRole('button', { name: '确认并导出' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('已导出 one-vertical-long-image.png；源图片未被修改')
  })

  it('splits one image into reviewable parts with individual and batch export', async () => {
    const parts = Array.from({ length: 4 }, (_, index) => ({
      index,
      sx: 0,
      sy: index * 500,
      sw: 800,
      sh: 500,
      width: 800,
      height: 500,
      blob: new Blob([`part-${index}`], { type: 'image/png' }),
      filename: `long-part-${index + 1}-of-4.png`,
    }))
    longImageMocks.split.mockResolvedValue({ parts, sourceWidth: 800, sourceHeight: 2000, scale: 1 })
    let urlIndex = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:split-${++urlIndex}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<ImageLongLayoutPanel onMessage={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '拆分长图' }))
    const file = new File(['long'], 'long.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('选择待拆分长图'), { target: { files: [file] } })
    fireEvent.change(screen.getByRole('combobox', { name: '长图拆分份数' }), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: '生成拆分预览' }))

    await waitFor(() => expect(screen.getAllByRole('button', { name: '导出此份' })).toHaveLength(4))
    expect(longImageMocks.split).toHaveBeenCalledWith(file, 'vertical', 4, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    fireEvent.click(screen.getAllByRole('button', { name: '导出此份' })[1])
    expect(click).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '导出全部' }))
    expect(click).toHaveBeenCalledTimes(5)
  })

  it('applies only high-confidence overlap suggestions and clears them after direction changes', async () => {
    longImageMocks.overlaps.mockResolvedValue({
      acceptedCount: 1,
      suggestions: [
        { index: 1, overlapPercent: 20, score: 0.98, confidence: 0.91, texture: 32, crossShift: 0, status: 'accepted' },
        { index: 2, overlapPercent: 14, score: 0.94, confidence: 0.41, texture: 28, crossShift: 1, status: 'ambiguous' },
      ],
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:overlap')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageLongLayoutPanel onMessage={onMessage} />)
    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
      new File(['three'], 'three.png', { type: 'image/png' }),
    ]
    fireEvent.change(screen.getByLabelText('选择长图拼接图片'), { target: { files } })
    fireEvent.click(screen.getByRole('button', { name: '自动检测重叠' }))

    await waitFor(() => expect(screen.getByText('自动检测：1 个已应用')).toBeTruthy())
    expect(longImageMocks.overlaps).toHaveBeenCalledWith(files, 'vertical', expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) }))
    expect((screen.getByRole('combobox', { name: '裁去 two.png 开头' }) as HTMLSelectElement).value).toBe('20')
    expect((screen.getByRole('combobox', { name: '裁去 three.png 开头' }) as HTMLSelectElement).value).toBe('0')
    expect(screen.getByText('接缝歧义 · 手动')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('已应用 1 个高置信度接缝；1 个低置信度接缝保持原设置')

    fireEvent.change(screen.getByRole('combobox', { name: '长图拼接方向' }), { target: { value: 'horizontal' } })
    expect(screen.queryByText('自动检测：1 个已应用')).toBeNull()
    expect((screen.getByRole('combobox', { name: '裁去 two.png 开头' }) as HTMLSelectElement).value).toBe('0')
  })
})
