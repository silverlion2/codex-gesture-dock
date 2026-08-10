import { ArrowLeft, Check, Copy, Download, ReceiptText, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { receiptFieldsToCsv, type ReceiptFields } from '../lib/receiptFields'

interface ReceiptFieldsPanelProps {
  fields: ReceiptFields
  onChange: (fields: ReceiptFields) => void
  onBack: () => void
  onMessage: (message: string) => void
}

const fieldDefinitions: Array<{
  key: keyof ReceiptFields
  label: string
  placeholder: string
  numeric?: boolean
}> = [
  { key: 'merchant', label: '商户 / 公司', placeholder: '请根据票据确认' },
  { key: 'date', label: '日期', placeholder: 'YYYY-MM-DD' },
  { key: 'documentNumber', label: '单据号', placeholder: '发票或订单编号' },
  { key: 'subtotal', label: '小计', placeholder: '0.00', numeric: true },
  { key: 'tax', label: '税额', placeholder: '0.00', numeric: true },
  { key: 'total', label: '总额', placeholder: '0.00', numeric: true },
  { key: 'currency', label: '币种', placeholder: 'CNY / USD / EUR' },
]

function downloadCsv(fields: ReceiptFields) {
  const url = URL.createObjectURL(new Blob([receiptFieldsToCsv(fields)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `receipt-fields-${new Date().toISOString().replaceAll(':', '-')}.csv`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function ReceiptFieldsPanel({ fields, onChange, onBack, onMessage }: ReceiptFieldsPanelProps) {
  const [copied, setCopied] = useState(false)

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(fields, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onMessage('无法写入剪贴板，请改用 CSV 导出')
    }
  }

  return (
    <section className="receipt-fields-panel" aria-label="票据结构化字段">
      <header>
        <div><ReceiptText size={16} aria-hidden="true" /><strong>票据字段</strong></div>
        <span><ShieldCheck size={13} aria-hidden="true" />本机规则预填，请逐项确认</span>
      </header>
      <div className="receipt-field-grid">
        {fieldDefinitions.map(({ key, label, placeholder, numeric }) => (
          <label key={key}>
            <span>{label}</span>
            <input
              value={fields[key]}
              inputMode={numeric ? 'decimal' : undefined}
              placeholder={placeholder}
              onChange={(event) => onChange({ ...fields, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <footer>
        <button type="button" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" />返回扫描页</button>
        <div>
          <button type="button" onClick={() => void copyJson()}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? '已复制' : '复制 JSON'}
          </button>
          <button type="button" onClick={() => { downloadCsv(fields); onMessage('已导出票据字段 CSV') }}>
            <Download size={14} aria-hidden="true" />确认并导出 CSV
          </button>
        </div>
      </footer>
    </section>
  )
}
