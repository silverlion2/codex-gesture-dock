import { Check, Copy, Download, QrCode, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { buildQrPayload, createQrSvg, qrCodeFilename, type QrPayloadKind, type QrWifiSecurity } from '../lib/qrCodeCreator'

interface QrCodeCreatorPanelProps {
  onMessage: (message: string) => void
}

interface QrPreview {
  payload: string
  svg: string
  url: string
}

const labels: Record<QrPayloadKind, string> = {
  text: '文字',
  url: '网址',
  wifi: 'Wi-Fi',
  contact: '联系人',
}

function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('无法把二维码转换为 PNG')), { once: true })
    image.src = url
  })
}

export function QrCodeCreatorPanel({ onMessage }: QrCodeCreatorPanelProps) {
  const [kind, setKind] = useState<QrPayloadKind>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('https://')
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [security, setSecurity] = useState<QrWifiSecurity>('WPA')
  const [hidden, setHidden] = useState(false)
  const [name, setName] = useState('')
  const [organization, setOrganization] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [contactUrl, setContactUrl] = useState('')
  const [size, setSize] = useState(512)
  const [preview, setPreview] = useState<QrPreview | null>(null)
  const [phase, setPhase] = useState<'editing' | 'generating' | 'ready' | 'error'>('editing')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const requestRef = useRef(0)

  const clearPreview = () => {
    requestRef.current += 1
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    setPhase('editing')
    setError('')
    setCopied(false)
  }

  useEffect(() => () => {
    requestRef.current += 1
    if (preview) URL.revokeObjectURL(preview.url)
  }, [preview])

  const payloadInput = () => ({
    kind,
    text,
    url,
    wifi: { ssid, password, security, hidden },
    contact: { name, organization, phone, email, url: contactUrl },
  })

  const generate = async () => {
    const request = ++requestRef.current
    setPhase('generating')
    setError('')
    try {
      const payload = buildQrPayload(payloadInput())
      const svg = await createQrSvg(payload, size)
      if (request !== requestRef.current) return
      const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current.url)
        return { payload, svg, url: objectUrl }
      })
      setPhase('ready')
      onMessage(`已在本机生成 ${labels[kind]}二维码，请用另一台设备试扫后导出`)
    } catch (caught) {
      if (request !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : '二维码生成失败')
      setPhase('error')
    }
  }

  const exportPng = async () => {
    if (!preview) return
    try {
      const image = await loadImage(preview.url)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('无法创建二维码 PNG 画布')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, size, size)
      context.imageSmoothingEnabled = false
      context.drawImage(image, 0, 0, size, size)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('二维码 PNG 编码失败')), 'image/png'))
      const pngUrl = URL.createObjectURL(blob)
      downloadUrl(pngUrl, qrCodeFilename(kind, 'png'))
      setTimeout(() => URL.revokeObjectURL(pngUrl), 1_000)
      onMessage('已请求下载二维码 PNG')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '二维码 PNG 导出失败')
      setPhase('error')
    }
  }

  const copyPayload = async () => {
    if (!preview) return
    await navigator.clipboard.writeText(preview.payload)
    setCopied(true)
    onMessage('已复制二维码原始内容；应用不会自动打开其中的网址')
  }

  const fieldChanged = <T,>(setter: (value: T) => void, value: T) => {
    setter(value)
    if (preview || phase === 'error') clearPreview()
  }

  return (
    <div className="qr-code-creator">
      <div className="qr-code-kind-tabs" role="group" aria-label="二维码内容类型">
        {(Object.keys(labels) as QrPayloadKind[]).map((value) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => fieldChanged(setKind, value)}>{labels[value]}</button>)}
      </div>
      <div className="qr-code-creator-grid">
        <div className="qr-code-preview">
          {preview ? <img src={preview.url} alt={`生成的${labels[kind]}二维码`} /> : <div><QrCode size={38} aria-hidden="true" /><strong>待生成二维码</strong><small>内容与图像均留在本机</small></div>}
        </div>
        <div className="qr-code-fields">
          {kind === 'text' && <label><span>文字内容</span><textarea aria-label="二维码文字内容" maxLength={2000} rows={5} value={text} onChange={(event) => fieldChanged(setText, event.target.value)} /></label>}
          {kind === 'url' && <label><span>完整网址</span><input aria-label="二维码网址" type="url" maxLength={2000} value={url} onChange={(event) => fieldChanged(setUrl, event.target.value)} /></label>}
          {kind === 'wifi' && <>
            <label><span>Wi-Fi 名称</span><input aria-label="Wi-Fi 名称" maxLength={128} value={ssid} onChange={(event) => fieldChanged(setSsid, event.target.value)} /></label>
            <label><span>安全类型</span><select aria-label="Wi-Fi 安全类型" value={security} onChange={(event) => fieldChanged(setSecurity, event.target.value as QrWifiSecurity)}><option value="WPA">WPA/WPA2/WPA3</option><option value="WEP">WEP</option><option value="nopass">无密码</option></select></label>
            {security !== 'nopass' && <label><span>Wi-Fi 密码</span><input aria-label="Wi-Fi 密码" type="password" maxLength={128} value={password} onChange={(event) => fieldChanged(setPassword, event.target.value)} /></label>}
            <label className="qr-code-check"><input type="checkbox" checked={hidden} onChange={(event) => fieldChanged(setHidden, event.target.checked)} />隐藏网络</label>
          </>}
          {kind === 'contact' && <>
            <label><span>姓名</span><input aria-label="联系人姓名" maxLength={160} value={name} onChange={(event) => fieldChanged(setName, event.target.value)} /></label>
            <label><span>组织</span><input aria-label="联系人组织" maxLength={160} value={organization} onChange={(event) => fieldChanged(setOrganization, event.target.value)} /></label>
            <label><span>电话</span><input aria-label="联系人电话" maxLength={64} value={phone} onChange={(event) => fieldChanged(setPhone, event.target.value)} /></label>
            <label><span>邮箱</span><input aria-label="联系人邮箱" type="email" maxLength={160} value={email} onChange={(event) => fieldChanged(setEmail, event.target.value)} /></label>
            <label><span>网址</span><input aria-label="联系人网址" type="url" maxLength={2000} value={contactUrl} onChange={(event) => fieldChanged(setContactUrl, event.target.value)} /></label>
          </>}
          <label><span>输出尺寸</span><select aria-label="二维码输出尺寸" value={size} onChange={(event) => fieldChanged(setSize, Number(event.target.value))}><option value={256}>256 × 256px</option><option value={512}>512 × 512px</option><option value={1024}>1024 × 1024px</option></select></label>
          {phase === 'generating' && <div className="qr-code-status" role="status"><span className="small-spinner" aria-hidden="true" />正在本机生成二维码</div>}
          {phase === 'error' && <div className="document-scan-error" role="alert"><strong>{error}</strong><small>请检查内容长度和格式后重试</small></div>}
          <div className="qr-code-actions">
            <button type="button" disabled={phase === 'generating'} onClick={() => void generate()}><QrCode size={13} aria-hidden="true" />{preview ? '重新生成' : '生成二维码'}</button>
            {preview && <button type="button" onClick={() => downloadUrl(preview.url, qrCodeFilename(kind, 'svg'))}><Download size={13} aria-hidden="true" />导出 SVG</button>}
            {preview && <button type="button" onClick={() => void exportPng()}><Download size={13} aria-hidden="true" />导出 PNG</button>}
            {preview && <button type="button" onClick={() => void copyPayload()}>{copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{copied ? '已复制内容' : '复制原始内容'}</button>}
            {preview && <button type="button" onClick={clearPreview}><RotateCcw size={13} aria-hidden="true" />返回编辑</button>}
          </div>
          <small>二维码不会上传或自动打开网址。Wi-Fi 和联系人兼容性取决于扫码设备；导出前请用另一台设备试扫并核对内容。</small>
        </div>
      </div>
    </div>
  )
}
