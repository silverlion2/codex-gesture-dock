export interface ReceiptFields {
  merchant: string
  date: string
  documentNumber: string
  subtotal: string
  tax: string
  total: string
  currency: string
}

const amountPattern = /(?:^|\s|[:：¥￥$€£])(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d{2}))(?:\s|$)/g

function lastAmount(line: string) {
  const amounts = [...line.matchAll(amountPattern)]
  const value = amounts.at(-1)?.[1]
  if (!value) return ''
  return value.includes('.') ? value.replaceAll(',', '') : value.replace(',', '.')
}

function amountByLabel(lines: string[], labels: RegExp, exclusions?: RegExp) {
  for (const line of [...lines].reverse()) {
    if (!labels.test(line) || exclusions?.test(line)) continue
    const amount = lastAmount(line)
    if (amount) return amount
  }
  return ''
}

function detectCurrency(text: string) {
  if (/(?:CNY|RMB|人民币|人民幣|[¥￥])/i.test(text)) return 'CNY'
  if (/(?:USD|US\$|美元)/i.test(text)) return 'USD'
  if (/(?:EUR|欧元|歐元|€)/i.test(text)) return 'EUR'
  if (/(?:GBP|英镑|英鎊|£)/i.test(text)) return 'GBP'
  if (/(?:JPY|日元|円)/i.test(text)) return 'JPY'
  if (/\$/.test(text)) return 'USD'
  return ''
}

function detectDate(text: string) {
  const date = text.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/)
    ?? text.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/)
    ?? text.match(/(20\d{2}年\d{1,2}月\d{1,2}日)/)
  return date?.[0] ?? ''
}

function detectDocumentNumber(lines: string[]) {
  const pattern = /(?:invoice|receipt|order|发票|發票|票据|票據|单据|單據|订单|訂單)\s*(?:no\.?|number|#|号码|號碼|编号|編號)?\s*[:：#]?\s*([A-Z0-9][A-Z0-9-]{2,})/i
  for (const line of lines) {
    const match = line.match(pattern)
    if (match) return match[1]
  }
  return ''
}

function detectMerchant(lines: string[]) {
  const ignored = /^(?:receipt|invoice|tax invoice|发票|發票|收据|收據|购物小票|購物小票)$/i
  return lines.find((line) => {
    if (ignored.test(line)) return false
    if (/^(?:date|time|日期|时间|時間|invoice|receipt|order|发票|發票|票据|票據|单据|單據)/i.test(line)) return false
    const letters = line.match(/[\p{L}]/gu)?.length ?? 0
    return letters >= 2 && letters >= line.length * 0.35
  }) ?? ''
}

export function extractReceiptFields(text: string): ReceiptFields {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const subtotal = amountByLabel(lines, /(?:subtotal|sub-total|小计|小計)/i)
  const tax = amountByLabel(lines, /(?:^|\s)(?:tax|vat|gst)(?:\s|:|：)|税额|稅額|税金|稅金/i)
  let total = amountByLabel(
    lines,
    /(?:grand\s*total|amount\s*due|balance\s*due|total|合计|合計|总计|總計|应付|應付|实付|實付)/i,
    /(?:subtotal|sub-total|小计|小計|tax|vat|gst|税额|稅額)/i,
  )
  if (!total) {
    const allAmounts = lines.flatMap((line) => {
      const amount = lastAmount(line)
      return amount ? [amount] : []
    })
    total = allAmounts.at(-1) ?? ''
  }

  return {
    merchant: detectMerchant(lines),
    date: detectDate(text),
    documentNumber: detectDocumentNumber(lines),
    subtotal,
    tax,
    total,
    currency: detectCurrency(text),
  }
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export function receiptFieldsToCsv(fields: ReceiptFields) {
  const labels = ['merchant', 'date', 'documentNumber', 'subtotal', 'tax', 'total', 'currency'] as const
  return `${labels.map(csvCell).join(',')}\r\n${labels.map((label) => csvCell(fields[label])).join(',')}\r\n`
}
