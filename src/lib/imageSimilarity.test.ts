// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  computeDifferenceHash,
  findSimilarImagePairs,
  hammingDistance,
  IMAGE_SIMILARITY_HASH_BITS,
  validateSimilarityFiles,
  type SimilarImageFingerprint,
} from './imageSimilarity'

function fingerprint(id: string, hash: string, exactDigest = id): SimilarImageFingerprint {
  return {
    id,
    filename: `${id}.png`,
    size: 100,
    width: 100,
    height: 80,
    hash,
    exactDigest,
    previewDataUrl: `data:image/png;base64,${id}`,
  }
}

describe('imageSimilarity', () => {
  it('builds a deterministic 128-bit horizontal and vertical difference hash', () => {
    const horizontalGradient = Array.from({ length: 81 }, (_, index) => index % 9)
    const twoWayGradient = Array.from({ length: 81 }, (_, index) => index % 9 + Math.floor(index / 9))

    expect(computeDifferenceHash(horizontalGradient)).toBe(`${'f'.repeat(16)}${'0'.repeat(16)}`)
    expect(computeDifferenceHash(twoWayGradient)).toBe('f'.repeat(32))
    expect(computeDifferenceHash(new Array(81).fill(12))).toBe('0'.repeat(32))
    expect(() => computeDifferenceHash([1, 2, 3])).toThrow('9 × 9')
  })

  it('measures all 128 hash bits and rejects malformed hashes', () => {
    expect(hammingDistance('0'.repeat(32), '0'.repeat(32))).toBe(0)
    expect(hammingDistance('0'.repeat(32), 'f'.repeat(32))).toBe(IMAGE_SIMILARITY_HASH_BITS)
    expect(hammingDistance('0'.repeat(31) + '1', '0'.repeat(32))).toBe(1)
    expect(() => hammingDistance('xyz', '0'.repeat(32))).toThrow('128 位')
  })

  it('keeps exact-byte matches and sorts perceptual candidates by distance', () => {
    const base = fingerprint('base', '0'.repeat(32), 'same')
    const exact = fingerprint('exact', '0'.repeat(32), 'same')
    const close = fingerprint('close', '0'.repeat(31) + '3')
    const far = fingerprint('far', 'f'.repeat(32))
    const pairs = findSimilarImagePairs([base, close, far, exact], 2)

    expect(pairs.map((pair) => [pair.left.id, pair.right.id, pair.distance, pair.exactBytes])).toEqual([
      ['base', 'exact', 0, true],
      ['base', 'close', 2, false],
      ['close', 'exact', 2, false],
    ])
    expect(pairs[1].similarity).toBeCloseTo(98.4375)
  })

  it('enforces batch count, type, per-file, and total byte limits', () => {
    const image = (name: string, size = 10, type = 'image/png') => new File([new Uint8Array(size)], name, { type })
    expect(() => validateSimilarityFiles([image('one.png')])).toThrow('至少选择 2')
    expect(() => validateSimilarityFiles([image('one.png'), image('bad.svg', 10, 'image/svg+xml')])).toThrow('不是受支持')
    expect(() => validateSimilarityFiles([image('one.png'), image('large.png', 35 * 1024 * 1024 + 1)])).toThrow('超过 35 MB')
    expect(() => validateSimilarityFiles(Array.from({ length: 21 }, (_, index) => image(`${index}.png`)))).toThrow('最多选择 20')
    expect(() => validateSimilarityFiles(Array.from({ length: 7 }, (_, index) => image(`${index}.png`, 30 * 1024 * 1024)))).toThrow('合计不能超过 200 MB')
    expect(() => validateSimilarityFiles([image('one.png'), image('two.webp', 10, 'image/webp')])).not.toThrow()
  })
})
