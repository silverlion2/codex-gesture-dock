import { describe, expect, it } from 'vitest'
import {
  analyzeImageInspectionPixels,
  computeImageInspectionSize,
  imageInspectionFilename,
  imageInspectionJson,
} from './imageInspection'

describe('image inspection', () => {
  it('bounds large analysis canvases without changing aspect ratio', () => {
    expect(computeImageInspectionSize(1200, 800)).toEqual({ width: 1200, height: 800, scale: 1 })
    const large = computeImageInspectionSize(12000, 8000)
    expect(large.width).toBe(2400)
    expect(large.height).toBe(1600)
    expect(large.scale).toBe(0.2)
    expect(() => computeImageInspectionSize(0, 20)).toThrow('图片尺寸无效')
  })

  it('builds deterministic channel histograms and clipping ratios', () => {
    const report = analyzeImageInspectionPixels(new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]), 2, 1, { filename: 'range.png', mimeType: 'image/png', fileSize: 8 })

    expect(report.meanLuminance).toBe(127.5)
    expect(report.contrast).toBe(127.5)
    expect(report.shadowClipRatio).toBe(0.5)
    expect(report.highlightClipRatio).toBe(0.5)
    expect(report.histogram.luminance[0]).toBe(1)
    expect(report.histogram.luminance[63]).toBe(1)
    expect(report.signals.map((entry) => entry.code)).toEqual(['shadow-clipping', 'highlight-clipping'])
  })

  it('excludes fully transparent pixels and reports partial transparency', () => {
    const report = analyzeImageInspectionPixels(new Uint8ClampedArray([
      255, 255, 255, 0,
      255, 0, 0, 128,
    ]), 2, 1)

    expect(report.visiblePixels).toBe(1)
    expect(report.transparentRatio).toBe(0.5)
    expect(report.partialTransparencyRatio).toBe(0.5)
    expect(report.histogram.red[63]).toBe(1)
    expect(report.signals.some((entry) => entry.code === 'transparency')).toBe(true)
    expect(() => analyzeImageInspectionPixels(new Uint8ClampedArray(8), 2, 1)).toThrow('没有可分析的可见像素')
  })

  it('exports a versioned report with a safe filename and explicit limitation', () => {
    const report = analyzeImageInspectionPixels(new Uint8ClampedArray([120, 130, 140, 255]), 1, 1, {
      filename: 'bad:name?.png',
      mimeType: 'image/png',
      fileSize: 100,
    })
    const exported = JSON.parse(imageInspectionJson(report))

    expect(imageInspectionFilename(report.filename)).toBe('bad-name--inspection.json')
    expect(imageInspectionFilename('CON.png')).toBe('CON-file-inspection.json')
    expect(exported.schema).toBe('local-image-inspection')
    expect(exported.version).toBe(1)
    expect(exported.analysis.histogram.bins).toBe(64)
    expect(exported.limitations).toContain('not a subjective quality')
  })
})
