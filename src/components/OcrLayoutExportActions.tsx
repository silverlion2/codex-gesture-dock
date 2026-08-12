import { FileJson, Table2 } from 'lucide-react'
import { useId, useState } from 'react'
import type { OcrRegion } from '../lib/localOcr'
import {
  createOcrLayoutDocument,
  ocrLayoutFilename,
  readOcrImageDimensions,
  serializeOcrLayoutCsv,
  serializeOcrLayoutJson,
} from '../lib/ocrLayoutExport'

interface OcrLayoutExportActionsProps {
  regions: OcrRegion[]
  filename: string
  sourceFile?: File
  width?: number
  height?: number
  language?: string
  onMessage: (message: string) => void
}

function downloadLayout(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function OcrLayoutExportActions({
  regions,
  filename,
  sourceFile,
  width,
  height,
  language,
  onMessage,
}: OcrLayoutExportActionsProps) {
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)
  const noteId = useId()

  const exportLayout = async (format: 'json' | 'csv') => {
    setExporting(format)
    try {
      const dimensions = width && height
        ? { width, height }
        : sourceFile
          ? await readOcrImageDimensions(sourceFile)
          : null
      if (!dimensions) throw new Error('缺少 OCR 原图尺寸，无法导出版面坐标')
      const document = createOcrLayoutDocument(regions, {
        filename,
        ...dimensions,
        language,
      })
      if (document.wordCount === 0) throw new Error('当前 OCR 结果没有有效词坐标')
      const text = format === 'json' ? serializeOcrLayoutJson(document) : serializeOcrLayoutCsv(document)
      downloadLayout(
        text,
        ocrLayoutFilename(filename, format),
        format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
      )
      onMessage(`已导出 ${document.wordCount} 个原始 OCR 词框的版面 ${format.toUpperCase()}；人工改字不会重排坐标`)
    } catch (caught) {
      onMessage(caught instanceof Error ? caught.message : 'OCR 版面导出失败')
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <span id={noteId} className="sr-only">版面导出使用识别时的原始词框和置信度，不跟随人工修改的 OCR 文本或名片字段。</span>
      <button type="button" aria-describedby={noteId} disabled={exporting !== null || regions.length === 0} onClick={() => void exportLayout('json')}><FileJson size={14} aria-hidden="true" />{exporting === 'json' ? '正在导出' : '版面 JSON'}</button>
      <button type="button" aria-describedby={noteId} disabled={exporting !== null || regions.length === 0} onClick={() => void exportLayout('csv')}><Table2 size={14} aria-hidden="true" />{exporting === 'csv' ? '正在导出' : '版面 CSV'}</button>
    </>
  )
}
