import type { FieldName, MRZFormat, ParseResult } from 'mrz'

export type SupportedMrzFormat = Extract<MRZFormat, 'TD1' | 'TD2' | 'TD3'>

export interface MrzEditableFields {
  documentCode: string
  documentNumber: string
  issuingState: string
  nationality: string
  surname: string
  givenNames: string
  birthDate: string
  sex: string
  expirationDate: string
  personalNumber: string
}

export interface MrzExtraction {
  format: SupportedMrzFormat
  valid: boolean
  checksumsValid: boolean
  fields: MrzEditableFields
  rawLines: string[]
  correctedCharacterCount: number
  reconstructedFillerCount: number
  invalidFields: string[]
}

const fieldLabels: Partial<Record<FieldName, string>> = {
  birthDate: '出生日期',
  birthDateCheckDigit: '出生日期校验位',
  compositeCheckDigit: '综合校验位',
  documentCode: '证件类型',
  documentNumber: '证件号码',
  documentNumberCheckDigit: '证件号码校验位',
  expirationDate: '有效期',
  expirationDateCheckDigit: '有效期校验位',
  firstName: '名',
  issuingState: '签发国/地区',
  lastName: '姓',
  nationality: '国籍',
  personalNumber: '个人号码',
  personalNumberCheckDigit: '个人号码校验位',
  sex: '性别',
}

const supportedShapes: Array<{ format: SupportedMrzFormat; lineCount: number; lineLength: number }> = [
  { format: 'TD1', lineCount: 3, lineLength: 30 },
  { format: 'TD2', lineCount: 2, lineLength: 36 },
  { format: 'TD3', lineCount: 2, lineLength: 44 },
]

function normalizeMrzLine(line: string) {
  return line
    .toUpperCase()
    .replaceAll('«', '<<')
    .replace(/[‹〈]/g, '<')
    .replace(/\s/g, '')
    .replace(/[^A-Z0-9<]/g, '')
}

function field(result: ParseResult, name: FieldName) {
  return result.fields[name] ?? ''
}

function uniqueCorrectionCount(result: ParseResult) {
  return new Set(result.details.flatMap((detail) => detail.autocorrect.map((correction) => (
    `${correction.line}:${correction.column}:${correction.original}:${correction.corrected}`
  )))).size
}

function toExtraction(result: ParseResult, rawLines: string[], reconstructedFillerCount: number): MrzExtraction | null {
  if (result.format !== 'TD1' && result.format !== 'TD2' && result.format !== 'TD3') return null
  const validDetails = result.details.filter((detail) => detail.valid)
  if (validDetails.length < 6 || !field(result, 'documentCode')) return null
  const checksumDetails = result.details.filter((detail) => detail.field?.toLowerCase().endsWith('checkdigit'))
  const invalidFields = result.details
    .filter((detail) => !detail.valid && detail.field)
    .map((detail) => fieldLabels[detail.field!] ?? detail.label)
    .filter((label, index, labels) => labels.indexOf(label) === index)
  return {
    format: result.format,
    valid: result.valid,
    checksumsValid: checksumDetails.length > 0 && checksumDetails.every((detail) => detail.valid),
    fields: {
      documentCode: field(result, 'documentCode'),
      documentNumber: result.documentNumber ?? field(result, 'documentNumber'),
      issuingState: field(result, 'issuingState'),
      nationality: field(result, 'nationality'),
      surname: field(result, 'lastName'),
      givenNames: field(result, 'firstName'),
      birthDate: field(result, 'birthDate'),
      sex: ({ male: 'M', female: 'F', unspecified: 'X' } as Record<string, string>)[field(result, 'sex')] ?? field(result, 'sex'),
      expirationDate: field(result, 'expirationDate'),
      personalNumber: field(result, 'personalNumber'),
    },
    rawLines,
    correctedCharacterCount: uniqueCorrectionCount(result),
    reconstructedFillerCount,
    invalidFields,
  }
}

function repairNameLine(line: string, lineLength: number) {
  if (line.length >= lineLength || line.length < 15) return { line, reconstructed: 0 }
  const withoutTrailingNoise = line.replace(/(<{3,})[A-Z0-9]$/, '$1<')
  const replaced = withoutTrailingNoise === line ? 0 : 1
  return {
    line: withoutTrailingNoise.padEnd(lineLength, '<'),
    reconstructed: replaced + lineLength - withoutTrailingNoise.length,
  }
}

export async function extractMrz(text: string): Promise<MrzExtraction | null> {
  const { parse } = await import('mrz')
  const lines = text
    .split(/\r?\n/)
    .map(normalizeMrzLine)
    .filter(Boolean)
  const candidates: Array<{ extraction: MrzExtraction; score: number }> = []

  for (const shape of supportedShapes) {
    for (let index = 0; index <= lines.length - shape.lineCount; index += 1) {
      const candidateLines = lines.slice(index, index + shape.lineCount)
      const nameLineIndex = shape.format === 'TD1' ? 2 : 0
      const repairedNameLine = repairNameLine(candidateLines[nameLineIndex], shape.lineLength)
      const parsedLines = candidateLines.map((line, lineIndex) => lineIndex === nameLineIndex ? repairedNameLine.line : line)
      if (!parsedLines.every((line) => line.length === shape.lineLength)) continue
      try {
        const result = parse(parsedLines, { autocorrect: true })
        const extraction = toExtraction(result, candidateLines, repairedNameLine.reconstructed)
        if (!extraction || extraction.format !== shape.format) continue
        const validFieldCount = result.details.filter((detail) => detail.valid).length
        candidates.push({
          extraction,
          score: (extraction.valid ? 1_000 : 0) + (extraction.checksumsValid ? 100 : 0) + validFieldCount,
        })
      } catch {
        // OCR output frequently contains unrelated lines; unsupported windows are ignored.
      }
    }
  }

  return candidates.sort((left, right) => right.score - left.score)[0]?.extraction ?? null
}

export function buildReviewedMrzJson(extraction: MrzExtraction, fields: MrzEditableFields) {
  return JSON.stringify({
    format: extraction.format,
    sourceValidation: {
      allFieldsValid: extraction.valid,
      checksumsValid: extraction.checksumsValid,
      correctedCharacterCount: extraction.correctedCharacterCount,
      reconstructedFillerCount: extraction.reconstructedFillerCount,
      invalidFields: extraction.invalidFields,
    },
    fields,
    humanReviewed: true,
    authenticityVerified: false,
  }, null, 2)
}

export function mrzJsonFilename(documentNumber: string) {
  const safe = [...documentNumber]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
    .replace(/[. ]+$/g, '')
    .slice(0, 60)
  return `mrz-${safe || 'reviewed'}-reviewed.json`
}
