// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageDuplicateFinder } from './ImageDuplicateFinder'

const similarityMocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  find: vi.fn(),
  validate: vi.fn(),
}))

vi.mock('../lib/imageSimilarity', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/imageSimilarity')>()
  return {
    ...original,
    analyzeSimilarImages: similarityMocks.analyze,
    findSimilarImagePairs: similarityMocks.find,
    validateSimilarityFiles: similarityMocks.validate,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const left = {
  id: 'left', filename: 'original.png', size: 2048, width: 800, height: 600,
  hash: '0'.repeat(32), exactDigest: 'same', previewDataUrl: 'data:image/png;base64,left',
}
const right = {
  id: 'right', filename: 'copy.jpg', size: 3072, width: 800, height: 600,
  hash: '0'.repeat(32), exactDigest: 'same', previewDataUrl: 'data:image/jpeg;base64,right',
}
const exactPair = { id: 'left:right', left, right, distance: 0, similarity: 100, exactBytes: true }

describe('ImageDuplicateFinder', () => {
  it('requires a local batch within the visible limits', () => {
    render(<ImageDuplicateFinder onMessage={vi.fn()} />)

    expect(screen.getByText('查找近重复图片')).toBeTruthy()
    expect(screen.getByText(/单张 35 MB、合计 200 MB/)).toBeTruthy()
    expect((screen.getByRole('button', { name: '开始本机查重' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByLabelText('选择待查重图片').hasAttribute('multiple')).toBe(true)
  })

  it('shows exact and perceptual candidates and recomputes the threshold', async () => {
    similarityMocks.analyze.mockResolvedValue({ items: [left, right], issues: [] })
    similarityMocks.find.mockReturnValue([exactPair])
    const onMessage = vi.fn()
    render(<ImageDuplicateFinder onMessage={onMessage} />)

    fireEvent.change(screen.getByLabelText('选择待查重图片'), {
      target: { files: [new File(['a'], 'original.png', { type: 'image/png' }), new File(['b'], 'copy.jpg', { type: 'image/jpeg' })] },
    })
    expect(screen.getByText(/已选择 2 张/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '开始本机查重' }))

    await waitFor(() => expect(screen.getByText('字节完全相同')).toBeTruthy())
    expect(screen.getByAltText('original.png 预览')).toBeTruthy()
    expect(screen.getByText('结构相似度 100.00% · SHA-256 同样一致')).toBeTruthy()
    expect(onMessage).toHaveBeenCalledWith('本机重复图片分析完成：2 张可用，发现 1 对候选')

    fireEvent.change(screen.getByRole('combobox', { name: '重复图片最大哈希距离' }), { target: { value: '16' } })
    expect(similarityMocks.find).toHaveBeenLastCalledWith([left, right], 16)
    fireEvent.click(screen.getByRole('button', { name: '分析另一批' }))
    expect(screen.getByText('查找近重复图片')).toBeTruthy()
  })

  it('keeps partial failures visible without hiding successful analysis', async () => {
    similarityMocks.analyze.mockResolvedValue({ items: [left], issues: [{ filename: 'broken.png', message: '无法解码图片' }] })
    similarityMocks.find.mockReturnValue([])
    render(<ImageDuplicateFinder onMessage={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('选择待查重图片'), {
      target: { files: [new File(['a'], 'original.png', { type: 'image/png' }), new File(['b'], 'broken.png', { type: 'image/png' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始本机查重' }))

    await waitFor(() => expect(screen.getByText('1 张无法分析')).toBeTruthy())
    fireEvent.click(screen.getByText('1 张无法分析'))
    expect(screen.getByText('broken.png')).toBeTruthy()
    expect(screen.getByText('当前阈值下没有近重复候选')).toBeTruthy()
  })
})
