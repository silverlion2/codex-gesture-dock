import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision'

let recognizer: GestureRecognizer | null = null

self.onmessage = async (event: MessageEvent) => {
  const { id, type } = event.data
  try {
    if (type === 'INIT') {
      const vision = await FilesetResolver.forVisionTasks(event.data.wasmRoot, true)
      recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: event.data.modelAssetPath, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.58,
        minHandPresenceConfidence: 0.58,
        minTrackingConfidence: 0.55,
      })
      self.postMessage({ id, type: 'INIT_DONE' })
      return
    }
    if (type === 'DETECT') {
      const bitmap = event.data.bitmap as ImageBitmap
      if (!recognizer) {
        bitmap.close()
        throw new Error('手势识别模型尚未启动')
      }
      try {
        const result = recognizer.recognizeForVideo(bitmap, event.data.timestampMs)
        self.postMessage({ id, type: 'DETECT_RESULT', result })
      } finally {
        bitmap.close()
      }
    }
  } catch (error) {
    self.postMessage({ id, type: 'ERROR', error: error instanceof Error ? error.message : String(error) })
  }
}
