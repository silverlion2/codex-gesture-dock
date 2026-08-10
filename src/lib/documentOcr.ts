export interface DocumentOcrPage {
  id: string
  filename: string
}

export interface DocumentOcrReviewText {
  text: string
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

export function documentOcrFilename(filename: string) {
  const base = [...filename
    .replace(/\.[^.]+$/, '')
    .replace(/-processed(?:-redacted)?$/i, '')]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character)
    .join('')
  return `${base || 'scanned-document'}-all-pages-ocr.txt`
}
