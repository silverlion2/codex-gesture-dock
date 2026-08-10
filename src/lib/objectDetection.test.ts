// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  buildObjectDetectionJson,
  importObjectDetectionModel,
  loadObjectDetectionLabels,
  normalizeDetectedObject,
  objectAnnotatedFilename,
  objectLabel,
  OBJECT_LABELS_MAX_FILE_BYTES,
  OBJECT_MODEL_MAX_FILE_BYTES,
} from './objectDetection'

const object = {
  id: 'object-1',
  category: 'cell phone',
  label: '手机',
  confidence: 0.93456,
  x: 0.2,
  y: 0.3,
  width: 0.25,
  height: 0.35,
  enabled: true,
}

describe('object detection review data', () => {
  it('translates known COCO labels and preserves unknown labels', () => {
    expect(objectLabel('cell phone')).toBe('手机')
    expect(objectLabel('custom-widget')).toBe('custom-widget')
  })

  it('bounds boxes, rejects tiny boxes, and builds safe filenames', () => {
    const bounded = normalizeDetectedObject({ ...object, x: -0.1, y: 0.9, height: 0.4 })
    expect(bounded).toMatchObject({ x: 0, y: 0.9 })
    expect(bounded?.height).toBeCloseTo(0.1)
    expect(normalizeDetectedObject({ ...object, width: 0.001 })).toBeNull()
    expect(objectAnnotatedFilename('desk:photo?.jpeg')).toBe('desk-photo--objects.png')
  })

  it('exports only enabled review selections with stable normalized geometry', () => {
    const payload = JSON.parse(buildObjectDetectionJson([object, { ...object, id: 'object-2', enabled: false }]))
    expect(payload).toEqual([{
      label: '手机',
      category: 'cell phone',
      confidence: 0.9346,
      box: { x: 0.2, y: 0.3, width: 0.25, height: 0.35 },
    }])
  })

  it('accepts bounded TFLite buffers and rejects malformed or oversized custom models', async () => {
    const validBytes = new Uint8Array([0, 0, 0, 0, 0x54, 0x46, 0x4c, 0x33, 1, 2, 3])
    const model = await importObjectDetectionModel({
      name: 'factory-detector.tflite',
      size: validBytes.byteLength,
      arrayBuffer: async () => validBytes.buffer,
    } as File)
    expect(model).toMatchObject({ kind: 'custom', name: 'factory-detector.tflite', size: 11 })
    expect(model.bytes).toEqual(validBytes)

    await expect(importObjectDetectionModel({
      name: 'detector.onnx', size: validBytes.byteLength, arrayBuffer: async () => validBytes.buffer,
    } as File)).rejects.toThrow('.tflite')
    await expect(importObjectDetectionModel({
      name: 'detector.tflite', size: 8, arrayBuffer: async () => new Uint8Array(8).buffer,
    } as File)).rejects.toThrow('TensorFlow Lite')
    await expect(importObjectDetectionModel({
      name: 'large.tflite', size: OBJECT_MODEL_MAX_FILE_BYTES + 1, arrayBuffer: async () => validBytes.buffer,
    } as File)).rejects.toThrow('100 MB')
  })

  it('loads an indexed UTF-8 label map without shifting blank rows', async () => {
    const labelBytes = new TextEncoder().encode('\uFEFFwidget\n\nquality-control\n')
    const labels = await loadObjectDetectionLabels({
      name: 'labels.txt',
      size: labelBytes.byteLength,
      arrayBuffer: async () => labelBytes.buffer,
    } as File)
    expect(labels).toEqual(['widget', '类别 1', 'quality-control'])
    await expect(loadObjectDetectionLabels({
      name: 'labels.csv', size: 4, arrayBuffer: async () => new ArrayBuffer(4),
    } as File)).rejects.toThrow('TXT')
    await expect(loadObjectDetectionLabels({
      name: 'labels.txt', size: OBJECT_LABELS_MAX_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0),
    } as File)).rejects.toThrow('256 KB')
  })
})
