// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureVideoFrame } from '../lib/cameraTools'
import { captureFromImageFile } from '../lib/documentScanner'
import {
  detectObjects,
  importObjectDetectionModel,
  loadObjectDetectionLabels,
  prepareObjectDetectionModel,
  releaseObjectDetectionModel,
  renderObjectAnnotations,
  type ObjectDetectionModel,
} from '../lib/objectDetection'
import { ObjectDetectionPanel } from './ObjectDetectionPanel'

vi.mock('../lib/documentScanner', () => ({ captureFromImageFile: vi.fn() }))
vi.mock('../lib/cameraTools', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/cameraTools')>(),
  captureVideoFrame: vi.fn(),
}))
vi.mock('../lib/objectDetection', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/objectDetection')>(),
  detectObjects: vi.fn(),
  importObjectDetectionModel: vi.fn(),
  loadObjectDetectionLabels: vi.fn(),
  prepareObjectDetectionModel: vi.fn(),
  releaseObjectDetectionModel: vi.fn(),
  renderObjectAnnotations: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const capture = { dataUrl: 'data:image/png;base64,cGhvdG8=', filename: 'desk.png' }
const detections = [
  { id: 'object-1', category: 'laptop', label: '笔记本电脑', confidence: 0.92, x: 0.1, y: 0.2, width: 0.5, height: 0.4, enabled: true },
  { id: 'object-2', category: 'mouse', label: '鼠标', confidence: 0.36, x: 0.7, y: 0.6, width: 0.12, height: 0.1, enabled: true },
]
const customModel: ObjectDetectionModel = {
  id: 'custom-test-model',
  kind: 'custom',
  name: 'factory-detector.tflite',
  size: 2_400_000,
  bytes: new Uint8Array([1, 2, 3]),
}

describe('ObjectDetectionPanel', () => {
  it('detects, filters, reviews, and exports selected object annotations', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(detectObjects).mockResolvedValue(detections)
    vi.mocked(renderObjectAnnotations).mockResolvedValue({ dataUrl: 'data:image/png;base64,b2JqZWN0cw==', width: 1_200, height: 800 })
    const onMessage = vi.fn()
    const { container } = render(<ObjectDetectionPanel videoRef={{ current: null }} mirrored={false} sessionReady={false} onMessage={onMessage} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'desk.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '笔记本电脑 1 已选中' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: /鼠标/ })).toBeNull()
    expect(onMessage).toHaveBeenCalledWith('已在本机发现 2 个候选物体，请调整置信度并逐项复核')

    fireEvent.change(screen.getByRole('slider', { name: '最低置信度' }), { target: { value: '0.3' } })
    expect(screen.getByRole('button', { name: '鼠标 2 已选中' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '笔记本电脑 1 已选中' }))
    expect(screen.getByRole('button', { name: '笔记本电脑 1 已跳过' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '确认并导出标注 PNG' }))
    await waitFor(() => expect(renderObjectAnnotations).toHaveBeenCalledWith(capture.dataUrl, [expect.objectContaining({ category: 'mouse' })]))
  })

  it('keeps a no-result photo reviewable without enabling export', async () => {
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(detectObjects).mockResolvedValue([])
    const { container } = render(<ObjectDetectionPanel videoRef={{ current: null }} mirrored={false} sessionReady={false} onMessage={vi.fn()} />)
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['photo'], 'empty.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByText('当前阈值下无结果')).toBeTruthy())
    expect((screen.getByRole('button', { name: '确认并导出标注 PNG' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('runs one explicit detection pass on the current camera frame', async () => {
    vi.mocked(captureVideoFrame).mockReturnValue(capture)
    vi.mocked(detectObjects).mockResolvedValue([detections[0]])
    const video = document.createElement('video')
    render(<ObjectDetectionPanel videoRef={{ current: video }} mirrored sessionReady onMessage={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '识别当前画面' }))
    await waitFor(() => expect(captureVideoFrame).toHaveBeenCalledWith(video, true))
    expect(await screen.findByRole('button', { name: '笔记本电脑 1 已选中' })).toBeTruthy()
  })

  it('validates a local custom model, adds indexed labels, uses it, and restores the bundled model', async () => {
    vi.mocked(importObjectDetectionModel).mockResolvedValue(customModel)
    vi.mocked(prepareObjectDetectionModel).mockResolvedValue()
    vi.mocked(loadObjectDetectionLabels).mockResolvedValue(['machine', 'warning-light'])
    vi.mocked(captureFromImageFile).mockResolvedValue(capture)
    vi.mocked(detectObjects).mockResolvedValue([detections[0]])
    const { container } = render(<ObjectDetectionPanel videoRef={{ current: null }} mirrored={false} sessionReady={false} onMessage={vi.fn()} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[accept^=".tflite"]')!, {
      target: { files: [new File(['model'], 'factory-detector.tflite')] },
    })
    await waitFor(() => expect(screen.getByText('当前模型：factory-detector.tflite')).toBeTruthy())
    expect(prepareObjectDetectionModel).toHaveBeenCalledWith(customModel)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[accept^=".txt"]')!, {
      target: { files: [new File(['machine'], 'factory-labels.txt')] },
    })
    await waitFor(() => expect(screen.getByText(/2 个外部标签/)).toBeTruthy())

    fireEvent.change(container.querySelector<HTMLInputElement>('input[accept^="image/png"]')!, {
      target: { files: [new File(['photo'], 'factory.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(detectObjects).toHaveBeenCalledWith(capture.dataUrl, expect.objectContaining({
      id: customModel.id,
      labels: ['machine', 'warning-light'],
    })))

    fireEvent.click(await screen.findByRole('button', { name: '换一张' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复内置模型' }))
    expect(screen.getByText(/当前模型：内置 EfficientDet-Lite0/)).toBeTruthy()
    expect(releaseObjectDetectionModel).toHaveBeenCalledWith(expect.objectContaining({ id: customModel.id }))
  })

  it('keeps the bundled model active when custom model compatibility validation fails', async () => {
    vi.mocked(importObjectDetectionModel).mockResolvedValue(customModel)
    vi.mocked(prepareObjectDetectionModel).mockRejectedValue(new Error('模型不兼容'))
    const { container } = render(<ObjectDetectionPanel videoRef={{ current: null }} mirrored={false} sessionReady={false} onMessage={vi.fn()} />)

    fireEvent.change(container.querySelector<HTMLInputElement>('input[accept^=".tflite"]')!, {
      target: { files: [new File(['bad'], 'bad.tflite')] },
    })
    expect((await screen.findByRole('alert')).textContent).toContain('模型不兼容')
    expect(screen.getByText(/当前模型：内置 EfficientDet-Lite0/)).toBeTruthy()
  })
})
