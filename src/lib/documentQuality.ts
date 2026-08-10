export type DocumentQualityIssueCode =
  | 'low-resolution'
  | 'dark'
  | 'bright'
  | 'low-contrast'
  | 'blur'
  | 'glare'

export interface DocumentQualityIssue {
  code: DocumentQualityIssueCode
  label: string
  guidance: string
}

export interface DocumentQualityReport {
  status: 'good' | 'review' | 'poor'
  width: number
  height: number
  meanLuminance: number
  contrast: number
  sharpness: number
  shadowRatio: number
  highlightRatio: number
  issues: DocumentQualityIssue[]
}

const issueDetails: Record<DocumentQualityIssueCode, Omit<DocumentQualityIssue, 'code'>> = {
  'low-resolution': {
    label: '分辨率偏低',
    guidance: '靠近文档或使用更高分辨率原图，细小文字会更容易识别。',
  },
  dark: {
    label: '画面偏暗',
    guidance: '增加均匀照明，避免只依赖后期增强。',
  },
  bright: {
    label: '画面过亮',
    guidance: '降低曝光或避开强光，防止浅色文字消失。',
  },
  'low-contrast': {
    label: '对比度偏低',
    guidance: '改善照明、对焦或改用灰度/黑白文档增强。',
  },
  blur: {
    label: '可能模糊',
    guidance: '稳定镜头并重新对焦后再拍摄。',
  },
  glare: {
    label: '疑似局部反光',
    guidance: '调整灯光或拍摄角度，并检查亮斑内是否丢失文字。',
  },
}

function issue(code: DocumentQualityIssueCode): DocumentQualityIssue {
  return { code, ...issueDetails[code] }
}

function luminanceAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4
  return pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722
}

export function analyzeDocumentQualityPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): DocumentQualityReport {
  if (width < 1 || height < 1 || pixels.byteLength < width * height * 4) {
    throw new Error('无法分析无效的文档图像数据')
  }

  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 60_000)))
  let count = 0
  let luminanceSum = 0
  let luminanceSquaredSum = 0
  let shadowCount = 0
  let highlightCount = 0
  let laplacianSum = 0
  let laplacianCount = 0
  const tileSamples = new Uint32Array(16)
  const tileHighlights = new Uint32Array(16)

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const luminance = luminanceAt(pixels, width, x, y)
      count += 1
      luminanceSum += luminance
      luminanceSquaredSum += luminance * luminance
      if (luminance <= 10) shadowCount += 1
      if (luminance >= 250) highlightCount += 1
      const tileX = Math.min(3, Math.floor(x * 4 / width))
      const tileY = Math.min(3, Math.floor(y * 4 / height))
      const tileIndex = tileY * 4 + tileX
      tileSamples[tileIndex] += 1
      if (luminance >= 250) tileHighlights[tileIndex] += 1

      if (x >= stride && x + stride < width && y >= stride && y + stride < height) {
        const laplacian = 4 * luminance
          - luminanceAt(pixels, width, x - stride, y)
          - luminanceAt(pixels, width, x + stride, y)
          - luminanceAt(pixels, width, x, y - stride)
          - luminanceAt(pixels, width, x, y + stride)
        laplacianSum += Math.abs(laplacian)
        laplacianCount += 1
      }
    }
  }

  const meanLuminance = luminanceSum / count
  const variance = Math.max(0, luminanceSquaredSum / count - meanLuminance * meanLuminance)
  const contrast = Math.sqrt(variance)
  const sharpness = laplacianCount > 0 ? laplacianSum / laplacianCount : 0
  const shadowRatio = shadowCount / count
  const highlightRatio = highlightCount / count
  let peakTileHighlightRatio = 0
  for (let index = 0; index < tileSamples.length; index += 1) {
    if (tileSamples[index] > 0) {
      peakTileHighlightRatio = Math.max(peakTileHighlightRatio, tileHighlights[index] / tileSamples[index])
    }
  }

  const issues: DocumentQualityIssue[] = []
  if (Math.min(width, height) < 700 || Math.max(width, height) < 1_100) issues.push(issue('low-resolution'))
  if (meanLuminance < 65 || (shadowRatio > 0.42 && meanLuminance < 115)) issues.push(issue('dark'))
  if (meanLuminance > 238 || (highlightRatio > 0.82 && meanLuminance > 220)) issues.push(issue('bright'))
  if (contrast < 22) issues.push(issue('low-contrast'))
  if (contrast >= 22 && sharpness < 5.5) issues.push(issue('blur'))
  if (highlightRatio >= 0.015 && highlightRatio <= 0.3 && peakTileHighlightRatio >= 0.48 && meanLuminance < 225) {
    issues.push(issue('glare'))
  }

  const poorCodes = new Set<DocumentQualityIssueCode>(['dark', 'bright', 'low-contrast', 'blur'])
  return {
    status: issues.some((entry) => poorCodes.has(entry.code)) ? 'poor' : issues.length > 0 ? 'review' : 'good',
    width,
    height,
    meanLuminance: Number(meanLuminance.toFixed(1)),
    contrast: Number(contrast.toFixed(1)),
    sharpness: Number(sharpness.toFixed(1)),
    shadowRatio: Number(shadowRatio.toFixed(4)),
    highlightRatio: Number(highlightRatio.toFixed(4)),
    issues,
  }
}
