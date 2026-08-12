// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  annotatedImageFilename,
  annotationIsLargeEnough,
  defaultImageAnnotation,
  normalizedAnnotationBox,
  nudgeImageAnnotation,
  orderedImageAnnotations,
  type ImageAnnotation,
} from './imageAnnotation'

const red = '#D43F3A' as const

describe('imageAnnotation', () => {
  it('normalizes reversed drag boxes and clamps pointer coordinates', () => {
    expect(normalizedAnnotationBox({ x: 1.2, y: 0.8 }, { x: -0.1, y: 0.2 })).toEqual({
      x: 0,
      y: 0.2,
      width: 1,
      height: 0.6000000000000001,
    })
  })

  it('uses an eight-pixel minimum for drawn regions and arrows', () => {
    const smallBox: ImageAnnotation = { id: 'box', type: 'rectangle', color: red, stroke: 'thin', x: 0, y: 0, width: 0.005, height: 0.02 }
    const arrow: ImageAnnotation = { id: 'arrow', type: 'arrow', color: red, stroke: 'thin', x1: 0, y1: 0, x2: 0.01, y2: 0 }
    expect(annotationIsLargeEnough(smallBox, 1000, 1000)).toBe(false)
    expect(annotationIsLargeEnough(arrow, 1000, 1000)).toBe(true)
  })

  it('creates bounded keyboard defaults for every tool', () => {
    expect(defaultImageAnnotation('rectangle', 'rectangle', red, 'medium', 1, '')).toMatchObject({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    expect(defaultImageAnnotation('marker', 'marker', red, 'medium', 0, '')).toMatchObject({ number: 1, x: 0.5, y: 0.5 })
    expect(defaultImageAnnotation('text', 'text', red, 'medium', 1, '  重点  ')).toMatchObject({ text: '重点' })
    expect(defaultImageAnnotation('text', 'text', red, 'medium', 1, '')).toMatchObject({ text: '说明' })
  })

  it('nudges complete shapes without moving them outside the image', () => {
    const box: ImageAnnotation = { id: 'box', type: 'blur', color: red, stroke: 'thick', x: 0.7, y: 0.6, width: 0.25, height: 0.3 }
    const arrow: ImageAnnotation = { id: 'arrow', type: 'arrow', color: red, stroke: 'thin', x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.9 }
    expect(nudgeImageAnnotation(box, 1, 1)).toMatchObject({ x: 0.75, y: 0.7 })
    const nudgedArrow = nudgeImageAnnotation(arrow, -0.5, 0.5)
    expect(nudgedArrow).toMatchObject({ x1: 0, y1: 0.3, y2: 1 })
    expect(nudgedArrow.type === 'arrow' ? nudgedArrow.x2 : 0).toBeCloseTo(0.7)
  })

  it('renders blur regions before visible marks while preserving relative order', () => {
    const items: ImageAnnotation[] = [
      { id: 'a', type: 'text', color: red, stroke: 'thin', x: 0.2, y: 0.2, text: 'A' },
      { id: 'b', type: 'blur', color: red, stroke: 'thin', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { id: 'c', type: 'rectangle', color: red, stroke: 'thin', x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
      { id: 'd', type: 'blur', color: red, stroke: 'thin', x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
    ]
    expect(orderedImageAnnotations(items).map(({ id }) => id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('creates Windows-safe annotated PNG filenames', () => {
    expect(annotatedImageFilename('客户<截图>.JPEG')).toBe('客户-截图--annotated.png')
    expect(annotatedImageFilename('CON.png')).toBe('CON-file-annotated.png')
    expect(annotatedImageFilename('..')).toBe('image-annotated.png')
  })
})
