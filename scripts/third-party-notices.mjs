import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
)
const npmCli = process.env.npm_execpath
const knownLicenseFiles = new Map([
  [
    '@mediapipe/tasks-vision',
    path.join(projectRoot, 'third_party_licenses', 'MediaPipe-Apache-2.0.txt'),
  ],
  [
    'lazy-val',
    path.join(projectRoot, 'third_party_licenses', 'LazyVal-MIT.txt'),
  ],
  [
    '@napi-rs/canvas-win32-x64-msvc',
    path.join(projectRoot, 'node_modules', '@napi-rs', 'canvas', 'LICENSE'),
  ],
  [
    'tr46',
    path.join(projectRoot, 'third_party_licenses', 'Tr46-MIT.txt'),
  ],
  ...['eng', 'chi_sim', 'chi_tra'].map((language) => [
    `@tesseract.js-data/${language}`,
    path.join(projectRoot, 'third_party_licenses', 'MediaPipe-Apache-2.0.txt'),
  ]),
])
const licenseOverrides = new Map(
  ['eng', 'chi_sim', 'chi_tra'].map((language) => [
    `@tesseract.js-data/${language}`,
    'Apache-2.0',
  ]),
)
const bundledAssets = [
  {
    name: 'Noto Sans SC Variable',
    version: 'google-fonts@2894aab31764',
    license: 'OFL-1.1',
    assetPath: path.join(projectRoot, 'public', 'fonts', 'NotoSansSC-VF.ttf'),
    licensePath: path.join(projectRoot, 'third_party_licenses', 'Noto-Sans-SC-OFL-1.1.txt'),
    sha256: 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da',
  },
]

if (!npmCli) {
  throw new Error('Run this command through npm so npm_execpath is available.')
}

const query = execFileSync(
  process.execPath,
  [npmCli, 'query', '.prod', '--json'],
  { cwd: projectRoot, encoding: 'utf8' },
)
const packages = JSON.parse(query)
  .filter((entry) => path.resolve(entry.path) !== projectRoot)
  .sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  )

async function findLicenseFiles(packageDirectory) {
  const entries = await readdir(packageDirectory, { withFileTypes: true })
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort()
}

const inventory = []
const licenseSections = []
const missingLicenses = []

for (const asset of bundledAssets) {
  const assetContents = await readFile(asset.assetPath)
  const assetDigest = createHash('sha256').update(assetContents).digest('hex')
  if (assetDigest !== asset.sha256) {
    throw new Error(`${path.relative(projectRoot, asset.assetPath)} does not match its approved SHA-256.`)
  }
  const licenseContents = (await readFile(asset.licensePath, 'utf8')).trim()
  inventory.push({ name: asset.name, version: asset.version, license: asset.license })
  licenseSections.push(
    [
      '='.repeat(80),
      `${asset.name}@${asset.version} — ${asset.license}`,
      `Source file: ${path.relative(projectRoot, asset.licensePath)}`,
      `Asset SHA-256: ${assetDigest}`,
      '='.repeat(80),
      licenseContents,
      '',
    ].join('\n'),
  )
}

for (const entry of packages) {
  const license = licenseOverrides.get(entry.name) || String(entry.license || 'UNKNOWN')
  const licenseFiles = await findLicenseFiles(entry.path)
  const licenseSources = licenseFiles.map((licenseFile) => ({
    path: path.join(entry.path, licenseFile),
    name: licenseFile,
  }))
  const knownLicenseFile = knownLicenseFiles.get(entry.name)
  if (licenseSources.length === 0 && knownLicenseFile) {
    licenseSources.push({
      path: knownLicenseFile,
      name: path.relative(projectRoot, knownLicenseFile),
    })
  }
  if (licenseSources.length === 0) {
    missingLicenses.push(`${entry.name}@${entry.version} (${license})`)
    continue
  }

  inventory.push({
    name: entry.name,
    version: entry.version,
    license,
  })

  for (const licenseSource of licenseSources) {
    const contents = (await readFile(licenseSource.path, 'utf8')).trim()
    const digest = createHash('sha256').update(contents).digest('hex').slice(0, 12)
    licenseSections.push(
      [
        '='.repeat(80),
        `${entry.name}@${entry.version} — ${license}`,
        `Source file: ${licenseSource.name}`,
        `SHA-256 (first 12): ${digest}`,
        '='.repeat(80),
        contents,
        '',
      ].join('\n'),
    )
  }
}

if (missingLicenses.length > 0) {
  throw new Error(
    `Production packages without bundled or approved fallback licenses:\n${missingLicenses.join('\n')}`,
  )
}

const table = inventory
  .map(
    ({ name, version, license }) =>
      `| ${name.replaceAll('|', '\\|')} | ${version} | ${license.replaceAll('|', '\\|')} |`,
  )
  .join('\n')

const notices = `# Third-party notices

Codex Gesture Dock includes the production dependencies and bundled assets below.
This inventory is generated from the installed production dependency graph and
verified asset hashes for version ${packageJson.version}; CI rejects stale output.

| Component | Version | License |
| --- | --- | --- |
${table}

The corresponding license and notice texts are bundled in
\`third_party_licenses/npm-production-licenses.txt\`. Electron's packaged
distribution separately includes its own \`LICENSE\` and
\`LICENSES.chromium.html\` notices. All third-party licenses remain in effect
independently of this project's MIT license.

The MediaPipe pose, gesture, BlazeFace short-range face detection,
SelfieSegmenter person-background, and EfficientDet-Lite0 object-detection
models, along with the WebAssembly files, are distributed solely for local
inference.
The SelfieSegmenter model card identifies Apache License, Version 2.0 and
documents that the model is not intended for surveillance or identity
recognition. Its source model card is:
https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf
Codex Gesture Dock does not transmit camera frames or selected photos to a
remote service.

The bundled Noto Sans SC variable font is loaded only when the user exports a
searchable scanned PDF. jsPDF embeds only the glyph subset used by that PDF's
local OCR text layer. Source revision:
https://github.com/google/fonts/commit/2894aab31764f10f29c421bdfd2340d3b382d384
`

const bundle = `Production dependency license texts for Codex Gesture Dock ${packageJson.version}
Generated by scripts/third-party-notices.mjs. Do not edit manually.

${licenseSections.join('\n')}`

const outputs = [
  [path.join(projectRoot, 'THIRD_PARTY_NOTICES.md'), notices],
  [
    path.join(projectRoot, 'third_party_licenses', 'npm-production-licenses.txt'),
    bundle,
  ],
]

if (process.argv.includes('--check')) {
  for (const [outputPath, expected] of outputs) {
    const actual = await readFile(outputPath, 'utf8').catch(() => '')
    if (actual !== expected) {
      throw new Error(`${path.relative(projectRoot, outputPath)} is stale.`)
    }
  }
  console.log(`Third-party notices are current for ${inventory.length} components.`)
} else {
  for (const [outputPath, contents] of outputs) {
    await writeFile(outputPath, contents, 'utf8')
  }
  console.log(`Generated third-party notices for ${inventory.length} components.`)
}
