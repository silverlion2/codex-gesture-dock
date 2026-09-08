import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildReleaseEvidence,
  getReleaseAssetNames,
  writeReleaseEvidence,
} from '../release-assets.mjs'

const version = '0.6.0'

async function withArtifacts(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gesture-dock-assets-'))
  try {
    const setupName = getReleaseAssetNames(version)[0]
    const setup = Buffer.from('signed setup fixture')
    const files = new Map([
      [setupName, setup],
      [`Codex-Gesture-Dock-${version}-portable.exe`, Buffer.from('portable fixture')],
      [`${setupName}.blockmap`, Buffer.from('blockmap fixture')],
      ['sbom.cdx.json', Buffer.from('{"bomFormat":"CycloneDX"}\n')],
    ])
    const sha512 = createHash('sha512').update(setup).digest('base64')
    files.set(
      'latest.yml',
      Buffer.from(`version: ${version}\npath: ${setupName}\nsha512: ${sha512}\nfiles:\n  - url: ${setupName}\n    sha512: ${sha512}\n    size: ${setup.length}\n`),
    )
    for (const [name, contents] of files) {
      await writeFile(path.join(directory, name), contents)
    }
    await run(directory, { setupName, files })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('builds a deterministic canonical asset manifest and checksum list', async () => {
  await withArtifacts(async (directory, { setupName }) => {
    const evidence = await buildReleaseEvidence({
      artifactsDirectory: directory,
      version,
      generatedAt: '2026-09-09T00:00:00.000Z',
    })
    assert.deepEqual(
      evidence.manifest.assets.map((asset) => asset.name),
      getReleaseAssetNames(version),
    )
    assert.equal(evidence.manifest.latestYml.path, setupName)
    assert.equal(evidence.manifest.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256)), true)
    assert.equal(evidence.checksumText.split('\n').filter(Boolean).length, 5)
    assert.deepEqual(evidence.manifest.publishFiles.slice(-2), ['SHA256SUMS.txt', 'release-assets.json'])
  })
})

test('rejects missing, stale, and tampered release inputs', async () => {
  await withArtifacts(async (directory, { setupName }) => {
    await rm(path.join(directory, 'sbom.cdx.json'))
    await assert.rejects(
      buildReleaseEvidence({ artifactsDirectory: directory, version }),
      /Required release artifact is missing: sbom\.cdx\.json/,
    )
    await writeFile(path.join(directory, 'sbom.cdx.json'), '{}')
    await writeFile(path.join(directory, 'Codex-Gesture-Dock-0.5.0-setup.exe'), 'stale')
    await assert.rejects(
      buildReleaseEvidence({ artifactsDirectory: directory, version }),
      /Stale or unexpected versioned artifacts/,
    )
    await rm(path.join(directory, 'Codex-Gesture-Dock-0.5.0-setup.exe'))
    await writeFile(path.join(directory, setupName), 'tampered setup fixture')
    await assert.rejects(
      buildReleaseEvidence({ artifactsDirectory: directory, version }),
      /latest\.yml size does not match|latest\.yml SHA-512 does not match/,
    )
  })
})

test('does not overwrite prior evidence when validation fails', async () => {
  await withArtifacts(async (directory) => {
    await writeFile(path.join(directory, 'SHA256SUMS.txt'), 'previous checksums\n')
    await writeFile(path.join(directory, 'release-assets.json'), '{"previous":true}\n')
    await rm(path.join(directory, 'sbom.cdx.json'))

    await assert.rejects(
      writeReleaseEvidence({ artifactsDirectory: directory, version }),
      /Required release artifact is missing/,
    )
    assert.equal(await readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8'), 'previous checksums\n')
    assert.equal(await readFile(path.join(directory, 'release-assets.json'), 'utf8'), '{"previous":true}\n')
  })
})
