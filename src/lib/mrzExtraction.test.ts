import { describe, expect, it } from 'vitest'
import { buildReviewedMrzJson, extractMrz, mrzJsonFilename } from './mrzExtraction'

const td1 = [
  'I<GBRD231458907<<<<<<<<<<<<<<<',
  '7408122F1204159GBR<<<<<<<<<<<6',
  'ERIKSSON<<ANNA<MARIA<<<<<<<<<<',
]
const td2 = [
  'I<GBRERIKSSON<<ANNA<MARIA<<<<<<<<<<<',
  'D231458907GBR7408122F1204159<<<<<<<6',
]
const td3 = [
  'P<GBRERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36GBR7408122F1204159ZE184226B<<<<<10',
]

describe('MRZ extraction', () => {
  it.each([
    ['TD1', td1, 'D23145890'],
    ['TD2', td2, 'D23145890'],
    ['TD3', td3, 'L898902C3'],
  ] as const)('parses and checksum-validates %s documents', async (format, lines, documentNumber) => {
    const result = await extractMrz(`unrelated heading\n${lines.join('\n')}\nfooter`)
    expect(result).toMatchObject({ format, valid: true, checksumsValid: true })
    expect(result?.fields).toMatchObject({
      documentNumber,
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      birthDate: '740812',
      expirationDate: '120415',
      sex: 'F',
    })
  })

  it('normalizes OCR spacing and records field-aware ambiguity corrections', async () => {
    const result = await extractMrz(`${td3[0].replaceAll('<', '< ')}\n${td3[1].replace('120415', '12O415')}`)
    expect(result).toMatchObject({ format: 'TD3', valid: true, checksumsValid: true, correctedCharacterCount: 1 })
    expect(result?.fields.expirationDate).toBe('120415')
  })

  it('reconstructs only missing trailing fillers on the name-only line', async () => {
    const result = await extractMrz([
      'SYNTHETIC PASSPORT QA',
      'P<GBRERIKSSON<<ANNA<MARIA< <<< K',
      td3[1],
    ].join('\n'))
    expect(result).toMatchObject({ format: 'TD3', valid: true, checksumsValid: true })
    expect(result!.reconstructedFillerCount).toBeGreaterThan(0)
    expect(result!.fields.givenNames).toBe('ANNA MARIA')

    expect(await extractMrz(`${td3[0]}\n${td3[1].slice(0, -1)}`)).toBeNull()
  })

  it('rejects ordinary OCR text and exposes invalid check fields without authenticity claims', async () => {
    expect(await extractMrz('Invoice 2026\nTotal 12.50\nThank you')).toBeNull()
    const invalid = await extractMrz(`${td3[0]}\n${td3[1].replace('1204159', '1204169')}`)
    expect(invalid).toMatchObject({ valid: false, checksumsValid: false })
    expect(invalid?.invalidFields).toContain('有效期校验位')

    const json = JSON.parse(buildReviewedMrzJson(invalid!, invalid!.fields))
    expect(json).toMatchObject({ humanReviewed: true, authenticityVerified: false })
    expect(json).not.toHaveProperty('rawLines')
  })

  it('creates a safe reviewed JSON filename', () => {
    expect(mrzJsonFilename('L89:890?2C3. ')).toBe('mrz-L89-890-2C3-reviewed.json')
  })
})
