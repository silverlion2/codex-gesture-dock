// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyBackgroundEffect, segmentPerson } from '../lib/backgroundRemoval'
import { captureFromImageFile } from '../lib/documentScanner'
import { BackgroundToolPanel } from './BackgroundToolPanel'

vi.mock('../lib/documentScanner', () => ({ captureFromImageFile: vi.fn() }))
vi.mock('../lib/backgroundRemoval', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/backgroundRemoval')>(),
  applyBackgroundEffect: vi.fn(),
  segmentPerson: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const capture = { dataUrl: 'data:image/png;base64,cGhvdG8=', filename: 'portrait.jpg' }
const segmentation = { mask: new Float32Array([0, 1, 1, 0]), width: 2, height: 2, personCoverage: 0.5 }

describe('BackgroundToolPanel', () => {
  it('segments a portrait, changes effects, compares the original, and offers PNG export', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(segmentPerson).mockResolvedValue(segmentation)
    vi.mocked(applyBackgroundEffect).mockResolvedValue({ dataUrl: 'data:image/png;base64,b3V0cHV0', width: 800, height: 600 })
    const onMessage = vi.fn()
    const { container } = render(<BackgroundToolPanel onMessage={onMessage} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'portrait.jpg', { type: 'image/jpeg' })] },
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '确认并导出 PNG' })).toBeTruthy())
    expect(onMessage).toHaveBeenCalledWith('人物已在本机分割，请对照原图检查边缘后导出')
    expect(screen.getByText('人物占画面约 50%。自动分割可能遗漏头发丝、透明饰物或快速运动边缘，可手动画笔修正。')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: '背景效果' }), { target: { value: 'blur' } })
    await waitFor(() => expect(vi.mocked(applyBackgroundEffect).mock.calls.at(-1)?.[2].effect).toBe('blur'))
    expect(screen.getByRole('slider', { name: '模糊强度' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '对照原图' }))
    expect(screen.getByRole('img', { name: '人物背景原图' })).toBeTruthy()
  })

  it('draws, undoes, cancels, and applies foreground-mask corrections', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(segmentPerson).mockResolvedValue(segmentation)
    vi.mocked(applyBackgroundEffect).mockResolvedValue({ dataUrl: 'data:image/png;base64,b3V0cHV0', width: 800, height: 600 })
    const onMessage = vi.fn()
    const { container } = render(<BackgroundToolPanel onMessage={onMessage} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'portrait.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '修正人物边缘' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '修正人物边缘' }))

    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
    const preview = screen.getByRole('img', { name: '人物蒙版修正原图' }).parentElement as HTMLDivElement
    let capturedPointer: number | null = null
    preview.getBoundingClientRect = () => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    })
    preview.setPointerCapture = vi.fn((pointerId) => { capturedPointer = pointerId })
    preview.hasPointerCapture = vi.fn((pointerId) => capturedPointer === pointerId)
    preview.releasePointerCapture = vi.fn(() => { capturedPointer = null })

    fireEvent.pointerDown(preview, { pointerId: 7, isPrimary: true, button: 0, clientX: 60, clientY: 45 })
    fireEvent.pointerMove(preview, { pointerId: 7, isPrimary: true, buttons: 1, clientX: 110, clientY: 70 })
    fireEvent.pointerUp(preview, { pointerId: 7, isPrimary: true, button: 0, clientX: 160, clientY: 95 })
    expect(screen.getByText('在原图上涂抹；绿色保留人物，红色移除背景。当前 1 笔。')).toBeTruthy()
    expect(preview.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 800 600')
    expect(preview.querySelector('polyline')?.getAttribute('points')).toBe('200,150 400,300 600,450')
    expect(preview.querySelector('polyline')?.getAttribute('stroke-width')).toBe('60')

    fireEvent.click(screen.getByRole('button', { name: '移除背景' }))
    fireEvent.pointerDown(preview, { pointerId: 8, isPrimary: true, button: 0, clientX: 30, clientY: 30 })
    fireEvent.pointerUp(preview, { pointerId: 8, isPrimary: true, button: 0, clientX: 40, clientY: 40 })
    expect(screen.getByText('在原图上涂抹；绿色保留人物，红色移除背景。当前 2 笔。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '撤销一笔' }))
    expect(screen.getByText('在原图上涂抹；绿色保留人物，红色移除背景。当前 1 笔。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '应用修正' }))

    await waitFor(() => {
      const correction = vi.mocked(applyBackgroundEffect).mock.calls.at(-1)?.[2].corrections?.[0]
      expect(correction).toMatchObject({ mode: 'keep', radius: 0.05 })
      expect(correction?.points).toEqual([
        { x: 0.25, y: 0.25 },
        { x: 0.5, y: 0.5 },
        { x: 0.75, y: 0.75 },
      ])
    })
    expect(onMessage).toHaveBeenCalledWith('已应用 1 笔人物边缘修正，请复核后导出')

    fireEvent.click(screen.getByRole('button', { name: '修正人物边缘' }))
    fireEvent.click(screen.getByRole('button', { name: '清除修正' }))
    expect(screen.getByText('在原图上涂抹；绿色保留人物，红色移除背景。当前 0 笔。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.change(screen.getByRole('slider', { name: '人物边界' }), { target: { value: '0.55' } })
    await waitFor(() => expect(vi.mocked(applyBackgroundEffect).mock.calls.at(-1)?.[2].corrections).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('button', { name: '修正人物边缘' })).toBeTruthy())
  })

  it('rejects a result that contains no meaningful person area', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(segmentPerson).mockResolvedValue({ ...segmentation, personCoverage: 0 })
    const { container } = render(<BackgroundToolPanel onMessage={vi.fn()} />)
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'empty.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('没有找到足够清晰的人物'))
    expect(vi.mocked(applyBackgroundEffect)).not.toHaveBeenCalled()
  })
})
