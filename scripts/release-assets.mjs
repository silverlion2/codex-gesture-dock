import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function getReleaseAssetNames(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Expected a stable semantic version, received: ${version}`)
  }
  const setup = `Codex-Gesture-Dock-${version}-setup.exe`
  return [
    setup,
    `Codex-Gesture-Dock-${version}-portable.exe`,
    `${setup}.blockmap`,
    'latest.yml',
    'sbom.cdx.json',
  ]
}

function parseLatestYaml(text) {
  const pathMatch = text.match(/^path:\s*(\S+)\s*$/m)
  const sizeMatch = text.match(/^\s*size:\s*(\d+)\s*$/m)
  const sha512Match = text.match(/^\s*sha512:\s*(\S+)\s*$/m)
  if (!pathMatch || !sizeMatch || !sha512Match) {
    throw new Error('latest.yml is missing path, size, or SHA-512 metadata.')
  }
  return {
    path: pathMatch[1],
    size: Number(sizeMatch[1]),
    sha512: sha512Match[1],
  }
}

function digest(buffer, algorithm, encoding = 'hex') {
  return createHash(algorithm).update(buffer).digest(encoding)
}

export async function buildReleaseEvidence({
  artifactsDirectory,
  version,
  generatedAt = new Date().toISOString(),
}) {
  const assetNames = getReleaseAssetNames(version)
  const expectedVersioned = new Set(assetNames.filter((name) => name.startsWith('Codex-Gesture-Dock-')))
  const directoryEntries = await readdir(artifactsDirectory, { withFileTypes: true })
  const unexpectedVersioned = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.startsWith('Codex-Gesture-Dock-'))
    .map((entry) => entry.name)
    .filter((name) => !expectedVersioned.has(name))
    .sort()
  if (unexpectedVersioned.length > 0) {
    throw new Error(`Stale or unexpected versioned artifacts are present: ${unexpectedVersioned.join(', ')}`)
  }

  const buffers = new Map()
  const assets = []
  for (const name of assetNames) {
    const assetPath = path.join(artifactsDirectory, name)
    let info
    try {
      info = await stat(assetPath)
    } catch {
      throw new Error(`Required release artifact is missing: ${name}`)
    }
    if (!info.isFile() || info.size <= 0) {
      throw new Error(`Required release artifact is not a non-empty file: ${name}`)
    }
    const buffer = await readFile(assetPath)
    buffers.set(name, buffer)
    assets.push({
      name,
      size: info.size,
      sha256: digest(buffer, 'sha256'),
    })
  }

  const setupName = assetNames[0]
  const setup = assets[0]
  const latest = parseLatestYaml(buffers.get('latest.yml').toString('utf8'))
  const setupSha512 = digest(buffers.get(setupName), 'sha512', 'base64')
  if (latest.path !== setupName) {
    throw new Error(`latest.yml points to '${latest.path}' instead of '${setupName}'.`)
  }
  if (latest.size !== setup.size) {
    throw new Error('latest.yml size does not match the setup executable.')
  }
  if (latest.sha512 !== setupSha512) {
    throw new Error('latest.yml SHA-512 does not match the setup executable.')
  }

  const checksumText = `${assets.map((asset) => `${asset.sha256}  ${asset.name}`).join('\n')}\n`
  const manifest = {
    schemaVersion: 1,
    product: 'Codex Gesture Dock',
    version,
    generatedAt,
    assets,
    latestYml: {
      path: latest.path,
      size: latest.size,
      sha512: latest.sha512,
    },
    publishFiles: [...assetNames, 'SHA256SUMS.txt', 'release-assets.json'],
  }
  return { checksumText, manifest }
}

export async function writeReleaseEvidence({
  artifactsDirectory,
  version,
  generatedAt,
}) {
  const evidence = await buildReleaseEvidence({ artifactsDirectory, version, generatedAt })
  await writeFile(
    path.join(artifactsDirectory, 'SHA256SUMS.txt'),
    evidence.checksumText,
    'ascii',
  )
  await writeFile(
    path.join(artifactsDirectory, 'release-assets.json'),
    `${JSON.stringify(evidence.manifest, null, 2)}\n`,
    'utf8',
  )
  return evidence
}
