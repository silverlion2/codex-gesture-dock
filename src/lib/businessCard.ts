export interface BusinessCardFields {
  name: string
  organization: string
  title: string
  phone: string
  email: string
  website: string
  address: string
  notes: string
}

const companyPattern = /(?:有限公司|有限责任公司|公司|集团|工作室|事务所|大学|学院|医院|银行|\b(?:inc\.?|ltd\.?|llc|corp\.?|corporation|company|studio|university|college|hospital|bank)\b)/i
const titlePattern = /(?:董事|总监|经理|主管|工程师|设计师|顾问|创始人|合伙人|教授|博士|主任|专员|助理|CEO|CTO|CFO|COO|VP|President|Director|Manager|Engineer|Designer|Consultant|Founder|Partner)/i
const addressPattern = /(?:地址|中国|省|市|区|县|路|街|大道|号|室|楼|邮编|Address|Road|Street|Avenue|Lane|Building|Floor|Suite)/i

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function firstMatch(lines: string[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line)) ?? ''
}

export function parseBusinessCard(text: string): BusinessCardFields {
  const lines = unique(text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()))
  const emails = unique(text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) ?? [])
  const websites = unique(
    (text.match(/(?:https?:\/\/|www\.)[^\s,，;；]+/gi) ?? []).map((url) =>
      url.replace(/[.)。]+$/, ''),
    ),
  )
  const phones = unique(
    (text.match(/(?:\+?\d[\d\s().-]{5,}\d)/g) ?? []).filter(
      (phone) => phone.replace(/\D/g, '').length >= 7,
    ),
  )

  const organization = firstMatch(lines, companyPattern)
  const title = firstMatch(lines, titlePattern)
  const address = firstMatch(lines, addressPattern)
  const claimed = new Set([organization, title, address].filter(Boolean))

  const name = lines.find((line) => {
    if (claimed.has(line) || line.includes('@') || /\d{5,}/.test(line)) return false
    if (companyPattern.test(line) || titlePattern.test(line) || addressPattern.test(line)) return false
    const compact = line.replace(/\s/g, '')
    if (/^[\p{Script=Han}·]{2,8}$/u.test(compact)) return true
    return /^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}$/.test(line)
  }) ?? ''
  if (name) claimed.add(name)

  const notes = lines
    .filter((line) => {
      if (claimed.has(line)) return false
      if (emails.some((value) => line.includes(value))) return false
      if (websites.some((value) => line.includes(value))) return false
      return !phones.some((value) => line.includes(value))
    })
    .join(' · ')

  return {
    name,
    organization,
    title,
    phone: phones.join(', '),
    email: emails.join(', '),
    website: websites.join(', '),
    address,
    notes,
  }
}

function escapeVCard(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
}

export function buildVCard(fields: BusinessCardFields) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCard(fields.name || fields.organization || '未命名联系人')}`,
    `N:${escapeVCard(fields.name)};;;;`,
  ]

  if (fields.organization) lines.push(`ORG:${escapeVCard(fields.organization)}`)
  if (fields.title) lines.push(`TITLE:${escapeVCard(fields.title)}`)
  for (const phone of fields.phone.split(',').map((value) => value.trim()).filter(Boolean)) {
    lines.push(`TEL;TYPE=WORK,VOICE:${escapeVCard(phone)}`)
  }
  for (const email of fields.email.split(',').map((value) => value.trim()).filter(Boolean)) {
    lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeVCard(email)}`)
  }
  for (const website of fields.website.split(',').map((value) => value.trim()).filter(Boolean)) {
    lines.push(`URL:${escapeVCard(website)}`)
  }
  if (fields.address) lines.push(`ADR;TYPE=WORK:;;${escapeVCard(fields.address)};;;;`)
  if (fields.notes) lines.push(`NOTE:${escapeVCard(fields.notes)}`)
  lines.push('END:VCARD')
  return `${lines.join('\r\n')}\r\n`
}

export function buildVCardBundle(cards: BusinessCardFields[]) {
  if (cards.length === 0) throw new Error('没有可导出的名片联系人')
  if (cards.length > 20) throw new Error('单次最多导出 20 个名片联系人')
  return cards.map(buildVCard).join('')
}

export function businessCardFilename(name: string) {
  const safeName = [...name.trim()]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .slice(0, 48)
  return `${safeName || 'contact'}.vcf`
}
