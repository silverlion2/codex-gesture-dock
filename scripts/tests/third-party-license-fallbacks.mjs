import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  createNapiCanvasLicenseFallbacks,
  napiCanvasLicensePath,
  napiCanvasParentPackage,
  napiCanvasLicenseSha256,
  napiCanvasPlatformPackages,
  usesNapiCanvasParentNotice,
} from '../third-party-license-fallbacks.mjs'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

test('napi canvas x64 native packages use the verified bundled MIT text', async () => {
  const fallbacks = new Map(createNapiCanvasLicenseFallbacks(projectRoot))
  const expectedPackages = [
    '@napi-rs/canvas-win32-x64-msvc',
    '@napi-rs/canvas-linux-x64-gnu',
    '@napi-rs/canvas-linux-x64-musl',
  ]

  assert.deepEqual(napiCanvasPlatformPackages, expectedPackages)
  assert.equal(napiCanvasParentPackage, '@napi-rs/canvas')
  for (const packageName of expectedPackages) {
    assert.equal(fallbacks.get(packageName), napiCanvasLicensePath(projectRoot))
    assert.equal(usesNapiCanvasParentNotice(packageName), true)
  }

  const contents = await readFile(napiCanvasLicensePath(projectRoot))
  const digest = createHash('sha256').update(contents).digest('hex')
  assert.equal(digest, napiCanvasLicenseSha256)
})

test('napi canvas fallback coverage does not widen to other platforms', () => {
  const fallbacks = new Map(createNapiCanvasLicenseFallbacks(projectRoot))
  const unapprovedPackage = '@napi-rs/canvas-linux-arm64-gnu'

  assert.equal(fallbacks.has(unapprovedPackage), false)
  assert.equal(usesNapiCanvasParentNotice(unapprovedPackage), false)
})

test('generator keeps platform notices identical and rejects unapproved licenses', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'canvas-license-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const directory of ['scripts', 'third_party_licenses', 'public/fonts', 'packages/parent', 'packages/native']) {
    await mkdir(path.join(root, directory), { recursive: true })
  }
  for (const file of [
    'scripts/third-party-notices.mjs',
    'scripts/third-party-license-fallbacks.mjs',
    'third_party_licenses/Napi-RS-Canvas-MIT.txt',
    'third_party_licenses/Noto-Sans-SC-OFL-1.1.txt',
    'public/fonts/NotoSansSC-VF.ttf',
  ]) {
    await copyFile(path.join(projectRoot, file), path.join(root, file))
  }
  const approvedText = await readFile(napiCanvasLicensePath(root), 'utf8')
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.6.0' }))
  await writeFile(path.join(root, 'packages/parent/LICENSE'), approvedText)
  const queryCli = path.join(root, 'query.mjs')
  await writeFile(queryCli, `import { readFileSync } from 'node:fs';
process.stdout.write(readFileSync(new URL('./packages.json', import.meta.url)));
`)
  const parent = { name: napiCanvasParentPackage, version: '1.0.3', license: 'MIT', path: path.join(root, 'packages/parent') }
  const native = { name: napiCanvasPlatformPackages[0], version: '1.0.3', license: 'MIT', path: path.join(root, 'packages/native') }
  const outputs = ['THIRD_PARTY_NOTICES.md', 'third_party_licenses/npm-production-licenses.txt']
  async function run(entries, ...args) {
    await writeFile(path.join(root, 'packages.json'), JSON.stringify(entries))
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/third-party-notices.mjs'), ...args], {
      cwd: root,
      env: { ...process.env, npm_execpath: queryCli },
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.ifError(result.error)
    return result
  }
  async function readOutputs() {
    return Promise.all(outputs.map((file) => readFile(path.join(root, file), 'utf8')))
  }
  const initial = await run([parent, native])
  assert.equal(initial.status, 0, initial.stderr)
  const baseline = await readOutputs()
  assert.match(baseline[0], /\| @napi-rs\/canvas \| 1\.0\.3 \| MIT \|/)
  assert.match(baseline[1], /Copyright \(c\) 2020/)
  assert.match(baseline[1], /Source file: third_party_licenses\/Noto-Sans-SC-OFL-1\.1\.txt/)
  assert.doesNotMatch(baseline[1], /Source file: .*\\/)
  for (const name of napiCanvasPlatformPackages) {
    const result = await run([parent, { ...native, name }])
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(await readOutputs(), baseline)
    const check = await run([parent, { ...native, name }], '--check')
    assert.equal(check.status, 0, check.stderr)
  }
  const bothLinux = await run([parent, ...napiCanvasPlatformPackages.slice(1).map((name) => ({ ...native, name }))])
  assert.equal(bothLinux.status, 0, bothLinux.stderr)
  assert.deepEqual(await readOutputs(), baseline)

  async function rejects(entries, pattern) {
    const result = await run(entries)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, pattern)
    assert.deepEqual(await readOutputs(), baseline, 'failure must preserve existing outputs')
  }
  await rejects([native], /cannot be aggregated without/)
  await rejects([parent, { ...native, name: 'unknown-production-package' }], /without bundled or approved fallback/)
  await rejects([parent, { ...native, name: '@napi-rs/canvas-linux-arm64-gnu' }], /without bundled or approved fallback/)
  await rejects([parent, { ...native, version: '1.0.4' }], /requires a new canvas license review/)
  await rejects([{ ...parent, version: '1.0.4' }, native], /requires a new canvas license review/)
  await rejects([parent, { ...native, license: 'Apache-2.0' }], /requires a new canvas license review/)
  await rejects([{ ...parent, license: 'UNKNOWN' }, native], /requires a new canvas license review/)

  await writeFile(path.join(root, 'packages/native/LICENSE'), approvedText)
  const bundled = await run([parent, native])
  assert.equal(bundled.status, 0, bundled.stderr)
  assert.deepEqual(await readOutputs(), baseline)
  await writeFile(path.join(root, 'packages/native/NOTICE'), 'Additional attribution must not disappear')
  await rejects([parent, native], /unapproved canvas license or notice text/)
  await rm(path.join(root, 'packages/native/NOTICE'))
  await writeFile(path.join(root, 'packages/parent/LICENSE'), 'Different parent license')
  await rejects([parent, native], /unapproved canvas license or notice text/)
  await writeFile(path.join(root, 'packages/parent/LICENSE'), approvedText)
  await writeFile(napiCanvasLicensePath(root), `${approvedText}tampered`)
  await rejects([parent, native], /does not match its approved SHA-256/)
  await writeFile(napiCanvasLicensePath(root), approvedText)
  await writeFile(path.join(root, outputs[0]), 'stale')
  const stale = await run([parent, native], '--check')
  assert.notEqual(stale.status, 0)
  assert.match(stale.stderr, /THIRD_PARTY_NOTICES.md is stale/)
})
