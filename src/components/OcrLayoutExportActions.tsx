import { FileCode2, FileJson, Table2, TableProperties, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OcrRegion } from '../lib/localOcr'
import {
  createOcrLayoutDocument,
  ocrLayoutFilename,
  readOcrImageDimensions,
  serializeOcrLayoutCsv,
  serializeOcrLayoutAlto,
  serializeOcrLayoutHocr,
  serializeOcrLayoutJson,
  type OcrLayoutFormat,
} from '../lib/ocrLayoutExport'
import {
  detectOcrTable,
  ocrTableFilename,
  serializeOcrTableCsv,
  type OcrTableCandidate,
} from '../lib/ocrTable'

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

interface TableReviewState {
  candidate: OcrTableCandidate
  rows: string[][]
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
  const [exporting, setExporting] = useState<OcrLayoutFormat | null>(null)
  const [tableReview, setTableReview] = useState<TableReviewState | null>(null)
  const [tableError, setTableError] = useState('')
  const tableButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeTableButtonRef = useRef<HTMLButtonElement | null>(null)
  const noteId = useId()
  const tableOpen = tableReview !== null

  useEffect(() => {
    setTableReview(null)
    setTableError('')
  }, [filename, height, regions, sourceFile, width])

  useEffect(() => {
    if (!tableOpen) return
    closeTableButtonRef.current?.focus()
  }, [tableOpen])

  const resolveDimensions = async (missingMessage: string) => {
    const dimensions = width && height
      ? { width, height }
      : sourceFile
        ? await readOcrImageDimensions(sourceFile)
        : null
    if (!dimensions) throw new Error(missingMessage)
    return dimensions
  }

  const exportLayout = async (format: OcrLayoutFormat) => {
    setExporting(format)
    try {
      const dimensions = await resolveDimensions('缺少 OCR 原图尺寸，无法导出版面坐标')
      const document = createOcrLayoutDocument(regions, {
        filename,
        ...dimensions,
        language,
      })
      if (document.wordCount === 0) throw new Error('当前 OCR 结果没有有效词坐标')
      const text = format === 'json'
        ? serializeOcrLayoutJson(document)
        : format === 'csv'
          ? serializeOcrLayoutCsv(document)
          : format === 'hocr'
            ? serializeOcrLayoutHocr(document)
            : serializeOcrLayoutAlto(document)
      downloadLayout(
        text,
        ocrLayoutFilename(filename, format),
        format === 'json'
          ? 'application/json;charset=utf-8'
          : format === 'csv'
            ? 'text/csv;charset=utf-8'
            : format === 'hocr'
              ? 'text/html;charset=utf-8'
              : 'application/xml;charset=utf-8',
      )
      const formatLabel = format === 'hocr' ? 'hOCR' : format.toUpperCase()
      onMessage(`已导出 ${document.wordCount} 个当前 OCR 词框的版面 ${formatLabel}；逐词复核保留坐标，整段改字不会重排`)
    } catch (caught) {
      onMessage(caught instanceof Error ? caught.message : 'OCR 版面导出失败')
    } finally {
      setExporting(null)
    }
  }

  const openTableReview = async () => {
    setTableError('')
    try {
      const dimensions = await resolveDimensions('缺少 OCR 原图尺寸，无法分析版面表格')
      const candidate = detectOcrTable(regions, dimensions.width, dimensions.height)
      if (!candidate) throw new Error('未找到至少 3 行、分隔位置重复对齐的简单表格；请改用版面 JSON/CSV/hOCR/ALTO 人工处理')
      setTableReview({ candidate, rows: candidate.rows.map((row) => [...row]) })
      onMessage(`已找到 ${candidate.rowCount} 行 × ${candidate.columnCount} 列表格候选；请逐格复核后导出`)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'OCR 表格辅助失败'
      setTableError(message)
      onMessage(message)
    }
  }

  const updateTableCell = (rowIndex: number, columnIndex: number, value: string) => {
    setTableReview((current) => current ? {
      ...current,
      rows: current.rows.map((row, activeRow) => activeRow === rowIndex
        ? row.map((cell, activeColumn) => activeColumn === columnIndex ? value : cell)
        : row),
    } : current)
  }

  const exportTable = () => {
    if (!tableReview) return
    try {
      downloadLayout(
        serializeOcrTableCsv(tableReview.rows),
        ocrTableFilename(filename),
        'text/csv;charset=utf-8',
      )
      onMessage(`已导出人工复核的 ${tableReview.rows.length} 行 × ${tableReview.candidate.columnCount} 列 OCR 表格 CSV`)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'OCR 表格 CSV 导出失败'
      setTableError(message)
      onMessage(message)
    }
  }

  const closeTableReview = () => {
    setTableReview(null)
    window.setTimeout(() => tableButtonRef.current?.focus(), 0)
  }

  return (
    <>
      <span id={noteId} className="sr-only">版面导出使用当前逐词复核文字、原词框和引擎置信度；整段 OCR 文本或名片字段修改不会重排坐标。</span>
      <button type="button" aria-describedby={noteId} disabled={exporting !== null || regions.length === 0} onClick={() => void exportLayout('json')}><FileJson size={14} aria-hidden="true" />{exporting === 'json' ? '正在导出' : '版面 JSON'}</button>
      <button type="button" aria-describedby={noteId} disabled={exporting !== null || regions.length === 0} onClick={() => void exportLayout('csv')}><Table2 size={14} aria-hidden="true" />{exporting === 'csv' ? '正在导出' : '版面 CSV'}</button>
      <button type="button" aria-describedby={noteId} disabled={exporting !== null || regions.length === 0} onClick={() => void exportLayout('hocr')}><FileCode2 size={14} aria-hidden="true" />{exporting === 'hocr' ? '正在导出' : '版面 hOCR'}</button>
      <button type="button" aria-describedby={noteId} disabled={exporting !== null || regions.length === 0} onClick={() => void exportLayout('alto')}><FileCode2 size={14} aria-hidden="true" />{exporting === 'alto' ? '正在导出' : '版面 ALTO'}</button>
      <button ref={tableButtonRef} type="button" aria-describedby={noteId} disabled={exporting !== null || regions.length === 0} onClick={() => void openTableReview()}><TableProperties size={14} aria-hidden="true" />表格辅助</button>
      {tableError && <div className="ocr-table-error" role="alert"><span>{tableError}</span><button type="button" aria-label="关闭表格辅助错误" onClick={() => setTableError('')}><X size={13} aria-hidden="true" /></button></div>}
      {tableReview && createPortal(
        <div className="ocr-table-backdrop">
        <section className="ocr-table-review" role="dialog" aria-modal="true" aria-label="OCR 表格人工复核" onKeyDown={(event) => { if (event.key === 'Escape') closeTableReview() }}>
          <header>
            <div><TableProperties size={16} aria-hidden="true" /><strong>{tableReview.candidate.rowCount} 行 × {tableReview.candidate.columnCount} 列候选</strong></div>
            <span>{tableReview.candidate.confidenceLabel === 'high' ? '对齐较稳定' : '需要重点复核'} · 使用 {tableReview.candidate.usedWordCount} 个词框{tableReview.candidate.ignoredWordCount > 0 ? ` · 忽略 ${tableReview.candidate.ignoredWordCount} 个` : ''}</span><button ref={closeTableButtonRef} type="button" aria-label="关闭表格复核对话框" onClick={closeTableReview}><X size={15} aria-hidden="true" /></button>
          </header>
          <div className="ocr-table-scroll" tabIndex={0} aria-label="可横向滚动的 OCR 表格">
            <table>
              <caption className="sr-only">OCR 自动推测的简单表格；所有单元格均可编辑</caption>
              <tbody>{tableReview.rows.map((row, rowIndex) => <tr key={tableReview.candidate.rowLineIds[rowIndex] ?? rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}><input aria-label={`表格第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列`} value={cell} onChange={(event) => updateTableCell(rowIndex, columnIndex, event.target.value)} /></td>)}</tr>)}</tbody>
            </table>
          </div>
          <p>仅提取最大一块重复对齐的简单行列表格；不识别合并单元格、跨页表头、嵌套表格或字段语义。请对照原图逐格修正，公式前缀会在 CSV 中安全转义。</p>
          <div><button type="button" onClick={exportTable}><Table2 size={14} aria-hidden="true" />确认并导出表格 CSV</button><button type="button" onClick={closeTableReview}>关闭表格复核</button></div>
        </section>
        </div>,
        document.body,
      )}
    </>
  )
}
