import { describe, expect, it } from 'vitest'
import { extractReceiptFields, receiptFieldsToCsv } from './receiptFields'

describe('receipt and invoice field extraction', () => {
  it('extracts common English invoice fields without a network model', () => {
    expect(extractReceiptFields([
      'Northwind Cafe',
      'Invoice # QA-2026-0808',
      'Date: 2026-08-08 14:30',
      'Subtotal $ 128.00',
      'Tax $ 12.80',
      'Grand Total $ 140.80',
    ].join('\n'))).toEqual({
      merchant: 'Northwind Cafe',
      date: '2026-08-08 14:30',
      documentNumber: 'QA-2026-0808',
      subtotal: '128.00',
      tax: '12.80',
      total: '140.80',
      currency: 'USD',
    })
  })

  it('extracts Chinese receipt labels and currency', () => {
    expect(extractReceiptFields([
      '上海示例商店',
      '发票号码：CN-889900',
      '2026年8月9日',
      '小计 ￥88.00',
      '税额 ￥5.00',
      '应付 ￥93.00',
    ].join('\n'))).toMatchObject({
      merchant: '上海示例商店',
      date: '2026年8月9日',
      documentNumber: 'CN-889900',
      subtotal: '88.00',
      tax: '5.00',
      total: '93.00',
      currency: 'CNY',
    })
  })

  it('creates a spreadsheet-safe one-row CSV', () => {
    const csv = receiptFieldsToCsv({
      merchant: 'Cafe "North"',
      date: '2026-08-09',
      documentNumber: 'R-10',
      subtotal: '10.00',
      tax: '1.00',
      total: '11.00',
      currency: 'USD',
    })
    expect(csv).toContain('"Cafe ""North"""')
    expect(csv.split('\r\n')).toHaveLength(3)
  })
})
