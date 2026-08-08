import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  constrainBounds,
  parseWidgetWindowState,
} = require('./window-bounds.cjs')

describe('widget window bounds', () => {
  it('rejects malformed persisted bounds', () => {
    expect(
      parseWidgetWindowState({
        collapsed: { x: 10, y: 20, width: 348, height: 360 },
        expanded: { x: 'bad', y: 20, width: 1120, height: 760 },
      }),
    ).toEqual({
      collapsed: { x: 10, y: 20, width: 348, height: 360 },
      expanded: null,
    })
  })

  it('clamps stored bounds to the active display and compact size', () => {
    expect(
      constrainBounds(
        { x: 1900, y: 1100, width: 600, height: 500 },
        { x: 0, y: 0, width: 1920, height: 1080 },
        {
          defaultSize: { width: 348, height: 360 },
          minSize: { width: 348, height: 360 },
          fixedSize: true,
        },
      ),
    ).toEqual({ x: 1572, y: 720, width: 348, height: 360 })
  })

  it('retains the expanded width and clamps height to the safe minimum', () => {
    expect(
      constrainBounds(
        { x: 25, y: 30, width: 980, height: 700 },
        { x: 0, y: 0, width: 1920, height: 1080 },
        {
          defaultSize: { width: 1120, height: 760 },
          minSize: { width: 980, height: 760 },
        },
      ),
    ).toEqual({ x: 25, y: 30, width: 980, height: 760 })
  })
})
