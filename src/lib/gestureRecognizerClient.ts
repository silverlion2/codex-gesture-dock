export interface GestureRecognizerClientOptions {
  modelAssetPath: string
  wasmRoot: string
}

export interface GestureRecognitionResult {
  gestures: Array<Array<{ categoryName?: string; score?: number }>>
  landmarks: unknown[][]
}

type WorkerLike = Worker

const INIT_TIMEOUT_MS = 15_000
const FRAME_TIMEOUT_MS = 3_000

export function createGestureRecognizerClient(
  options: GestureRecognizerClientOptions,
  workerFactory: () => WorkerLike = () =>
    new Worker(new URL('../workers/gestureRecognizer.worker.ts', import.meta.url), {
      type: 'module',
    }),
) {
  const worker = workerFactory()
  let nextId = 0
  let closed = false
  let inFlight = false
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void; timer: ReturnType<typeof globalThis.setTimeout> }>()

  const fail = (error: unknown) => {
    for (const item of pending.values()) {
      globalThis.clearTimeout(item.timer)
      item.reject(error)
    }
    pending.clear()
    inFlight = false
  }
  const shutdown = (error: unknown) => {
    if (closed) return
    closed = true
    fail(error)
    worker.terminate()
  }

  worker.onmessage = (event) => {
    const message = event.data
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    globalThis.clearTimeout(item.timer)
    if (message.type === 'ERROR') item.reject(new Error(message.error || '手势识别失败'))
    else item.resolve(message.result)
    inFlight = false
  }
  worker.onerror = (event) => {
    shutdown(new Error(event.message || '手势识别工作线程崩溃'))
  }

  const request = <T>(type: string, payload: Record<string, unknown>, timeout: number, transfer: Transferable[] = []) => {
    if (closed) return Promise.reject(new Error('手势识别已关闭'))
    const id = ++nextId
    return new Promise<T>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        shutdown(new Error(type === 'INIT' ? '手势识别模型启动超时' : '手势识别超时'))
      }, timeout)
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      try {
        worker.postMessage({ id, type, ...payload }, transfer)
      } catch (error) {
        pending.delete(id)
        globalThis.clearTimeout(timer)
        if (type === 'DETECT') inFlight = false
        if (type === 'DETECT') (payload.bitmap as ImageBitmap).close()
        reject(error)
      }
    })
  }

  return {
    initialize: () => request<void>('INIT', options as unknown as Record<string, unknown>, INIT_TIMEOUT_MS),
    detect: (bitmap: ImageBitmap, timestampMs: number) => {
      if (closed) {
        bitmap.close()
        return Promise.reject(new Error('手势识别已关闭'))
      }
      if (inFlight) {
        bitmap.close()
        return Promise.reject(new Error('手势识别忙碌'))
      }
      inFlight = true
      return request<GestureRecognitionResult>('DETECT', { bitmap, timestampMs }, FRAME_TIMEOUT_MS, [bitmap])
    },
    close: () => shutdown(new Error('手势识别已关闭')),
  }
}
