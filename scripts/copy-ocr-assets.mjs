import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = join(projectRoot, 'public', 'ocr')
const modulesRoot = join(projectRoot, 'node_modules')

async function copyFile(source, destination) {
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination)
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(join(outputRoot, 'core'), { recursive: true })
await mkdir(join(outputRoot, 'lang'), { recursive: true })

await copyFile(
  join(modulesRoot, 'tesseract.js', 'dist', 'worker.min.js'),
  join(outputRoot, 'worker.min.js'),
)
await copyFile(
  join(modulesRoot, 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
  join(outputRoot, 'pdf.worker.min.mjs'),
)

const coreRoot = join(modulesRoot, 'tesseract.js-core')
const coreFiles = await readdir(coreRoot)
for (const filename of coreFiles) {
  if (/^tesseract-core.*\.wasm\.js$/.test(filename)) {
    await copyFile(join(coreRoot, filename), join(outputRoot, 'core', filename))
  }
}

for (const language of ['eng', 'chi_sim', 'chi_tra']) {
  await copyFile(
    join(modulesRoot, '@tesseract.js-data', language, '4.0.0_best_int', `${language}.traineddata.gz`),
    join(outputRoot, 'lang', `${language}.traineddata.gz`),
  )
}

console.log('Prepared local OCR worker, core, PDF worker, and language data.')
