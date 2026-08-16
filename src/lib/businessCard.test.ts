import { describe, expect, it } from 'vitest'
import { buildVCard, buildVCardBundle, businessCardFilename, parseBusinessCard } from './businessCard'

describe('business-card parsing', () => {
  it('extracts common Chinese and English contact fields', () => {
    const card = parseBusinessCard(`
王小明
产品总监
星河科技有限公司
+86 138 0013 8000
xiaoming.wang@example.com
https://example.com
上海市浦东新区世纪大道 100 号
`)

    expect(card).toMatchObject({
      name: '王小明',
      title: '产品总监',
      organization: '星河科技有限公司',
      phone: '+86 138 0013 8000',
      email: 'xiaoming.wang@example.com',
      website: 'https://example.com',
      address: '上海市浦东新区世纪大道 100 号',
    })
  })

  it('creates an importable vCard after the user confirms fields', () => {
    const content = buildVCard({
      name: 'Alex Chen',
      organization: 'Northwind, Inc.',
      title: 'Engineer',
      phone: '+1 555 0100',
      email: 'alex@example.com',
      website: 'https://example.com',
      address: '1 Main Street',
      notes: 'Met at demo day',
    })

    expect(content).toContain('BEGIN:VCARD\r\nVERSION:3.0')
    expect(content).toContain('FN:Alex Chen')
    expect(content).toContain('ORG:Northwind\\, Inc.')
    expect(content).toContain('EMAIL;TYPE=INTERNET,WORK:alex@example.com')
    expect(content).toMatch(/END:VCARD\r\n$/)
  })

  it('sanitizes contact filenames', () => {
    expect(businessCardFilename('Alex:Chen/Lead')).toBe('Alex-Chen-Lead.vcf')
  })

  it('builds a bounded multi-contact VCF bundle', () => {
    const first = parseBusinessCard('Alex Chen\nEngineer\nNorthwind Inc.\nalex@example.com')
    const second = parseBusinessCard('王小明\n星河科技有限公司\n13800138000')
    const bundle = buildVCardBundle([first, second])

    expect(bundle.match(/BEGIN:VCARD/g)).toHaveLength(2)
    expect(bundle.match(/END:VCARD\r\n/g)).toHaveLength(2)
    expect(bundle).toContain('FN:Alex Chen')
    expect(bundle).toContain('FN:王小明')
    expect(() => buildVCardBundle([])).toThrow('没有可导出')
    expect(() => buildVCardBundle(Array.from({ length: 21 }, () => first))).toThrow('最多导出 20')
  })
})
