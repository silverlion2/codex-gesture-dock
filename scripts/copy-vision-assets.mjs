import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = join(projectRoot, 'public', 'vision')
const openCvSource = join(
  projectRoot,
  'node_modules',
  '@techstark',
  'opencv-js',
  'dist',
  'opencv.js',
)
const workerSource = join(projectRoot, 'src', 'workers', 'document-scanner.worker.js')

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })
await cp(openCvSource, join(outputRoot, 'opencv.js'))
await cp(workerSource, join(outputRoot, 'document-scanner.worker.js'))

console.log('Prepared the isolated local OpenCV.js document-scanning runtime.')
