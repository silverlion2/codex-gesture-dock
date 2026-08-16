import { describe, expect, it } from 'vitest'
import type { OcrRegion } from './localOcr'
import { detectOcrTable, ocrTableFilename, serializeOcrTableCsv } from './ocrTable'

function word(text: string, lineId: string, x0: number, y0: number, x1: number, confidence = 92): OcrRegion {
  return { text, confidence, lineId, x0, y0, x1, y1: y0 + 22 }
}

describe('OCR table assistance', () => {
  it('detects a repeated aligned three-column table and ignores surrounding prose', () => {
    const regions: OcrRegion[] = [
      word('Quarterly report', 'title', 30, 20, 180),
      word('Name', 'row-1', 20, 100, 70), word('Qty', 'row-1', 220, 100, 260), word('Total', 'row-1', 420, 100, 480),
      word('Paper', 'row-2', 20, 140, 80), word('12', 'row-2', 220, 140, 245), word('$24', 'row-2', 420, 140, 460),
      word('Ink', 'row-3', 20, 180, 55), word('3', 'row-3', 220, 180, 235), word('$18', 'row-3', 420, 180, 460),
      word('Tape', 'row-4', 20, 220, 70), word('7', 'row-4', 220, 220, 235), word('$14', 'row-4', 420, 220, 460),
      word('Reviewed manually', 'footer', 30, 340, 180),
    ]

    const result = detectOcrTable(regions, 500, 400)

    expect(result).not.toBeNull()
    expect(result?.rows).toEqual([
      ['Name', 'Qty', 'Total'],
      ['Paper', '12', '$24'],
      ['Ink', '3', '$18'],
      ['Tape', '7', '$14'],
    ])
    expect(result).toMatchObject({ rowCount: 4, columnCount: 3, usedWordCount: 12, ignoredWordCount: 2, confidenceLabel: 'high' })
    expect(result?.separatorPositions).toHaveLength(2)
  })

  it('joins nearby words inside a cell and selects the largest vertically separated table', () => {
    const regions: OcrRegion[] = [
      word('A', 'small-1', 20, 20, 35), word('1', 'small-1', 210, 20, 225),
      word('B', 'small-2', 20, 50, 35), word('2', 'small-2', 210, 50, 225),
      word('C', 'small-3', 20, 80, 35), word('3', 'small-3', 210, 80, 225),
      word('First', 'large-1', 20, 260, 65), word('name', 'large-1', 73, 260, 115), word('10', 'large-1', 310, 260, 335),
      word('Second', 'large-2', 20, 295, 80), word('name', 'large-2', 88, 295, 130), word('20', 'large-2', 310, 295, 335),
      word('Third', 'large-3', 20, 330, 70), word('name', 'large-3', 78, 330, 120), word('30', 'large-3', 310, 330, 335),
      word('Fourth', 'large-4', 20, 365, 80), word('name', 'large-4', 88, 365, 130), word('40', 'large-4', 310, 365, 335),
    ]

    const result = detectOcrTable(regions, 500, 500)

    expect(result?.rowCount).toBe(4)
    expect(result?.rows[0]).toEqual(['First name', '10'])
  })

  it('fails closed for prose, too few aligned rows, invalid dimensions, and excessive regions', () => {
    const prose = [
      word('This', 'p1', 10, 10, 50), word('is', 'p1', 58, 10, 75), word('text', 'p1', 83, 10, 120),
      word('Only', 'p2', 10, 40, 50), word('two', 'p2', 200, 40, 235),
      word('rows', 'p3', 10, 70, 50), word('apart', 'p3', 200, 70, 250),
    ]
    expect(detectOcrTable(prose, 400, 300)).toBeNull()
    expect(() => detectOcrTable(prose, 0, 300)).toThrow('有效的原图尺寸')
    expect(() => detectOcrTable(Array.from({ length: 5_001 }, () => prose[0]), 400, 300)).toThrow('最多处理 5000 个词框')
    const oversizedTable = Array.from({ length: 201 }, (_, rowIndex) => [
      word(`A${rowIndex}`, `row-${rowIndex}`, 10, rowIndex * 25, 55),
      word(`B${rowIndex}`, `row-${rowIndex}`, 250, rowIndex * 25, 295),
    ]).flat()
    expect(() => detectOcrTable(oversizedTable, 400, 5_200)).toThrow('超过 200 行')
  })

  it('serializes a rectangular formula-safe UTF-8 CSV and creates Windows-safe names', () => {
    const csv = serializeOcrTableCsv([
      ['Name', 'Value'],
      ['"quoted"', '=2+3'],
      ['line\nbreak', '@SUM(A1)'],
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"""quoted"""')
    expect(csv).toContain('"\'=2+3"')
    expect(csv).toContain('"\'@SUM(A1)"')
    expect(() => serializeOcrTableCsv([['one']])).toThrow('2–8')
    expect(ocrTableFilename('CON.png')).toBe('CON-file-ocr-table.csv')
    expect(ocrTableFilename('sales<q1>.png')).toBe('sales-q1--ocr-table.csv')
  })
})
