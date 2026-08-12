// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageOptimizer } from './ImageOptimizer'

const optimizerMocks = vi.hoisted(() => ({ optimize: vi.fn() }))

vi.mock('../lib/imageOptimizer', () => ({ optimizeImage: optimizerMocks.optimize }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const optimized = {
  blob: new Blob(['optimized'], { type: 'image/webp' }),
  filename: 'sample-optimized.webp',
  originalWidth: 2400,
  originalHeight: 1800,
  width: 1600,
  height: 1200,
  inputBytes: 2_000_000,
  outputBytes: 500_000,
  format: 'webp',
  quality: 0.82,
}

describe('ImageOptimizer', () => {
  it('requires a file and sends explicit settings to the local optimizer', async () => {
    optimizerMocks.optimize.mockResolvedValue(optimized)
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:optimized')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageOptimizer onMessage={onMessage} />)

    expect((screen.getByRole('button', { name: '开始本机优化' }) as HTMLButtonElement).disabled).toBe(true)
    const file = new File(['source'], 'sample.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('选择待优化图片'), { target: { files: [file] } })
    fireEvent.change(screen.getByRole('combobox', { name: '优化输出尺寸' }), { target: { value: '1200' } })
    fireEvent.change(screen.getByRole('slider', { name: '优化输出品质' }), { target: { value: '76' } })
    fireEvent.click(screen.getByRole('button', { name: '开始本机优化' }))

    await waitFor(() => expect(screen.getByAltText('优化后图片预览')).toBeTruthy())
    expect(optimizerMocks.optimize).toHaveBeenCalledWith(file, { format: 'webp', quality: 0.76, maxEdge: 1200 }, expect.any(AbortSignal))
    expect(screen.getByText('减少 75.0%')).toBeTruthy()
    expect(screen.getByText('1600 × 1200')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('图片已在本机优化'))

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: '确认并导出' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('已导出 sample-optimized.webp；源图片未被修改')

    fireEvent.click(screen.getByRole('button', { name: '选择其他图片' }))
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:optimized')
    expect(createObjectUrl).toHaveBeenCalledWith(optimized.blob)
  })

  it('disables quality for PNG and exposes recoverable errors', async () => {
    optimizerMocks.optimize.mockRejectedValue(new Error('当前设备不支持 WEBP 编码，请选择其他格式'))
    render(<ImageOptimizer onMessage={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox', { name: '优化输出格式' }), { target: { value: 'png' } })
    expect((screen.getByRole('slider', { name: '优化输出品质' }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('选择待优化图片'), { target: { files: [new File(['x'], 'sample.png', { type: 'image/png' })] } })
    fireEvent.change(screen.getByRole('combobox', { name: '优化输出格式' }), { target: { value: 'webp' } })
    fireEvent.click(screen.getByRole('button', { name: '开始本机优化' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('当前设备不支持 WEBP 编码'))
    fireEvent.click(screen.getByRole('button', { name: '调整设置' }))
    expect(screen.getByText('缩放、转换与压缩图片')).toBeTruthy()
  })
})
