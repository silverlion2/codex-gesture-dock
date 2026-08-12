import { describe, expect, it } from 'vitest'
import {
  computeColorCanvasSize,
  contrastRatio,
  evaluateContrast,
  hexToRgb,
  paletteCss,
  paletteJson,
  rgbToHex,
  sampleColor,
  type PaletteColor,
} from './colorAnalysis'

const palette: PaletteColor[] = [{
  r: 18,
  g: 52,
  b: 86,
  hex: '#123456',
  oklch: { l: 0.32, c: 0.07, h: 250 },
  proportion: 0.42,
  textColor: '#ffffff',
  contrastWhite: 12.72,
  contrastBlack: 1.65,
}]

describe('colorAnalysis', () => {
  it('keeps small images natural and bounds large analysis canvases', () => {
    expect(computeColorCanvasSize(800, 600)).toEqual({ width: 800, height: 600, scale: 1 })
    expect(computeColorCanvasSize(4_000, 2_000)).toEqual({ width: 2_400, height: 1_200, scale: 0.6 })
    expect(computeColorCanvasSize(4_000, 4_000)).toEqual({ width: 2_000, height: 2_000, scale: 0.5 })
  })

  it('converts bounded RGB and six-digit HEX values', () => {
    expect(rgbToHex({ r: 18, g: 52, b: 86 })).toBe('#123456')
    expect(rgbToHex({ r: -4, g: 127.6, b: 300 })).toBe('#0080FF')
    expect(hexToRgb('#12aBcD')).toEqual({ r: 18, g: 171, b: 205, hex: '#12ABCD' })
    expect(hexToRgb('#fff')).toBeNull()
  })

  it('evaluates the WCAG 2 contrast thresholds independently', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21)
    expect(evaluateContrast({ r: 118, g: 118, b: 118 }, { r: 255, g: 255, b: 255 })).toMatchObject({
      aaNormal: true,
      aaLarge: true,
      aaaNormal: false,
      aaaLarge: true,
    })
  })

  it('samples clamped normalized image coordinates', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ])
    expect(sampleColor(pixels, 2, 2, 0.75, 0.1).hex).toBe('#00FF00')
    expect(sampleColor(pixels, 2, 2, 2, 2).hex).toBe('#FFFFFF')
  })

  it('rejects inconsistent sampling buffers', () => {
    expect(() => sampleColor(new Uint8ClampedArray(4), 2, 2, 0, 0)).toThrow('图片采样像素尺寸不一致')
  })

  it('serializes palette colors without implementation-only fields', () => {
    expect(paletteCss(palette)).toBe(':root {\n  --image-color-1: #123456;\n}')
    expect(JSON.parse(paletteJson(palette))).toEqual([{
      hex: '#123456',
      rgb: { r: 18, g: 52, b: 86 },
      oklch: { l: 0.32, c: 0.07, h: 250 },
      proportion: 0.42,
    }])
  })
})
