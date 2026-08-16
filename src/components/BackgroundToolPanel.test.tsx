// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyBackgroundEffect, segmentPerson } from '../lib/backgroundRemoval'
import { captureFromImageFile } from '../lib/documentScanner'
import { detectPrivateFaces } from '../lib/facePrivacy'
import { BackgroundToolPanel } from './BackgroundToolPanel'

vi.mock('../lib/documentScanner', () => ({ captureFromImageFile: vi.fn() }))
vi.mock('../lib/facePrivacy', () => ({ detectPrivateFaces: vi.fn() }))
vi.mock('../lib/backgroundRemoval', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/backgroundRemoval')>(),
  applyBackgroundEffect: vi.fn(),
  segmentPerson: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

vi.mocked(detectPrivateFaces).mockResolvedValue([{ id: 'face-1', x: 0.35, y: 0.15, width: 0.3, height: 0.35, confidence: 0.9, enabled: true }])

const capture = { dataUrl: 'data:image/png;base64,cGhvdG8=', filename: 'portrait.jpg' }
const segmentation = { mask: new Float32Array([0, 1, 1, 0]), width: 2, height: 2, personCoverage: 0.5 }

describe('BackgroundToolPanel', () => {
  it('segments a portrait, changes effects, compares the original, and offers PNG export', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(segmentPerson).mockResolvedValue(segmentation)
    vi.mocked(applyBackgroundEffect).mockResolvedValue({ dataUrl: 'data:image/png;base64,b3V0cHV0', width: 800, height: 600, sourceWidth: 800, sourceHeight: 600 })
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

    fireEvent.change(screen.getByRole('combobox', { name: '背景效果' }), { target: { value: 'solid' } })
    await waitFor(() => expect(screen.getByRole('combobox', { name: '证件照输出尺寸' })).toBeTruthy())
    fireEvent.change(screen.getByRole('combobox', { name: '证件照输出尺寸' }), { target: { value: 'one-inch' } })
    await waitFor(() => expect(vi.mocked(applyBackgroundEffect).mock.calls.at(-1)?.[2]).toMatchObject({ effect: 'solid', idPhotoPreset: 'one-inch', verticalPosition: 50 }))
    expect(screen.getByRole('slider', { name: '证件照垂直构图' })).toBeTruthy()
    expect(screen.getByText('单人构图辅助')).toBeTruthy()
    expect(screen.getByText(/这是启发式复核，不是合规检测/)).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: '证件照输出排版' }), { target: { value: 'sheet' } })
    await waitFor(() => expect(vi.mocked(applyBackgroundEffect).mock.calls.at(-1)?.[2]).toMatchObject({ idPhotoPreset: 'one-inch', idPhotoSheet: true }))
    expect(screen.getByText(/关闭“适应页面”/)).toBeTruthy()
    expect(screen.getByText(/尺寸排版仅供辅助/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '对照原图' }))
    expect(screen.getByRole('img', { name: '人物背景原图' })).toBeTruthy()
  })

  it('draws, undoes, cancels, and applies foreground-mask corrections', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(segmentPerson).mockResolvedValue(segmentation)
    vi.mocked(applyBackgroundEffect).mockResolvedValue({ dataUrl: 'data:image/png;base64,b3V0cHV0', width: 800, height: 600, sourceWidth: 800, sourceHeight: 600 })
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

  it('loads, positions, contains, and removes a local custom background image', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(segmentPerson).mockResolvedValue(segmentation)
    vi.mocked(applyBackgroundEffect).mockResolvedValue({ dataUrl: 'data:image/png;base64,b3V0cHV0', width: 800, height: 600, sourceWidth: 800, sourceHeight: 600 })
    const onMessage = vi.fn()
    const { container } = render(<BackgroundToolPanel onMessage={onMessage} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'portrait.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '确认并导出 PNG' })).toBeTruthy())

    vi.mocked(captureFromImageFile).mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,YmFja2dyb3VuZA==',
      filename: 'studio.png',
    })
    fireEvent.change(screen.getByLabelText('自定义背景图片'), {
      target: { files: [new File(['background'], 'studio.webp', { type: 'image/webp' })] },
    })

    await waitFor(() => expect(vi.mocked(applyBackgroundEffect).mock.calls.at(-1)?.[2]).toMatchObject({
      effect: 'image',
      backgroundImageDataUrl: 'data:image/png;base64,YmFja2dyb3VuZA==',
      backgroundImageFit: 'cover',
      backgroundImagePositionX: 50,
      backgroundImagePositionY: 50,
    }))
    expect((screen.getByRole('combobox', { name: '背景效果' }) as HTMLSelectElement).value).toBe('image')
    expect(screen.getByText('studio.png')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('自定义背景已载入本机内存，请调整铺放位置并复核人物边缘')

    fireEvent.change(screen.getByRole('combobox', { name: '自定义背景铺放' }), { target: { value: 'contain' } })
    await waitFor(() => expect(screen.getByLabelText('自定义背景留边颜色')).toBeTruthy())
    fireEvent.change(screen.getByRole('slider', { name: '自定义背景水平位置' }), { target: { value: '25' } })
    await waitFor(() => expect(vi.mocked(applyBackgroundEffect).mock.calls.at(-1)?.[2]).toMatchObject({
      backgroundImagePositionX: 25,
      backgroundImagePositionY: 50,
    }))
    await waitFor(() => expect(screen.getByRole('slider', { name: '自定义背景垂直位置' })).toBeTruthy())
    fireEvent.change(screen.getByRole('slider', { name: '自定义背景垂直位置' }), { target: { value: '75' } })
    await waitFor(() => expect(vi.mocked(applyBackgroundEffect).mock.calls.at(-1)?.[2]).toMatchObject({
      effect: 'image',
      backgroundImageFit: 'contain',
      backgroundImagePositionX: 25,
      backgroundImagePositionY: 75,
    }))
    expect(screen.getByText(/自定义背景只保留在当前工具内存/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '移除' }))
    await waitFor(() => expect(vi.mocked(applyBackgroundEffect).mock.calls.at(-1)?.[2]).toMatchObject({
      effect: 'transparent',
      backgroundImageDataUrl: undefined,
    }))
    expect(screen.queryByText('studio.png')).toBeNull()
    expect(onMessage).toHaveBeenCalledWith('已从内存移除自定义背景图片')
    await waitFor(() => expect(screen.getByRole('button', { name: '确认并导出 PNG' })).toBeTruthy())
  })

  it('generates review-first batch previews, isolates failures, and reprocesses confirmed files for export', async () => {
    vi.mocked(captureFromImageFile).mockImplementation(async (file) => ({
      dataUrl: `data:image/png;base64,${file.name}`,
      filename: file.name.replace(/\.[^.]+$/, '.png'),
    }))
    vi.mocked(segmentPerson).mockResolvedValue(segmentation)
    vi.mocked(applyBackgroundEffect).mockImplementation(async (_dataUrl, _mask, renderOptions) => ({
      dataUrl: `data:image/png;base64,${renderOptions.outputMaxDimension ?? 4096}`,
      width: renderOptions.outputMaxDimension ?? 800,
      height: Math.round((renderOptions.outputMaxDimension ?? 800) * 0.75),
      sourceWidth: 800,
      sourceHeight: 600,
    }))
    const onMessage = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { container } = render(<BackgroundToolPanel onMessage={onMessage} />)
    const files = [
      new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
      new File(['three'], 'three.png', { type: 'image/png' }),
    ]

    fireEvent.change(container.querySelector<HTMLInputElement>('input[multiple]')!, { target: { files } })
    await waitFor(() => expect(screen.getByText('批量人物背景 · 3 张')).toBeTruthy())
    expect(screen.queryByRole('button', { name: '修正人物边缘' })).toBeNull()
    expect(screen.queryByRole('button', { name: '确认并导出 PNG' })).toBeNull()

    vi.mocked(segmentPerson)
      .mockResolvedValueOnce(segmentation)
      .mockResolvedValueOnce({ ...segmentation, personCoverage: 0 })
      .mockResolvedValueOnce(segmentation)
    fireEvent.click(screen.getByRole('button', { name: '生成 3 张批量预览' }))

    await waitFor(() => expect(screen.getByText('批量预览完成：2 张可导出，1 张失败')).toBeTruthy())
    expect(screen.getByRole('img', { name: 'one.jpg 背景预览' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'three.png 背景预览' })).toBeTruthy()
    expect(screen.getByText('没有找到足够清晰的人物')).toBeTruthy()
    expect(vi.mocked(applyBackgroundEffect).mock.calls.filter((call) => call[2].outputMaxDimension === 1_200)).toHaveLength(2)
    expect(vi.mocked(applyBackgroundEffect).mock.calls.find((call) => call[2].outputMaxDimension === 1_200)?.[2]).toMatchObject({ corrections: [], idPhotoSheet: false })

    fireEvent.click(screen.getByRole('button', { name: '确认并导出 2 张' }))
    await waitFor(() => expect(screen.getByText('已请求下载 2 张')).toBeTruthy())
    expect(anchorClick).toHaveBeenCalledTimes(2)
    expect(vi.mocked(applyBackgroundEffect).mock.calls.filter((call) => call[2].outputMaxDimension === 4_096)).toHaveLength(2)
    expect(onMessage).toHaveBeenCalledWith('批量背景预览完成：2/3 张可导出')
    expect(onMessage).toHaveBeenCalledWith('已请求下载 2 张')
  })

  it('cancels a running batch preview and marks the unprocessed files without exporting them', async () => {
    vi.mocked(captureFromImageFile).mockImplementation(async (file) => ({ dataUrl: `data:image/png;base64,${file.name}`, filename: file.name }))
    vi.mocked(segmentPerson).mockResolvedValue(segmentation)
    vi.mocked(applyBackgroundEffect).mockResolvedValue({ dataUrl: 'data:image/png;base64,b3V0cHV0', width: 800, height: 600, sourceWidth: 800, sourceHeight: 600 })
    const { container } = render(<BackgroundToolPanel onMessage={vi.fn()} />)
    const files = [
      new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
    ]
    fireEvent.change(container.querySelector<HTMLInputElement>('input[multiple]')!, { target: { files } })
    await waitFor(() => expect(screen.getByRole('button', { name: '生成 2 张批量预览' })).toBeTruthy())

    let resolveSegmentation: ((value: typeof segmentation) => void) | undefined
    vi.mocked(segmentPerson).mockImplementationOnce(() => new Promise((resolve) => { resolveSegmentation = resolve }))
    fireEvent.click(screen.getByRole('button', { name: '生成 2 张批量预览' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '取消' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    resolveSegmentation?.(segmentation)

    await waitFor(() => expect(screen.getByText('批量预览已取消；保留 0 张成功预览')).toBeTruthy())
    expect(screen.getAllByText('已取消，未生成预览')).toHaveLength(2)
    expect((screen.getByRole('button', { name: '确认并导出 0 张' }) as HTMLButtonElement).disabled).toBe(true)
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
