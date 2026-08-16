// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColorAnalysisPanel } from './ColorAnalysisPanel'

const colorMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  sample: vi.fn(),
  css: vi.fn(() => ':root { --image-color-1: #336699; }'),
  json: vi.fn(() => '[{"hex":"#336699"}]'),
}))

const visionMocks = vi.hoisted(() => ({
  render: vi.fn(),
}))

vi.mock('../lib/colorAnalysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/colorAnalysis')>()
  return {
    ...actual,
    prepareColorAnalysis: colorMocks.prepare,
    sampleColor: colorMocks.sample,
    paletteCss: colorMocks.css,
    paletteJson: colorMocks.json,
  }
})

vi.mock('../lib/colorVisionSimulation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/colorVisionSimulation')>()
  return { ...actual, renderColorVisionPng: visionMocks.render }
})

const dominant = {
  r: 51,
  g: 102,
  b: 153,
  hex: '#336699',
  oklch: { l: 0.5, c: 0.1, h: 250 },
  proportion: 0.6,
  textColor: '#ffffff',
  contrastWhite: 6,
  contrastBlack: 3.5,
}

const prepared = {
  filename: 'design.png',
  dataUrl: 'data:image/png;base64,design',
  originalWidth: 800,
  originalHeight: 600,
  width: 8,
  height: 6,
  scale: 1,
  pixels: new Uint8ClampedArray(8 * 6 * 4),
  palette: [dominant, { ...dominant, hex: '#DDEEFF', r: 221, g: 238, b: 255, proportion: 0.4, textColor: '#000000' }],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('ColorAnalysisPanel', () => {
  it('offers a bounded local image workflow', () => {
    render(<ColorAnalysisPanel onMessage={vi.fn()} />)

    expect(screen.getByText('从图片提取代表色并检查文字对比度')).toBeTruthy()
    expect(screen.getByLabelText('选择颜色分析图片').getAttribute('accept')).toContain('image/webp')
    expect(screen.getByText(/最大 35 MB/)).toBeTruthy()
  })

  it('extracts a palette, samples both roles, evaluates contrast, and copies exports', async () => {
    colorMocks.prepare.mockResolvedValue(prepared)
    colorMocks.sample.mockReturnValue({ r: 0, g: 0, b: 0, hex: '#000000' })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const onMessage = vi.fn()
    render(<ColorAnalysisPanel onMessage={onMessage} />)

    fireEvent.change(screen.getByLabelText('选择颜色分析图片'), {
      target: { files: [new File(['image'], 'design.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByText('6.00 : 1')).toBeTruthy())
    expect(colorMocks.prepare).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith(expect.stringContaining('2 个代表色'))
    expect(screen.getByRole('button', { name: '把代表色 #336699 设为背景色' })).toBeTruthy()

    const image = screen.getByRole('button', { name: '从图片取样背景色' })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 100 } as DOMRect)
    fireEvent(image, new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 25 }))
    expect(colorMocks.sample).toHaveBeenCalledWith(prepared.pixels, 8, 6, 0.5, 0.25)
    expect(screen.getByText('21.00 : 1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '取样文字色' }))
    expect(screen.getByRole('button', { name: '从图片取样文字色' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '把代表色 #DDEEFF 设为文字色' }))
    expect((screen.getByLabelText('文字色 HEX') as HTMLInputElement).value).toBe('#DDEEFF')

    fireEvent.click(screen.getByRole('button', { name: '复制 CSS' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(':root { --image-color-1: #336699; }'))
    fireEvent.click(screen.getByRole('button', { name: '复制 JSON' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('[{"hex":"#336699"}]'))
  })

  it('recovers after an unreadable image', async () => {
    colorMocks.prepare.mockRejectedValue(new Error('无法读取图片：broken.png'))
    render(<ColorAnalysisPanel onMessage={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('选择颜色分析图片'), {
      target: { files: [new File(['broken'], 'broken.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('无法读取图片：broken.png'))
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('从图片提取代表色并检查文字对比度')).toBeTruthy()
  })

  it('creates a cancellable local color-vision preview and explicit PNG export', async () => {
    colorMocks.prepare.mockResolvedValue(prepared)
    visionMocks.render.mockResolvedValue(new Blob(['simulated'], { type: 'image/png' }))
    const createObjectUrl = vi.fn(() => `blob:color-vision-${Math.random()}`)
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ColorAnalysisPanel onMessage={onMessage} />)

    fireEvent.click(screen.getByRole('button', { name: '色觉预览' }))
    expect(screen.getByText('预览常见色觉缺失下的图片辨识效果')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('选择颜色分析图片'), {
      target: { files: [new File(['image'], 'design.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByRole('img', { name: '绿色觉缺失（Deutan） 100% 模拟图' })).toBeTruthy())
    expect(visionMocks.render).toHaveBeenCalledWith(prepared.pixels, 8, 6, 'deutan', 1, expect.any(AbortSignal))
    expect(screen.getByText(/Viénot 1999/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('色觉模拟强度'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('radio', { name: '蓝色觉缺失（Tritan）' }))
    await waitFor(() => expect(screen.getByRole('img', { name: '蓝色觉缺失（Tritan） 60% 模拟图' })).toBeTruthy())
    expect(visionMocks.render).toHaveBeenLastCalledWith(prepared.pixels, 8, 6, 'tritan', 0.6, expect.any(AbortSignal))
    expect(screen.getByText(/Brettel 1997/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '确认并导出模拟 PNG' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('已请求下载色觉模拟 PNG；该图只用于人工无障碍复核')
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(revokeObjectUrl).toHaveBeenCalled()
  })
})
