import { describe, expect, it } from 'vitest'
import { faceExpressionFromCategories, smoothFaceExpression } from './faceMasks'

describe('face mask expression mapping', () => {
  it('maps MediaPipe blendshapes into mask controls', () => {
    expect(faceExpressionFromCategories([
      { categoryName: 'jawOpen', score: 0.8 },
      { categoryName: 'mouthSmileLeft', score: 0.6 },
      { categoryName: 'mouthSmileRight', score: 0.4 },
      { categoryName: 'eyeBlinkLeft', score: 0.9 },
      { categoryName: 'eyeBlinkRight', score: 0.1 },
      { categoryName: 'browInnerUp', score: 0.7 },
    ])).toEqual({
      mouthOpen: 0.8,
      smile: 0.5,
      blinkLeft: 0.9,
      blinkRight: 0.1,
      browRaise: 0.7,
    })
  })

  it('clamps malformed scores and smooths frame changes', () => {
    const next = faceExpressionFromCategories([
      { categoryName: 'jawOpen', score: 4 },
      { categoryName: 'eyeBlinkLeft', score: Number.NaN },
    ])
    expect(next.mouthOpen).toBe(1)
    expect(next.blinkLeft).toBe(0)
    expect(smoothFaceExpression({ mouthOpen: 0, smile: 0, blinkLeft: 0, blinkRight: 0, browRaise: 0 }, next, 0.25).mouthOpen).toBe(0.25)
  })
})
