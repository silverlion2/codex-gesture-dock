// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { inspectImageMetadata, metadataFreeFilename, summarizeImageMetadata } from './imageMetadata'

function syntheticExifJpeg() {
  const tiff = new Uint8Array(237)
  const view = new DataView(tiff.buffer)
  const ascii = (offset: number, value: string) => {
    tiff.set(new TextEncoder().encode(value), offset)
  }
  const entry = (offset: number, tag: number, type: number, count: number, value: number) => {
    view.setUint16(offset, tag, true)
    view.setUint16(offset + 2, type, true)
    view.setUint32(offset + 4, count, true)
    view.setUint32(offset + 8, value, true)
  }
  const rational = (offset: number, numerator: number, denominator: number) => {
    view.setUint32(offset, numerator, true)
    view.setUint32(offset + 4, denominator, true)
  }

  ascii(0, 'II')
  view.setUint16(2, 42, true)
  view.setUint32(4, 8, true)

  view.setUint16(8, 4, true)
  entry(10, 0x010f, 2, 7, 62)
  entry(22, 0x0110, 2, 8, 69)
  entry(34, 0x8769, 4, 1, 77)
  entry(46, 0x8825, 4, 1, 135)
  ascii(62, 'Google\0')
  ascii(69, 'Pixel 9\0')

  view.setUint16(77, 2, true)
  entry(79, 0x9003, 2, 20, 107)
  entry(91, 0xa431, 2, 8, 127)
  ascii(107, '2026:07:08 14:05:06\0')
  ascii(127, 'CAM-123\0')

  view.setUint16(135, 4, true)
  entry(137, 0x0001, 2, 2, 0)
  tiff[145] = 'N'.charCodeAt(0)
  entry(149, 0x0002, 5, 3, 189)
  entry(161, 0x0003, 2, 2, 0)
  tiff[169] = 'E'.charCodeAt(0)
  entry(173, 0x0004, 5, 3, 213)
  rational(189, 31, 1)
  rational(197, 13, 1)
  rational(205, 494_976, 10_000)
  rational(213, 121, 1)
  rational(221, 28, 1)
  rational(229, 253_236, 10_000)

  const payloadLength = 6 + tiff.length
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, (payloadLength + 2) >> 8, (payloadLength + 2) & 0xff,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    ...tiff,
    0xff, 0xd9,
  ])
}

describe('image privacy metadata', () => {
  it('summarizes location, device, time, owner, and serial fields without duplicates', () => {
    const summary = summarizeImageMetadata({
      Make: 'Google',
      Model: 'Pixel 9',
      DateTimeOriginal: new Date(2026, 6, 8, 14, 5, 6),
      OwnerName: 'Alex Example',
      Artist: 'Alex Example',
      SerialNumber: 'CAM-123',
      LensSerialNumber: 'LENS-456',
      Software: 'Camera App',
    }, { latitude: 31.230416, longitude: 121.473701 })

    expect(summary.hasGps).toBe(true)
    expect(summary.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'gps', value: '31.23042, 121.47370', risk: 'high' }),
      expect.objectContaining({ id: 'device', value: 'Google Pixel 9' }),
      expect.objectContaining({ id: 'serial', value: 'CAM-123 / LENS-456', risk: 'high' }),
      expect.objectContaining({ id: 'time', value: '2026-07-08 14:05:06' }),
      expect.objectContaining({ id: 'owner', value: 'Alex Example' }),
      expect.objectContaining({ id: 'software', value: 'Camera App' }),
    ]))
  })

  it('ignores incomplete coordinates and creates a safe metadata-free filename', () => {
    const summary = summarizeImageMetadata({ ImageDescription: '  private\0 note  ' }, { latitude: 12 })
    expect(summary.hasGps).toBe(false)
    expect(summary.items).toEqual([
      expect.objectContaining({ id: 'description', value: 'private note' }),
    ])
    expect(metadataFreeFilename('trip:home?.jpeg')).toBe('trip-home--metadata-free.png')
  })

  it('reads selected EXIF and GPS fields from a local JPEG File', async () => {
    const report = await inspectImageMetadata(new File(
      [syntheticExifJpeg()],
      'phone.jpg',
      { type: 'image/jpeg' },
    ))

    expect(report.status).toBe('inspected')
    expect(report.hasGps).toBe(true)
    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'gps', value: '31.23042, 121.47370' }),
      expect.objectContaining({ id: 'device', value: 'Google Pixel 9' }),
      expect.objectContaining({ id: 'serial', value: 'CAM-123' }),
      expect.objectContaining({ id: 'time', value: '2026-07-08 14:05:06' }),
    ]))
  })
})
