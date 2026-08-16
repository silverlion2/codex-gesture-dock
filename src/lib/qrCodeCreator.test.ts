// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { buildQrPayload, createQrSvg, qrCodeFilename } from './qrCodeCreator'

describe('QR code payload creation', () => {
  it('creates bounded text and canonical HTTP payloads', () => {
    expect(buildQrPayload({ kind: 'text', text: '  local note  ' })).toBe('local note')
    expect(buildQrPayload({ kind: 'url', url: 'https://example.com/path?q=1' })).toBe('https://example.com/path?q=1')
    expect(() => buildQrPayload({ kind: 'url', url: 'javascript:alert(1)' })).toThrow('只支持 http:// 或 https://')
    expect(() => buildQrPayload({ kind: 'text', text: '中'.repeat(834) })).toThrow('2500 字节')
  })

  it('escapes Wi-Fi delimiters and omits passwords for open networks', () => {
    expect(buildQrPayload({
      kind: 'wifi',
      wifi: { ssid: 'Office;5G', password: 'p:a\\ss', security: 'WPA', hidden: true },
    })).toBe('WIFI:T:WPA;S:Office\\;5G;P:p\\:a\\\\ss;H:true;;')
    expect(buildQrPayload({
      kind: 'wifi',
      wifi: { ssid: 'Guest', password: 'ignored', security: 'nopass', hidden: false },
    })).toBe('WIFI:T:nopass;S:Guest;H:false;;')
    expect(() => buildQrPayload({
      kind: 'wifi',
      wifi: { ssid: 'Secure', password: '', security: 'WPA', hidden: false },
    })).toThrow('必须填写密码')
  })

  it('creates a CRLF vCard while neutralizing field line breaks and delimiters', () => {
    const payload = buildQrPayload({
      kind: 'contact',
      contact: {
        name: 'Lin; Mei\r\nTITLE:Injected',
        organization: 'A,B',
        phone: '+86 123',
        email: 'mei@example.com',
        url: 'https://example.com',
      },
    })
    expect(payload).toContain('FN:Lin\\; Mei TITLE:Injected\r\n')
    expect(payload).toContain('ORG:A\\,B\r\n')
    expect(payload).toContain('URL:https://example.com/\r\nEND:VCARD')
    expect(payload.match(/\r\nTITLE:/)).toBeNull()
  })

  it('uses stable export names and rejects unsafe output sizes before loading the writer', async () => {
    expect(qrCodeFilename('wifi', 'svg')).toBe('qr-wifi.svg')
    await expect(createQrSvg('hello', 128)).rejects.toThrow('256–1024px')
  })

  it('uses the installed ZXing writer to create an accessible SVG', async () => {
    const svg = await createQrSvg('offline QR smoke test', 256)
    expect(svg).toContain('<svg')
    expect(svg).toContain('width="256"')
    expect(svg).toContain('height="256"')
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="生成的二维码"')
  }, 30_000)
})
