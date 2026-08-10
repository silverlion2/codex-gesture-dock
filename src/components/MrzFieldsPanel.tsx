import { ArrowLeft, Check, Copy, Download, ScanText, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import {
  buildReviewedMrzJson,
  mrzJsonFilename,
  type MrzEditableFields,
  type MrzExtraction,
} from '../lib/mrzExtraction'

interface MrzFieldsPanelProps {
  extraction: MrzExtraction
  onBack: () => void
  onMessage: (message: string) => void
}

const fieldDefinitions: Array<{ key: keyof MrzEditableFields; label: string }> = [
  { key: 'documentCode', label: '证件类型' },
  { key: 'documentNumber', label: '证件号码' },
  { key: 'issuingState', label: '签发国/地区' },
  { key: 'nationality', label: '国籍' },
  { key: 'surname', label: '姓' },
  { key: 'givenNames', label: '名' },
  { key: 'birthDate', label: '出生日期（YYMMDD）' },
  { key: 'sex', label: '性别标记' },
  { key: 'expirationDate', label: '有效期（YYMMDD）' },
  { key: 'personalNumber', label: '个人号码' },
]

function downloadJson(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function MrzFieldsPanel({ extraction, onBack, onMessage }: MrzFieldsPanelProps) {
  const [fields, setFields] = useState(extraction.fields)
  const [reviewed, setReviewed] = useState(false)
  const [copied, setCopied] = useState(false)
  const json = buildReviewedMrzJson(extraction, fields)

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请改用 JSON 导出')
    }
  }

  return (
    <section className="receipt-fields-panel mrz-fields-panel" aria-label="证件 MRZ 结构化字段">
      <header>
        <div><ScanText size={16} aria-hidden="true" /><strong>证件 MRZ</strong></div>
        <span>{extraction.checksumsValid ? <ShieldCheck size={13} aria-hidden="true" /> : <ShieldAlert size={13} aria-hidden="true" />}{extraction.format} · {extraction.checksumsValid ? '校验位通过' : '存在校验位错误'}</span>
      </header>
      <div className={extraction.valid ? 'mrz-validation is-valid' : 'mrz-validation is-warning'} role="status">
        <strong>{extraction.valid ? 'MRZ 字段与校验均通过' : '部分字段需要人工修正'}</strong>
        <small>校验位只能帮助发现读取错误，不能证明证件或身份真实。</small>
        {extraction.correctedCharacterCount > 0 && <small>已按字段类型修正 {extraction.correctedCharacterCount} 个 OCR 易混字符，请重点复核。</small>}
        {extraction.reconstructedFillerCount > 0 && <small>已补齐名称行末尾 {extraction.reconstructedFillerCount} 个缺失/误读填充符，请重点复核姓名。</small>}
        {extraction.invalidFields.length > 0 && <small>未通过：{extraction.invalidFields.join('、')}</small>}
      </div>
      <div className="receipt-field-grid">
        {fieldDefinitions.map(({ key, label }) => (
          <label key={key}>
            <span>{label}</span>
            <input value={fields[key]} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} />
          </label>
        ))}
      </div>
      <details className="mrz-raw-lines">
        <summary>查看原始 MRZ 行</summary>
        <pre>{extraction.rawLines.join('\n')}</pre>
      </details>
      <label className="mrz-review-confirmation">
        <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
        我已对照原证件逐项复核；导出结果不代表真实性验证
      </label>
      <footer>
        <button type="button" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" />返回 OCR 结果</button>
        <div>
          <button type="button" disabled={!reviewed} onClick={() => void copyJson()}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? '已复制' : '复制 JSON'}
          </button>
          <button type="button" disabled={!reviewed} onClick={() => { downloadJson(json, mrzJsonFilename(fields.documentNumber)); onMessage('已导出人工复核的 MRZ JSON') }}>
            <Download size={14} aria-hidden="true" />确认并导出 JSON
          </button>
        </div>
      </footer>
    </section>
  )
}

export default MrzFieldsPanel
