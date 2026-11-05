import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { FileMatcher } = require('app-builder-lib/out/fileMatcher.js')
const asar = require('@electron/asar')
const { mergeASARs } = require(path.join(path.dirname(require.resolve('@electron/universal')), 'asar-utils.js'))
const parser = require('@typescript-eslint/parser')
const { clearCaches } = require('@typescript-eslint/typescript-estree')

function fixture(t) {
  const parent = path.resolve(os.tmpdir())
  const root = mkdtempSync(path.join(parent, 'gesture-dependency-test-'))
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), parent)
    assert.ok(path.basename(root).startsWith('gesture-dependency-test-'))
    rmSync(root, { recursive: true, force: true })
  })
  const put = (relative, content = 'synthetic fixture') => {
    const filename = path.join(root, relative)
    mkdirSync(path.dirname(filename), { recursive: true })
    writeFileSync(filename, content)
    return filename
  }
  return { root, put }
}

test('builder package inclusion and exclusion still work through its actual FileMatcher', (t) => {
  const { root, put } = fixture(t)
  const config = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const matcher = new FileMatcher(root, path.join(root, 'output'), (value) => value, config.build.files)
  const accepts = matcher.createFilter()
  for (const filename of ['dist/assets/app.js', 'dist/.keep', 'electron/main.cjs', 'electron/windows-system-control.ps1', 'LICENSE', 'docs/user-guide-zh.md']) {
    const file = put(filename)
    assert.equal(accepts(file, statSync(file)), true, filename)
  }
  for (const filename of ['work/private.txt', '.env', 'src/App.tsx', 'optimization_plan.md']) {
    const file = put(filename)
    assert.equal(accepts(file, statSync(file)), false, filename)
  }
  const filtered = new FileMatcher(root, root, (value) => value, ['electron/*.{cjs,ps1}', '!**/private*']).createFilter()
  for (const [filename, expected] of [['electron/main.cjs', true], ['electron/helper.ps1', true], ['electron/private.cjs', false], ['electron/readme.md', false]]) {
    const file = put(filename)
    assert.equal(filtered(file, statSync(file)), expected, filename)
  }
})

test('universal ASAR merger applies single-architecture allowlists to real synthetic archives', async (t) => {
  const { root, put } = fixture(t)
  // This macOS utility expects POSIX archive enumeration. Preserve real archive
  // I/O and matcher calls while adapting only Windows list separators.
  const nativeList = asar.listPackage.bind(asar)
  t.mock.method(asar.default, 'listPackage', (...args) => nativeList(...args).map((name) => name.replaceAll('\\', '/')))
  t.after(() => asar.uncacheAll())
  for (const architecture of ['x64', 'arm64']) {
    put(`${architecture}/shared.txt`, 'same synthetic content')
    put(`${architecture}/nested/${architecture}-only.txt`, `${architecture} fixture`)
    await asar.createPackage(path.join(root, architecture), path.join(root, `${architecture}.asar`))
  }
  const options = { x64AsarPath: path.join(root, 'x64.asar'), arm64AsarPath: path.join(root, 'arm64.asar'), outputAsarPath: path.join(root, 'merged.asar') }
  await assert.rejects(mergeASARs({ ...options, singleArchFiles: '*.node' }), /not covered by.*allowList/)
  await mergeASARs({ ...options, singleArchFiles: '*-only.txt' })
  assert.equal(asar.extractFile(options.outputAsarPath, 'shared.txt').toString(), 'same synthetic content')
  for (const architecture of ['x64', 'arm64']) {
    assert.equal(asar.extractFile(options.outputAsarPath, `nested/${architecture}-only.txt`).toString(), `${architecture} fixture`)
  }
})

test('TypeScript project service allows only the configured default-project filename glob', (t) => {
  const { root, put } = fixture(t)
  put('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true }, include: ['src/**/*.ts'] }))
  put('src/included.ts', 'export const included = true')
  const code = 'export const answer: number = 42'
  const allowed = put('.config.ts', code)
  const denied = put('.unlisted.ts', code)
  t.after(() => clearCaches())
  const options = { tsconfigRootDir: root, projectService: { allowDefaultProject: ['.config.ts'], defaultProject: 'tsconfig.json' } }
  const parsed = parser.parseForESLint(code, { ...options, filePath: allowed })
  assert.ok(parsed.services.program.getTypeChecker())
  assert.equal(parsed.ast.body[0].type, 'ExportNamedDeclaration')
  assert.throws(() => parser.parseForESLint(code, { ...options, filePath: denied }), /not found by the project service|allowDefaultProject/)
})
