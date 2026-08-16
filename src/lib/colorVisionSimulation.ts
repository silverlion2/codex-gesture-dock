// Public-domain reference constants adapted from libDaltonLens:
// https://github.com/DaltonLens/libDaltonLens

export type ColorVisionDeficiency = 'protan' | 'deutan' | 'tritan'

type Matrix3 = readonly [number, number, number, number, number, number, number, number, number]

interface BrettelParameters {
  first: Matrix3
  second: Matrix3
  separation: readonly [number, number, number]
}

const vienotMatrices: Record<Exclude<ColorVisionDeficiency, 'tritan'>, Matrix3> = {
  protan: [
    0.11238, 0.88762, 0,
    0.11238, 0.88762, 0,
    0.00401, -0.00401, 1,
  ],
  deutan: [
    0.29275, 0.70725, 0,
    0.29275, 0.70725, 0,
    -0.02234, 0.02234, 1,
  ],
}

const tritanParameters: BrettelParameters = {
  first: [
    1.01277, 0.13548, -0.14826,
    -0.01243, 0.86812, 0.14431,
    0.07589, 0.805, 0.11911,
  ],
  second: [
    0.93678, 0.18979, -0.12657,
    0.06154, 0.81526, 0.1232,
    -0.37562, 1.12767, 0.24796,
  ],
  separation: [0.03901, -0.02788, -0.01113],
}

export const colorVisionLabels: Record<ColorVisionDeficiency, string> = {
  protan: '红色觉缺失（Protan）',
  deutan: '绿色觉缺失（Deutan）',
  tritan: '蓝色觉缺失（Tritan）',
}

export function colorVisionMethod(deficiency: ColorVisionDeficiency) {
  return deficiency === 'tritan' ? 'Brettel 1997' : 'Viénot 1999'
}

function assertSeverity(severity: number) {
  if (!Number.isFinite(severity) || severity < 0 || severity > 1) throw new Error('色觉模拟强度必须在 0–100% 之间')
}

function assertPixels(source: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || source.length !== width * height * 4) {
    throw new Error('色觉模拟 RGBA 像素尺寸无效')
  }
}

function linearFromSrgb(channel: number) {
  const value = channel / 255
  return value < 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function srgbFromLinear(value: number) {
  if (value <= 0) return 0
  if (value >= 1) return 255
  const encoded = value < 0.0031308
    ? value * 12.92
    : value ** (1 / 2.4) * 1.055 - 0.055
  return Math.max(0, Math.min(255, Math.round(encoded * 255)))
}

function transform(matrix: Matrix3, red: number, green: number, blue: number) {
  return [
    matrix[0] * red + matrix[1] * green + matrix[2] * blue,
    matrix[3] * red + matrix[4] * green + matrix[5] * blue,
    matrix[6] * red + matrix[7] * green + matrix[8] * blue,
  ] as const
}

function simulateRange(result: Uint8ClampedArray, start: number, end: number, deficiency: ColorVisionDeficiency, severity: number) {
  for (let offset = start; offset < end; offset += 4) {
    const red = linearFromSrgb(result[offset])
    const green = linearFromSrgb(result[offset + 1])
    const blue = linearFromSrgb(result[offset + 2])
    let simulated: readonly [number, number, number]
    if (deficiency === 'tritan') {
      const separation = tritanParameters.separation
      const dot = red * separation[0] + green * separation[1] + blue * separation[2]
      simulated = transform(dot >= 0 ? tritanParameters.first : tritanParameters.second, red, green, blue)
    } else {
      simulated = transform(vienotMatrices[deficiency], red, green, blue)
    }
    result[offset] = srgbFromLinear(simulated[0] * severity + red * (1 - severity))
    result[offset + 1] = srgbFromLinear(simulated[1] * severity + green * (1 - severity))
    result[offset + 2] = srgbFromLinear(simulated[2] * severity + blue * (1 - severity))
  }
}

export function simulateColorVisionPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  deficiency: ColorVisionDeficiency,
  severity: number,
) {
  assertPixels(source, width, height)
  assertSeverity(severity)
  const result = new Uint8ClampedArray(source)
  simulateRange(result, 0, result.length, deficiency, severity)
  return result
}

export async function simulateColorVisionPixelsCooperatively(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  deficiency: ColorVisionDeficiency,
  severity: number,
  signal?: AbortSignal,
) {
  assertPixels(source, width, height)
  assertSeverity(severity)
  const result = new Uint8ClampedArray(source)
  const chunkLength = 200_000 * 4
  for (let start = 0; start < result.length; start += chunkLength) {
    if (signal?.aborted) throw new DOMException('已取消色觉模拟', 'AbortError')
    simulateRange(result, start, Math.min(result.length, start + chunkLength), deficiency, severity)
    if (start + chunkLength < result.length) await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  if (signal?.aborted) throw new DOMException('已取消色觉模拟', 'AbortError')
  return result
}

function canvasToPng(canvas: HTMLCanvasElement, signal?: AbortSignal) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (signal?.aborted) reject(new DOMException('已取消色觉模拟', 'AbortError'))
      else if (blob) resolve(blob)
      else reject(new Error('色觉模拟 PNG 编码失败'))
    }, 'image/png')
  })
}

export async function renderColorVisionPng(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  deficiency: ColorVisionDeficiency,
  severity: number,
  signal?: AbortSignal,
) {
  const pixels = await simulateColorVisionPixelsCooperatively(source, width, height, deficiency, severity, signal)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('当前设备无法创建色觉模拟画布')
  const imageData = context.createImageData(width, height)
  imageData.data.set(pixels)
  context.putImageData(imageData, 0, 0)
  return canvasToPng(canvas, signal)
}

export function colorVisionFilename(filename: string, deficiency: ColorVisionDeficiency, severity: number) {
  assertSeverity(severity)
  const base = filename.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'image'
  return `${base}-${deficiency}-${Math.round(severity * 100)}.png`
}
