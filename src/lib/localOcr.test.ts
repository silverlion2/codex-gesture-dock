// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalOcrSession, withLocalOcrSession } from './localOcr'

const tesseractMocks = vi.hoisted(() => ({
  createWorker: vi.fn(),
}))

vi.mock('tesseract.js', () => ({
  createWorker: tesseractMocks.createWorker,
  OEM: { LSTM_ONLY: 1 },
}))

function imageFile(name: string) {
  return new File(['image'], name, { type: 'image/png' })
}

function recognition(text: string) {
  return { data: { text, blocks: null } }
}

function workerWith(...texts: string[]) {
  return {
    recognize: vi.fn()
      .mockImplementationOnce(async () => recognition(texts[0] ?? ''))
      .mockImplementationOnce(async () => recognition(texts[1] ?? texts[0] ?? '')),
    terminate: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  tesseractMocks.createWorker.mockReset()
})

describe('local OCR sessions', () => {
  it('loads one fixed-language worker for sequential files and terminates it explicitly', async () => {
    const worker = workerWith('first text', 'second text')
    tesseractMocks.createWorker.mockResolvedValue(worker)
    const session = createLocalOcrSession('eng+chi_sim')

    const first = await session.recognizeFile(imageFile('first.png'), vi.fn())
    const second = await session.recognizeFile(imageFile('second.png'), vi.fn())

    expect(first.text).toBe('first text')
    expect(second.text).toBe('second text')
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(1)
    expect(tesseractMocks.createWorker).toHaveBeenCalledWith(
      ['eng', 'chi_sim'],
      1,
      expect.objectContaining({
        workerPath: expect.stringContaining('ocr/worker.min.js'),
        langPath: expect.stringContaining('ocr/lang'),
      }),
    )
    expect(worker.terminate).not.toHaveBeenCalled()

    await session.terminate()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('keeps a healthy worker after a no-text result', async () => {
    const worker = workerWith('   ', 'recovered text')
    tesseractMocks.createWorker.mockResolvedValue(worker)
    const session = createLocalOcrSession('eng')

    await expect(session.recognizeFile(imageFile('blank.png'), vi.fn())).rejects.toThrow('未识别到文字')
    await expect(session.recognizeFile(imageFile('text.png'), vi.fn())).resolves.toMatchObject({
      text: 'recovered text',
      source: 'ocr',
    })
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(1)

    await session.terminate()
  })

  it('discards a failed worker and recreates it for the next serial item', async () => {
    const failedWorker = {
      recognize: vi.fn().mockRejectedValue(new Error('worker crashed')),
      terminate: vi.fn().mockResolvedValue(undefined),
    }
    const recoveredWorker = workerWith('recovered text')
    tesseractMocks.createWorker
      .mockResolvedValueOnce(failedWorker)
      .mockResolvedValueOnce(recoveredWorker)
    const session = createLocalOcrSession('eng')

    await expect(session.recognizeFile(imageFile('first.png'), vi.fn())).rejects.toThrow('worker crashed')
    await expect(session.recognizeFile(imageFile('second.png'), vi.fn())).resolves.toMatchObject({ text: 'recovered text' })
    expect(tesseractMocks.createWorker).toHaveBeenCalledTimes(2)
    expect(failedWorker.terminate).toHaveBeenCalledTimes(1)

    await session.terminate()
    expect(recoveredWorker.terminate).toHaveBeenCalledTimes(1)
  })

  it('terminates an aborted worker and allows a later item to start cleanly', async () => {
    let rejectRecognition: ((reason: Error) => void) | undefined
    const activeWorker = {
      recognize: vi.fn(() => new Promise((_resolve, reject) => { rejectRecognition = reject })),
      terminate: vi.fn(async () => { rejectRecognition?.(new Error('terminated')) }),
    }
    const recoveredWorker = workerWith('after abort')
    tesseractMocks.createWorker
      .mockResolvedValueOnce(activeWorker)
      .mockResolvedValueOnce(recoveredWorker)
    const session = createLocalOcrSession('eng')
    const controller = new AbortController()

    const pending = session.recognizeFile(imageFile('first.png'), vi.fn(), controller.signal)
    await vi.waitFor(() => expect(activeWorker.recognize).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(activeWorker.terminate).toHaveBeenCalledTimes(1)
    await expect(session.recognizeFile(imageFile('second.png'), vi.fn())).resolves.toMatchObject({ text: 'after abort' })

    await session.terminate()
  })

  it('always closes the session wrapper when batch work throws', async () => {
    const worker = workerWith('unused')
    tesseractMocks.createWorker.mockResolvedValue(worker)

    await expect(withLocalOcrSession('eng', async (recognize) => {
      await recognize(imageFile('first.png'), vi.fn())
      throw new Error('batch failed')
    })).rejects.toThrow('batch failed')

    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
