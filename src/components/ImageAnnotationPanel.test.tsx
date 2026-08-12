// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageAnnotationPanel } from './ImageAnnotationPanel'

const annotationMocks = vi.hoisted(() => ({ prepare: vi.fn(), render: vi.fn() }))

vi.mock('../lib/imageAnnotation', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/imageAnnotation')>()
  return { ...original, prepareAnnotationSource: annotationMocks.prepare, renderAnnotatedImage: annotationMocks.render }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const source = {
  blob: new Blob(['prepared'], { type: 'image/png' }),
  filename: 'sample.png',
  originalWidth: 1200,
  originalHeight: 800,
  width: 1200,
  height: 800,
  rotation: 0,
  scale: 1,
}

const result = {
  blob: new Blob(['annotated'], { type: 'image/png' }),
  filename: 'sample-annotated.png',
  width: 1200,
  height: 800,
  annotationCount: 2,
}

describe('ImageAnnotationPanel', () => {
  it('adds accessible marks, supports history and movement, then previews and exports', async () => {
    annotationMocks.prepare.mockResolvedValue(source)
    annotationMocks.render.mockResolvedValue(result)
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:source').mockReturnValueOnce('blob:result')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onMessage = vi.fn()
    render(<ImageAnnotationPanel onMessage={onMessage} />)

    const file = new File(['source'], 'sample.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('选择待标注图片'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByAltText('待标注图片')).toBeTruthy())
    expect(annotationMocks.prepare).toHaveBeenCalledWith(file, expect.any(AbortSignal))

    fireEvent.click(screen.getByRole('button', { name: '编号' }))
    fireEvent.click(screen.getByRole('button', { name: '在中心添加' }))
    expect(screen.getAllByText('编号 1')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: '文字' }))
    fireEvent.change(screen.getByLabelText('标注文字'), { target: { value: '重点' } })
    fireEvent.click(screen.getByRole('button', { name: '在中心添加' }))
    expect(screen.getAllByText('文字：重点')).toHaveLength(2)
    expect(screen.getByLabelText('标注列表，共 2 项')).toBeTruthy()

    const textMark = screen.getAllByRole('button', { name: /文字：重点/ }).find((button) => !button.hasAttribute('aria-label'))!
    fireEvent.keyDown(textMark, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    fireEvent.click(screen.getByRole('button', { name: '生成扁平预览' }))

    await waitFor(() => expect(screen.getByAltText('扁平标注结果预览')).toBeTruthy())
    expect(annotationMocks.render).toHaveBeenCalledWith(source, expect.arrayContaining([
      expect.objectContaining({ type: 'marker', number: 1 }),
      expect.objectContaining({ type: 'text', text: '重点' }),
    ]), expect.any(AbortSignal))

    fireEvent.click(screen.getByRole('button', { name: '确认并导出' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('已导出 sample-annotated.png；所有标注已扁平写入新 PNG')
  })

  it('shows a recoverable preparation error', async () => {
    annotationMocks.prepare.mockRejectedValue(new Error('图片不能超过 35 MB'))
    render(<ImageAnnotationPanel onMessage={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('选择待标注图片'), {
      target: { files: [new File(['x'], 'large.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('图片不能超过 35 MB'))
    fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
    expect(screen.getByText('给截图或照片添加可复核标注')).toBeTruthy()
  })
})
