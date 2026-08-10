import type { OcrResult } from './localOcr'

export interface CombinedOcrItem {
  filename: string
  result?: OcrResult
}

export function buildCombinedOcrText(items: CombinedOcrItem[]) {
  return items
    .filter((item): item is CombinedOcrItem & { result: OcrResult } => Boolean(item.result))
    .map((item) => `===== ${item.filename} =====\n${item.result.text.trim()}`)
    .join('\n\n')
}
