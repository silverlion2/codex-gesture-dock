import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    return entry.isDirectory() ? collect(filename)
      : /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name) ? [filename] : []
  })
}
const files = collect(path.join(root, 'src', 'components')).sort()
if (!files.length) throw new Error('No component test files found')
// Bound Windows worker/transform resources without dropping any discovered test.
for (let index = 0; index < files.length; index += 5) {
  const batch = files.slice(index, index + 5)
  console.log(`Component batch ${Math.floor(index / 5) + 1}: ${batch.length} of ${files.length} files`)
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run',
    ...batch.map((filename) => path.relative(root, filename)),
    '--pool=threads', '--maxWorkers=1',
  ], { cwd: root, stdio: 'inherit', timeout: 120_000 })
  if (result.error) console.error(result.error.message)
  if (result.error || result.status !== 0) process.exit(result.status || 1)
}
console.log(`All ${files.length} component test files completed.`)
