import { describe, expect, it } from 'vitest'
import {
  averageFeatures,
  scorePosture,
  statusForScore,
  type PostureFeatures,
} from './posture'

const baseline: PostureFeatures = {
  headHeight: 0.8,
  horizontalOffset: 0,
  shoulderTilt: 0,
}

describe('posture scoring', () => {
  it('keeps a calibrated neutral pose near 100', () => {
    expect(scorePosture(baseline, baseline)).toBe(100)
  })

  it('penalizes a lowered and leaning head', () => {
    const score = scorePosture(
      { headHeight: 0.55, horizontalOffset: 0.2, shoulderTilt: 0.08 },
      baseline,
    )
    expect(score).toBeLessThan(64)
    expect(statusForScore(score)).toBe('poor')
  })

  it('requires enough samples for calibration', () => {
    expect(averageFeatures([baseline])).toBeNull()
    const averaged = averageFeatures(Array.from({ length: 8 }, () => baseline))
    expect(averaged?.headHeight).toBeCloseTo(baseline.headHeight)
    expect(averaged?.horizontalOffset).toBeCloseTo(baseline.horizontalOffset)
    expect(averaged?.shoulderTilt).toBeCloseTo(baseline.shoulderTilt)
  })
})
