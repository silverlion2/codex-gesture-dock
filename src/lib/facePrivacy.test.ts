// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { expandFacePrivacyBox, facePrivateFilename, normalizeFacePrivacyBox } from './facePrivacy'

const face = {
  id: 'face-1',
  x: 0.2,
  y: 0.3,
  width: 0.25,
  height: 0.3,
  confidence: 0.91,
  enabled: true,
}

describe('face privacy geometry', () => {
  it('expands a detected face while staying inside the image', () => {
    const expanded = expandFacePrivacyBox(face, 0.2)
    expect(expanded.x).toBeCloseTo(0.15)
    expect(expanded.y).toBeCloseTo(0.24)
    expect(expanded.width).toBeCloseTo(0.35)
    expect(expanded.height).toBeCloseTo(0.42)
    const edge = expandFacePrivacyBox({ ...face, x: 0, y: 0 }, 0.3)
    expect(edge.x).toBe(0)
    expect(edge.y).toBe(0)
    expect(edge.width).toBeCloseTo(0.4)
    expect(edge.height).toBeCloseTo(0.48)
  })

  it('rejects tiny boxes and creates safe export filenames', () => {
    expect(normalizeFacePrivacyBox({ ...face, width: 0.001 })).toBeNull()
    expect(facePrivateFilename('team:photo?.jpeg')).toBe('team-photo--face-private.png')
  })
})
