// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  createOcrLayoutDocument,
  ocrLayoutFilename,
  serializeOcrLayoutCsv,
  serializeOcrLayoutJson,
} from './ocrLayoutExport'
import type { OcrRegion } from './localOcr'

const regions: OcrRegion[] = [
  { text: 'Hello', confidence: 98.456, lineId: 'line-1', x0: -5, y0: 10, x1: 50, y1: 30 },
  { text: '=SUM(1,1)', confidence: 120, lineId: '@line-2', x0: 60, y0: 35, x1: 140, y1: 75 },
  { text: 'ignored', confidence: Number.NaN, lineId: 'line-3', x0: 0, y0: 0, x1: 1, y1: 1 },
  { text: 'outside', confidence: 80, lineId: 'line-4', x0: 110, y0: 10, x1: 120, y1: 20 },
]

describe('ocrLayoutExport', () => {
  it('groups valid words, clamps boxes, and provides normalized coordinates', () => {
    const document = createOcrLayoutDocument(regions, { filename: 'scan.png', width: 100, height: 80, language: 'eng' })

    expect(document).toMatchObject({
      schemaVersion: 1,
      type: 'ocr-word-layout',
      coordinateSpace: 'pixels-top-left',
      source: { filename: 'scan.png', width: 100, height: 80, language: 'eng' },
      wordCount: 2,
    })
    expect(document.lines.map((line) => line.id)).toEqual(['line-1', '@line-2'])
    expect(document.lines[0].words[0]).toEqual({
      index: 0,
      text: 'Hello',
      confidence: 98.46,
      bbox: { x: 0, y: 10, width: 50, height: 20 },
      normalized: { x: 0, y: 0.125, width: 0.5, height: 0.25 },
    })
    expect(document.lines[1].words[0].confidence).toBe(100)
    expect(document.lines[1].words[0].bbox).toEqual({ x: 60, y: 35, width: 40, height: 40 })
  })

  it('serializes stable JSON and formula-neutralized UTF-8 CSV', () => {
    const document = createOcrLayoutDocument(regions, { filename: 'scan.png', width: 100, height: 80 })
    const json = serializeOcrLayoutJson(document)
    const csv = serializeOcrLayoutCsv(document)

    expect(json.endsWith('\n')).toBe(true)
    expect(JSON.parse(json).wordCount).toBe(2)
    expect(csv.startsWith('\uFEFF"word_index"')).toBe(true)
    expect(csv).toContain('"\'@line-2"')
    expect(csv).toContain('"\'=SUM(1,1)"')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('rejects missing dimensions and creates safe export filenames', () => {
    expect(() => createOcrLayoutDocument(regions, { filename: 'scan.png', width: 0, height: 80 })).toThrow('有效的原图尺寸')
    expect(ocrLayoutFilename('客户<卡片>.PNG', 'json')).toBe('客户-卡片--ocr-layout.json')
    expect(ocrLayoutFilename('..', 'csv')).toBe('ocr-layout-ocr-layout.csv')
    expect(ocrLayoutFilename('CON.png', 'json')).toBe('CON-file-ocr-layout.json')
    expect(ocrLayoutFilename('invoice...png', 'csv')).toBe('invoice-ocr-layout.csv')
  })
})
