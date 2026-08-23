import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { mapNormalizedPointerCommand } = require('./pointer-command.cjs')

describe('pointer command display mapping', () => {
  const workArea = { x: -1920, y: 20, width: 1920, height: 1080 }

  it('maps the camera safety margin onto the complete current work area', () => {
    expect(mapNormalizedPointerCommand({ kind: 'move', x: 0.08, y: 0.08 }, workArea)).toEqual({
      kind: 'move',
      x: -1920,
      y: 20,
    })
    expect(mapNormalizedPointerCommand({ kind: 'move', x: 0.92, y: 0.92 }, workArea)).toEqual({
      kind: 'move',
      x: -1,
      y: 1099,
    })
  })

  it('rejects non-finite, out-of-range, and arbitrary renderer input', () => {
    expect(mapNormalizedPointerCommand({ kind: 'move', x: 1.1, y: 0.5 }, workArea)).toBeNull()
    expect(mapNormalizedPointerCommand({ kind: 'move', x: Number.NaN, y: 0.5 }, workArea)).toBeNull()
    expect(mapNormalizedPointerCommand({ kind: 'keyboard', key: 'Enter' }, workArea)).toBeNull()
    expect(mapNormalizedPointerCommand({ kind: 'scroll', delta: 120 }, workArea)).toBeNull()
  })

  it('passes only fixed click and one-step scroll semantics', () => {
    expect(mapNormalizedPointerCommand({ kind: 'click' }, workArea)).toEqual({ kind: 'click' })
    expect(mapNormalizedPointerCommand({ kind: 'scroll', delta: -1 }, workArea)).toEqual({
      kind: 'scroll',
      delta: -1,
    })
  })
})
