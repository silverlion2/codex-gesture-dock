// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  IMAGE_BATCH_MAX_FILES,
  batchImageFilename,
  validateImageBatch,
  type ImageBatchOptions,
} from './imageBatchProcessor'

const options: ImageBatchOptions = {
  format: 'webp',
  quality: 0.82,
  maxEdge: 1600,
  renameMode: 'keep',
  prefix: 'web-',
  suffix: '-small',
  startNumber: 1,
}

describe('imageBatchProcessor', () => {
  it('validates a bounded local image batch and preserves order', () => {
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['bb'], 'b.jpg', { type: 'image/jpeg' }),
    ]
    expect(validateImageBatch(files)).toEqual({ files, totalBytes: 3 })
  })

  it('rejects empty, oversized-count, and unsupported batches', () => {
    expect(() => validateImageBatch([])).toThrow('至少选择 1 张')
    const many = Array.from({ length: IMAGE_BATCH_MAX_FILES + 1 }, (_, index) => new File(['x'], `${index}.png`, { type: 'image/png' }))
    expect(() => validateImageBatch(many)).toThrow('一次最多处理 20 张')
    expect(() => validateImageBatch([new File(['x'], 'vector.svg', { type: 'image/svg+xml' })])).toThrow('不支持的图片格式')
  })

  it('creates Windows-safe names while retaining the source stem', () => {
    expect(batchImageFilename('客户<原图>.PNG', 0, options)).toBe('web-客户-原图--001-small.webp')
    expect(batchImageFilename('CON.png', 0, { ...options, prefix: '', suffix: '' })).toBe('CON-file-001.webp')
  })

  it('creates padded sequence names with a format-specific extension', () => {
    expect(batchImageFilename('ignored.png', 4, { ...options, format: 'jpeg', renameMode: 'sequence', prefix: '旅行-', suffix: '-终稿', startNumber: 8 })).toBe('旅行-012-终稿.jpg')
  })

  it('rejects invalid sequence inputs', () => {
    expect(() => batchImageFilename('a.png', -1, options)).toThrow('图片序号无效')
    expect(() => batchImageFilename('a.png', 0, { ...options, startNumber: 1.5 })).toThrow('起始编号')
  })
})
