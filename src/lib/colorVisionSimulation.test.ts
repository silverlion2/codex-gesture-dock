import { describe, expect, it } from 'vitest'
import {
  colorVisionFilename,
  colorVisionMethod,
  simulateColorVisionPixels,
  simulateColorVisionPixelsCooperatively,
} from './colorVisionSimulation'

describe('color vision simulation', () => {
  const source = new Uint8ClampedArray([
    255, 0, 0, 17,
    0, 255, 0, 93,
    0, 0, 255, 255,
    120, 80, 40, 201,
  ])

  it('preserves the original at zero severity and never changes alpha', () => {
    expect(simulateColorVisionPixels(source, 2, 2, 'deutan', 0)).toEqual(source)
    for (const deficiency of ['protan', 'deutan', 'tritan'] as const) {
      const result = simulateColorVisionPixels(source, 2, 2, deficiency, 1)
      expect([result[3], result[7], result[11], result[15]]).toEqual([17, 93, 255, 201])
    }
  })

  it('matches fixed public-domain libDaltonLens reference transforms', () => {
    expect([...simulateColorVisionPixels(source, 2, 2, 'protan', 1)]).toEqual([
      94, 94, 13, 17, 242, 242, 0, 93, 0, 0, 255, 255, 86, 86, 40, 201,
    ])
    expect([...simulateColorVisionPixels(source, 2, 2, 'deutan', 1)]).toEqual([
      147, 147, 0, 17, 219, 219, 41, 93, 0, 0, 255, 255, 94, 94, 37, 201,
    ])
    expect([...simulateColorVisionPixels(source, 2, 2, 'tritan', 1)]).toEqual([
      255, 0, 78, 17, 121, 233, 255, 93, 0, 98, 136, 255, 123, 75, 81, 201,
    ])
  })

  it('cooperatively produces the same pixels and respects cancellation', async () => {
    const expected = simulateColorVisionPixels(source, 2, 2, 'tritan', 0.6)
    await expect(simulateColorVisionPixelsCooperatively(source, 2, 2, 'tritan', 0.6)).resolves.toEqual(expected)
    const controller = new AbortController()
    controller.abort()
    await expect(simulateColorVisionPixelsCooperatively(source, 2, 2, 'protan', 1, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('validates dimensions, severity, method labels, and safe filenames', () => {
    expect(() => simulateColorVisionPixels(source, 1, 1, 'protan', 1)).toThrow('像素尺寸无效')
    expect(() => simulateColorVisionPixels(source, 2, 2, 'protan', 1.1)).toThrow('0–100%')
    expect(colorVisionMethod('protan')).toBe('Viénot 1999')
    expect(colorVisionMethod('tritan')).toBe('Brettel 1997')
    expect(colorVisionFilename('my unsafe / design.jpg', 'deutan', 0.8)).toBe('my-unsafe-design-deutan-80.png')
  })
})
