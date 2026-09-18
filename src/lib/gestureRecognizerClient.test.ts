import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGestureRecognizerClient } from './gestureRecognizerClient'

function fakeWorker() {
  return {
    onmessage: () => {},
    onerror: () => {},
    postMessage: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker
}

function emit(worker: Worker, data: unknown) {
  ;(worker as unknown as { onmessage: (event: { data: unknown }) => void }).onmessage({ data })
}

afterEach(() => vi.useRealTimers())

describe('gesture recognizer worker client', () => {
  it('enforces single-flight detection and transfers the bitmap', async () => {
    const worker = fakeWorker()
    const client = createGestureRecognizerClient({ modelAssetPath: 'model', wasmRoot: 'wasm' }, () => worker)
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap
    const first = client.detect(bitmap, 1)
    await expect(client.detect({ close: vi.fn() } as unknown as ImageBitmap, 2)).rejects.toThrow('忙碌')
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DETECT', timestampMs: 1, bitmap }),
      [bitmap],
    )
    emit(worker, { id: 1, type: 'DETECT_RESULT', result: { gestures: [], landmarks: [] } })
    await expect(first).resolves.toEqual({ gestures: [], landmarks: [] })
  })

  it('rejects pending requests on crash and closes the worker', async () => {
    const worker = fakeWorker()
    const client = createGestureRecognizerClient({ modelAssetPath: 'model', wasmRoot: 'wasm' }, () => worker)
    const pending = client.initialize()
    ;(worker as unknown as { onerror: (event: { message: string }) => void }).onerror({ message: 'worker crashed' })
    await expect(pending).rejects.toThrow('worker crashed')
    client.close()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('times out initialization', async () => {
    vi.useFakeTimers()
    const worker = fakeWorker()
    const client = createGestureRecognizerClient({ modelAssetPath: 'model', wasmRoot: 'wasm' }, () => worker)
    const pending = client.initialize()
    const rejection = expect(pending).rejects.toThrow('启动超时')
    await vi.advanceTimersByTimeAsync(15_001)
    await rejection
    client.close()
  })

  it('rejects and releases a bitmap when worker postMessage throws', async () => {
    const worker = fakeWorker()
    ;(worker.postMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('clone failed')
    })
    const client = createGestureRecognizerClient({ modelAssetPath: 'model', wasmRoot: 'wasm' }, () => worker)
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap
    await expect(client.detect(bitmap, 1)).rejects.toThrow('clone failed')
    expect(bitmap.close).toHaveBeenCalledTimes(1)
    client.close()
  })

  it('rejects a late initialization response after close', async () => {
    const worker = fakeWorker()
    const client = createGestureRecognizerClient({ modelAssetPath: 'model', wasmRoot: 'wasm' }, () => worker)
    const pending = client.initialize()
    client.close()
    await expect(pending).rejects.toThrow('已关闭')
    emit(worker, { id: 1, type: 'INIT_DONE' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
