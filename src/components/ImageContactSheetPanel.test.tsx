// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageContactSheetPanel } from './ImageContactSheetPanel'

const contactSheetMocks = vi.hoisted(() => ({ render: vi.fn() }))

vi.mock('../lib/imageContactSheet', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/imageContactSheet')>()
  return { ...original, renderContactSheet: contactSheetMocks.render }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const result = {
  blob: new Blob(['contact-sheet'], { type: 'image/png' }),
  filename: 'one-contact-sheet-3.png',
  width: 1200,
  height: 1230,
  imageCount: 3,
  scale: 1,
}

describe('ImageContactSheetPanel', () => {
  it('orders local images, updates layout, previews, and exports a flattened PNG', async () => {
    contactSheetMocks.render.mockResolvedValue(result)
    let objectUrlIndex = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:sheet-${++objectUrlIndex}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageContactSheetPanel onMessage={onMessage} />)

    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
      new File(['three'], 'three.webp', { type: 'image/webp' }),
    ]
    fireEvent.change(screen.getByLabelText('选择联系表图片'), { target: { files } })

    expect(screen.getByLabelText('联系表顺序预览，共 3 张')).toBeTruthy()
    expect(screen.getByAltText('one.png 联系表预览').getAttribute('src')).toBe('blob:sheet-1')
    fireEvent.click(screen.getByRole('button', { name: '上移 three.webp' }))
    const order = within(screen.getByLabelText('联系表图片顺序')).getAllByRole('strong')
    expect(order.map((entry) => entry.textContent)).toEqual(['one.png', 'three.webp', 'two.jpg'])

    fireEvent.change(screen.getByRole('combobox', { name: '联系表列数' }), { target: { value: '2' } })
    fireEvent.change(screen.getByRole('combobox', { name: '联系表输出宽度' }), { target: { value: '1200' } })
    fireEvent.change(screen.getByRole('combobox', { name: '联系表图片适配' }), { target: { value: 'cover' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '在每格下方显示序号与文件名' }))
    fireEvent.click(screen.getByRole('button', { name: '生成联系表预览' }))

    await waitFor(() => expect(screen.getByAltText('联系表结果预览')).toBeTruthy())
    expect(contactSheetMocks.render).toHaveBeenCalledWith(
      [files[0], files[2], files[1]],
      expect.objectContaining({ columns: 2, width: 1200, fit: 'cover', showLabels: false }),
      expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) }),
    )
    expect(screen.getByText('3 张 · PNG · 1 KB')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '确认并导出' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('已导出 one-contact-sheet-3.png；3 张图片已扁平写入新 PNG')
  })

  it('keeps two images as the minimum and recovers from invalid selection', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageContactSheetPanel onMessage={onMessage} />)

    fireEvent.change(screen.getByLabelText('选择联系表图片'), {
      target: { files: [new File(['one'], 'one.png', { type: 'image/png' })] },
    })
    expect(screen.getByRole('alert').textContent).toContain('至少选择 2 张')
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('把一组图片排成可复核联系表')).toBeTruthy()

    const files = [new File(['one'], 'one.png', { type: 'image/png' }), new File(['two'], 'two.png', { type: 'image/png' })]
    fireEvent.change(screen.getByLabelText('选择联系表图片'), { target: { files } })
    expect((screen.getByRole('button', { name: '移除 one.png' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '移除 two.png' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
