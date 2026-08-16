export type QrPayloadKind = 'text' | 'url' | 'wifi' | 'contact'
export type QrWifiSecurity = 'WPA' | 'WEP' | 'nopass'

export interface QrPayloadInput {
  kind: QrPayloadKind
  text?: string
  url?: string
  wifi?: {
    ssid: string
    password: string
    security: QrWifiSecurity
    hidden: boolean
  }
  contact?: {
    name: string
    organization: string
    phone: string
    email: string
    url: string
  }
}

export const QR_PAYLOAD_MAX_BYTES = 2_500

function cleanLine(value: string, maxLength: number) {
  return [...value.replace(/[\r\n]+/g, ' ').trim()].slice(0, maxLength).join('')
}

function validHttpUrl(value: string, label: string) {
  const source = cleanLine(value, 2_000)
  if (!source) throw new Error(`${label}不能为空`)
  let parsed: URL
  try {
    parsed = new URL(source)
  } catch {
    throw new Error(`${label}必须是完整的 http:// 或 https:// 地址`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error(`${label}只支持 http:// 或 https:// 地址`)
  return parsed.toString()
}

function escapeWifi(value: string) {
  return cleanLine(value, 128).replace(/([\\;,:"])/g, '\\$1')
}

function escapeVcard(value: string, maxLength = 160) {
  return cleanLine(value, maxLength)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function assertPayloadSize(payload: string) {
  const bytes = new TextEncoder().encode(payload).byteLength
  if (bytes > QR_PAYLOAD_MAX_BYTES) throw new Error(`二维码内容不能超过 ${QR_PAYLOAD_MAX_BYTES} 字节`)
  return payload
}

export function buildQrPayload(input: QrPayloadInput) {
  if (input.kind === 'text') {
    const text = input.text?.trim() ?? ''
    if (!text) throw new Error('请输入要写入二维码的文字')
    return assertPayloadSize(text)
  }
  if (input.kind === 'url') return assertPayloadSize(validHttpUrl(input.url ?? '', '网址'))
  if (input.kind === 'wifi') {
    const wifi = input.wifi
    if (!wifi) throw new Error('Wi-Fi 设置不完整')
    const ssid = escapeWifi(wifi.ssid)
    if (!ssid) throw new Error('Wi-Fi 名称不能为空')
    const security: QrWifiSecurity = ['WPA', 'WEP', 'nopass'].includes(wifi.security) ? wifi.security : 'WPA'
    const password = escapeWifi(wifi.password)
    if (security !== 'nopass' && !password) throw new Error('加密 Wi-Fi 必须填写密码')
    return assertPayloadSize(`WIFI:T:${security};S:${ssid};${security === 'nopass' ? '' : `P:${password};`}H:${wifi.hidden ? 'true' : 'false'};;`)
  }

  const contact = input.contact
  if (!contact) throw new Error('联系人设置不完整')
  const name = escapeVcard(contact.name)
  if (!name) throw new Error('联系人姓名不能为空')
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, `N:${name};;;;`]
  const organization = escapeVcard(contact.organization)
  const phone = escapeVcard(contact.phone, 64)
  const email = escapeVcard(contact.email, 160)
  if (organization) lines.push(`ORG:${organization}`)
  if (phone) lines.push(`TEL;TYPE=CELL:${phone}`)
  if (email) lines.push(`EMAIL:${email}`)
  if (contact.url.trim()) lines.push(`URL:${validHttpUrl(contact.url, '联系人网址')}`)
  lines.push('END:VCARD')
  return assertPayloadSize(lines.join('\r\n'))
}

export function qrCodeFilename(kind: QrPayloadKind, extension: 'svg' | 'png') {
  return `qr-${kind}.${extension}`
}

export async function createQrSvg(payload: string, size: number) {
  if (!Number.isInteger(size) || size < 256 || size > 1_024) throw new Error('二维码尺寸必须在 256–1024px 之间')
  assertPayloadSize(payload)
  const { BrowserQRCodeSvgWriter } = await import('@zxing/browser')
  const svg = new BrowserQRCodeSvgWriter().write(payload, size, size)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', '生成的二维码')
  return new XMLSerializer().serializeToString(svg)
}
