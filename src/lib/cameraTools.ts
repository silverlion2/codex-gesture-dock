export type CameraMode = 'monitor' | 'codes' | 'document'

export interface CapturedDocument {
  dataUrl: string
  filename: string
}
function documentFilename(now: Date) {
  const timestamp = now.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
  return `codex-scan-${timestamp}.png`
}

export function captureVideoFrame(
  video: HTMLVideoElement,
  mirrored: boolean,
  now = new Date(),
): CapturedDocument {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('摄像头画面尚未就绪')
  }

  const width = video.videoWidth
  const height = video.videoHeight
  if (width <= 0 || height <= 0) throw new Error('无法读取摄像头画面尺寸')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前设备无法创建扫描图像')

  if (mirrored) {
    context.translate(width, 0)
    context.scale(-1, 1)
  }
  context.drawImage(video, 0, 0, width, height)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    filename: documentFilename(now),
  }
}

export function downloadCapturedDocument(capture: CapturedDocument) {
  const link = document.createElement('a')
  link.download = capture.filename
  link.href = capture.dataUrl
  link.click()
}
