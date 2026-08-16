export interface DocumentOcrPage {
  id: string
  filename: string
}

export interface DocumentOcrReviewText {
  text: string
}

export interface DocumentOcrSearchMatch {
  pageId: string
  pageIndex: number
  filename: string
  occurrenceCount: number
  preview: string
}

function searchPreview(text: string, matchIndex: number, matchLength: number) {
  const start = Math.max(0, matchIndex - 36)
  const end = Math.min(text.length, matchIndex + matchLength + 60)
  const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${excerpt}${end < text.length ? '…' : ''}`
}

export function findDocumentOcrMatches(
  pages: DocumentOcrPage[],
  reviews: Record<string, DocumentOcrReviewText | undefined>,
  query: string,
) {
  const needle = query.trim().slice(0, 200).toLocaleLowerCase()
  if (!needle) return []
  const matches: DocumentOcrSearchMatch[] = []
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex]
    const text = reviews[page.id]?.text ?? ''
    const searchable = text.toLocaleLowerCase()
    const firstIndex = searchable.indexOf(needle)
    if (firstIndex < 0) continue
    let occurrenceCount = 0
    let offset = 0
    while (offset <= searchable.length - needle.length) {
      const index = searchable.indexOf(needle, offset)
      if (index < 0) break
      occurrenceCount += 1
      offset = index + Math.max(needle.length, 1)
    }
    matches.push({
      pageId: page.id,
      pageIndex,
      filename: page.filename,
      occurrenceCount,
      preview: searchPreview(text, firstIndex, needle.length),
    })
  }
  return matches
}

export function buildDocumentOcrText(
  pages: DocumentOcrPage[],
  reviews: Record<string, DocumentOcrReviewText | undefined>,
) {
  return pages.map((page, index) => {
    const review = reviews[page.id]
    const text = review?.text.trim()
    const content = text || (review ? '[人工复核后为空]' : '[尚未执行 OCR]')
    return `--- 第 ${index + 1} 页 · ${page.filename} ---\n${content}`
  }).join('\n\n')
}

function safeDocumentBase(filename: string) {
  return [...filename
    .replace(/\.[^.]+$/, '')
    .replace(/-processed(?:-redacted)?$/i, '')]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
}

export function documentOcrFilename(filename: string) {
  return `${safeDocumentBase(filename) || 'scanned-document'}-all-pages-ocr.txt`
}

export function documentLayoutFilename(filename: string, format: 'json' | 'csv' | 'hocr' | 'alto') {
  const extension = format === 'alto' ? 'alto.xml' : format
  return `${safeDocumentBase(filename) || 'scanned-document'}-all-pages-ocr-layout.${extension}`
}
