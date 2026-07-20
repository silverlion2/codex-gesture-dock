export type PostureStatus = 'good' | 'fair' | 'poor' | 'away'

export interface Landmark {
  x: number
  y: number
  z: number
  visibility: number
}

export interface PostureFeatures {
  headHeight: number
  horizontalOffset: number
  shoulderTilt: number
}

export type PostureBaseline = PostureFeatures

const visibleEnough = (landmark: Landmark | undefined, threshold: number) =>
  Boolean(landmark && (landmark.visibility ?? 1) >= threshold)

export function extractPostureFeatures(
  landmarks: Landmark[],
): PostureFeatures | null {
  const nose = landmarks[0]
  const leftShoulder = landmarks[11]
  const rightShoulder = landmarks[12]

  if (
    !visibleEnough(nose, 0.35) ||
    !visibleEnough(leftShoulder, 0.5) ||
    !visibleEnough(rightShoulder, 0.5)
  ) {
    return null
  }

  const shoulderWidth = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y,
  )

  if (shoulderWidth < 0.06) return null

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2

  return {
    headHeight: (shoulderMidY - nose.y) / shoulderWidth,
    horizontalOffset: (nose.x - shoulderMidX) / shoulderWidth,
    shoulderTilt: (leftShoulder.y - rightShoulder.y) / shoulderWidth,
  }
}

export function averageFeatures(
  samples: PostureFeatures[],
): PostureBaseline | null {
  if (samples.length < 8) return null

  const totals = samples.reduce(
    (sum, sample) => ({
      headHeight: sum.headHeight + sample.headHeight,
      horizontalOffset: sum.horizontalOffset + sample.horizontalOffset,
      shoulderTilt: sum.shoulderTilt + sample.shoulderTilt,
    }),
    { headHeight: 0, horizontalOffset: 0, shoulderTilt: 0 },
  )

  return {
    headHeight: totals.headHeight / samples.length,
    horizontalOffset: totals.horizontalOffset / samples.length,
    shoulderTilt: totals.shoulderTilt / samples.length,
  }
}

export function scorePosture(
  features: PostureFeatures,
  baseline: PostureBaseline,
): number {
  const headDrop = Math.max(0, baseline.headHeight - features.headHeight - 0.018)
  const sideLean = Math.max(
    0,
    Math.abs(features.horizontalOffset - baseline.horizontalOffset) - 0.02,
  )
  const shoulderTilt = Math.max(
    0,
    Math.abs(features.shoulderTilt - baseline.shoulderTilt) - 0.018,
  )

  const penalty = headDrop * 300 + sideLean * 210 + shoulderTilt * 170
  return Math.max(0, Math.min(100, Math.round(100 - penalty)))
}

export function statusForScore(score: number | null): PostureStatus {
  if (score === null) return 'away'
  if (score >= 82) return 'good'
  if (score >= 64) return 'fair'
  return 'poor'
}

export const statusLabel: Record<PostureStatus, string> = {
  good: '姿势良好',
  fair: '可以调整一下',
  poor: '请坐直一点',
  away: '未检测到你',
}
