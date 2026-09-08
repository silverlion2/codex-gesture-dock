import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeReleaseEvidence } from './release-assets.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactsDirectory = path.resolve(projectRoot, process.argv[2] ?? 'artifacts')
const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
const { manifest } = await writeReleaseEvidence({
  artifactsDirectory,
  version: packageJson.version,
})

console.log(
  `Generated release evidence for ${manifest.assets.length} assets: ${path.join(artifactsDirectory, 'release-assets.json')}`,
)
