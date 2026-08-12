// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageBatchProcessorPanel } from './ImageBatchProcessorPanel'

const batchMocks = vi.hoisted(() => ({ process: vi.fn() }))

vi.mock('../lib/imageBatchProcessor', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/imageBatchProcessor')>()
  return { ...original, processBatchImage: batchMocks.process }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const first = new File(['first'], 'first.png', { type: 'image/png' })
const second = new File(['second'], 'second.jpg', { type: 'image/jpeg' })

function result(file: File, index: number) {
  return {
    blob: new Blob(['converted'], { type: 'image/jpeg' }),
    filename: `${file.name}-${String(index + 1).padStart(3, '0')}.jpg`,
    sourceFilename: file.name,
    index,
    originalWidth: 2400,
    originalHeight: 1600,
    width: 1600,
    height: 1067,
    inputBytes: file.size,
    outputBytes: 120_000,
    format: 'jpeg',
    quality: 0.76,
  }
}

describe('ImageBatchProcessorPanel', () => {
  it('requires a reviewed first preview before sequential export', async () => {
    batchMocks.process.mockImplementation(async (file: File, index: number) => result(file, index))
    let urlIndex = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:batch-${++urlIndex}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageBatchProcessorPanel onMessage={onMessage} />)

    fireEvent.change(screen.getByLabelText('选择待批量转换图片'), { target: { files: [first, second] } })
    expect(screen.getByText('first.png')).toBeTruthy()
    expect((screen.getByRole('button', { name: '确认并导出 2 张' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('combobox', { name: '批量转换输出格式' }), { target: { value: 'jpeg' } })
    fireEvent.change(screen.getByRole('slider', { name: '批量转换输出质量' }), { target: { value: '76' } })
    fireEvent.change(screen.getByRole('combobox', { name: '批量转换输出尺寸' }), { target: { value: '1080' } })
    fireEvent.click(screen.getByRole('button', { name: '仅编号' }))
    fireEvent.change(screen.getByLabelText('批量文件名前缀'), { target: { value: 'trip-' } })
    fireEvent.click(screen.getByRole('button', { name: '生成首图预览' }))

    await waitFor(() => expect(screen.getByAltText('批量转换后预览')).toBeTruthy())
    expect(batchMocks.process).toHaveBeenCalledWith(first, 0, expect.objectContaining({ format: 'jpeg', quality: 0.76, maxEdge: 1080, renameMode: 'sequence', prefix: 'trip-' }), expect.any(AbortSignal))
    fireEvent.change(screen.getByRole('slider', { name: '批量转换前后分界' }), { target: { value: '70' } })
    expect(screen.getByText('前后分界 70%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认并导出 2 张' }))

    await waitFor(() => expect(click).toHaveBeenCalledTimes(2))
    expect(batchMocks.process).toHaveBeenCalledTimes(3)
    expect(batchMocks.process).toHaveBeenNthCalledWith(2, first, 0, expect.any(Object), expect.any(AbortSignal))
    expect(batchMocks.process).toHaveBeenNthCalledWith(3, second, 1, expect.any(Object), expect.any(AbortSignal))
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('已请求导出 2 张'))
  })

  it('reorders, removes, and invalidates stale previews after a setting change', async () => {
    batchMocks.process.mockImplementation(async (file: File, index: number) => result(file, index))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:batch')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    render(<ImageBatchProcessorPanel onMessage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('选择待批量转换图片'), { target: { files: [first, second] } })
    fireEvent.click(screen.getByRole('button', { name: `上移 ${second.name}` }))
    expect(screen.getAllByRole('listitem')[0].textContent).toContain(second.name)
    fireEvent.click(screen.getByRole('button', { name: '生成首图预览' }))
    await waitFor(() => expect(screen.getByAltText('批量转换后预览')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('批量文件名后缀'), { target: { value: '-new' } })
    expect(screen.queryByAltText('批量转换后预览')).toBeNull()
    expect((screen.getByRole('button', { name: '确认并导出 2 张' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: `移除 ${first.name}` }))
    expect(screen.getByText('1 张')).toBeTruthy()
  })
})
