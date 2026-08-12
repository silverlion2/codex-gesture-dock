export type FaceMaskStyle = 'fox' | 'mecha' | 'festival'

export interface FaceMaskExpression {
  mouthOpen: number
  smile: number
  blinkLeft: number
  blinkRight: number
  browRaise: number
}

export interface FaceMaskCategory {
  categoryName: string
  score: number
}

export interface FaceMaskLandmark {
  x: number
  y: number
  z?: number
}

export const neutralFaceExpression: FaceMaskExpression = {
  mouthOpen: 0,
  smile: 0,
  blinkLeft: 0,
  blinkRight: 0,
  browRaise: 0,
}

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
const LEFT_EYE = [33, 160, 158, 133, 153, 144]
const RIGHT_EYE = [362, 385, 387, 263, 373, 380]
const OUTER_LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function faceExpressionFromCategories(categories: FaceMaskCategory[]): FaceMaskExpression {
  const scores = new Map(categories.map((category) => [category.categoryName, clamp(category.score)]))
  const average = (left: string, right: string) => ((scores.get(left) ?? 0) + (scores.get(right) ?? 0)) / 2

  return {
    mouthOpen: scores.get('jawOpen') ?? 0,
    smile: average('mouthSmileLeft', 'mouthSmileRight'),
    blinkLeft: scores.get('eyeBlinkLeft') ?? 0,
    blinkRight: scores.get('eyeBlinkRight') ?? 0,
    browRaise: Math.max(
      scores.get('browInnerUp') ?? 0,
      average('browOuterUpLeft', 'browOuterUpRight'),
    ),
  }
}

export function smoothFaceExpression(
  previous: FaceMaskExpression,
  next: FaceMaskExpression,
  amount = 0.28,
): FaceMaskExpression {
  const mix = (from: number, to: number) => from + (to - from) * amount
  return {
    mouthOpen: mix(previous.mouthOpen, next.mouthOpen),
    smile: mix(previous.smile, next.smile),
    blinkLeft: mix(previous.blinkLeft, next.blinkLeft),
    blinkRight: mix(previous.blinkRight, next.blinkRight),
    browRaise: mix(previous.browRaise, next.browRaise),
  }
}

function traceLandmarks(
  context: CanvasRenderingContext2D,
  landmarks: FaceMaskLandmark[],
  indices: number[],
  width: number,
  height: number,
) {
  const first = landmarks[indices[0]]
  if (!first) return false
  context.beginPath()
  context.moveTo(first.x * width, first.y * height)
  for (const index of indices.slice(1)) {
    const point = landmarks[index]
    if (point) context.lineTo(point.x * width, point.y * height)
  }
  context.closePath()
  return true
}

function faceFrame(landmarks: FaceMaskLandmark[], width: number, height: number) {
  const left = landmarks[234]
  const right = landmarks[454]
  const forehead = landmarks[10]
  const chin = landmarks[152]
  if (!left || !right || !forehead || !chin) return null
  const leftPoint = { x: left.x * width, y: left.y * height }
  const rightPoint = { x: right.x * width, y: right.y * height }
  return {
    centerX: (leftPoint.x + rightPoint.x) / 2,
    centerY: (forehead.y * height + chin.y * height) / 2,
    width: Math.hypot(rightPoint.x - leftPoint.x, rightPoint.y - leftPoint.y),
    height: Math.hypot((chin.x - forehead.x) * width, (chin.y - forehead.y) * height),
    angle: Math.atan2(rightPoint.y - leftPoint.y, rightPoint.x - leftPoint.x),
  }
}

function drawEye(
  context: CanvasRenderingContext2D,
  landmarks: FaceMaskLandmark[],
  indices: number[],
  width: number,
  height: number,
  blink: number,
  color: string,
) {
  if (!traceLandmarks(context, landmarks, indices, width, height)) return
  context.fillStyle = `rgba(8, 14, 18, ${0.5 + blink * 0.36})`
  context.fill()
  context.lineWidth = Math.max(2, width * 0.004)
  context.strokeStyle = color
  context.stroke()
}

function drawFoxMask(
  context: CanvasRenderingContext2D,
  landmarks: FaceMaskLandmark[],
  expression: FaceMaskExpression,
  width: number,
  height: number,
  timestamp: number,
) {
  const frame = faceFrame(landmarks, width, height)
  if (!frame || !traceLandmarks(context, landmarks, FACE_OVAL, width, height)) return
  const pulse = 0.72 + expression.smile * 0.28 + Math.sin(timestamp / 260) * 0.035
  const gradient = context.createLinearGradient(
    frame.centerX - frame.width / 2,
    frame.centerY,
    frame.centerX + frame.width / 2,
    frame.centerY,
  )
  gradient.addColorStop(0, `rgba(255, 79, 140, ${0.23 * pulse})`)
  gradient.addColorStop(0.5, 'rgba(31, 19, 48, 0.34)')
  gradient.addColorStop(1, `rgba(45, 220, 255, ${0.25 * pulse})`)
  context.fillStyle = gradient
  context.fill()
  context.lineWidth = Math.max(2, frame.width * 0.018)
  context.strokeStyle = '#65efff'
  context.shadowColor = '#23d7ff'
  context.shadowBlur = 14 + expression.smile * 18
  context.stroke()
  context.shadowBlur = 0

  context.save()
  context.translate(frame.centerX, frame.centerY)
  context.rotate(frame.angle)
  const earLift = 1 + expression.browRaise * 0.24
  context.fillStyle = 'rgba(24, 16, 42, 0.78)'
  context.strokeStyle = '#ff5ca8'
  context.lineWidth = Math.max(2, frame.width * 0.016)
  for (const side of [-1, 1]) {
    context.beginPath()
    context.moveTo(side * frame.width * 0.22, -frame.height * 0.34)
    context.lineTo(side * frame.width * 0.42, -frame.height * 0.66 * earLift)
    context.lineTo(side * frame.width * 0.48, -frame.height * 0.2)
    context.closePath()
    context.fill()
    context.stroke()
  }
  context.restore()

  drawEye(context, landmarks, LEFT_EYE, width, height, expression.blinkLeft, '#ff72b5')
  drawEye(context, landmarks, RIGHT_EYE, width, height, expression.blinkRight, '#6cecff')

  const nose = landmarks[1]
  if (nose) {
    context.fillStyle = '#ff76b8'
    context.beginPath()
    context.arc(nose.x * width, nose.y * height, frame.width * 0.038, 0, Math.PI * 2)
    context.fill()
  }

  const mouthScale = 1 + expression.mouthOpen * 0.35
  context.save()
  context.translate(frame.centerX, frame.centerY + frame.height * 0.28)
  context.scale(1, mouthScale)
  context.strokeStyle = expression.mouthOpen > 0.34 ? '#fff06a' : '#ff8ac2'
  context.lineWidth = Math.max(2, frame.width * 0.018)
  context.beginPath()
  context.arc(0, 0, frame.width * (0.1 + expression.smile * 0.06), 0.15 * Math.PI, 0.85 * Math.PI)
  context.stroke()
  context.restore()

  context.strokeStyle = 'rgba(162, 245, 255, 0.85)'
  context.lineWidth = Math.max(1, frame.width * 0.008)
  for (const side of [-1, 1]) {
    for (let row = -1; row <= 1; row += 1) {
      context.beginPath()
      context.moveTo(frame.centerX + side * frame.width * 0.16, frame.centerY + frame.height * (0.1 + row * 0.045))
      context.lineTo(frame.centerX + side * frame.width * 0.62, frame.centerY + frame.height * (0.07 + row * 0.08))
      context.stroke()
    }
  }
}

function drawMechaMask(
  context: CanvasRenderingContext2D,
  landmarks: FaceMaskLandmark[],
  expression: FaceMaskExpression,
  width: number,
  height: number,
  timestamp: number,
) {
  const frame = faceFrame(landmarks, width, height)
  if (!frame) return
  context.save()
  context.translate(frame.centerX, frame.centerY)
  context.rotate(frame.angle)
  const unit = frame.width
  const browOffset = expression.browRaise * frame.height * 0.08
  context.fillStyle = 'rgba(8, 18, 22, 0.64)'
  context.strokeStyle = '#6fffc2'
  context.lineWidth = Math.max(2, unit * 0.014)
  context.beginPath()
  context.moveTo(-unit * 0.48, -frame.height * 0.2 - browOffset)
  context.lineTo(-unit * 0.24, -frame.height * 0.35 - browOffset)
  context.lineTo(unit * 0.24, -frame.height * 0.35 - browOffset)
  context.lineTo(unit * 0.48, -frame.height * 0.2 - browOffset)
  context.lineTo(unit * 0.4, frame.height * 0.06)
  context.lineTo(-unit * 0.4, frame.height * 0.06)
  context.closePath()
  context.fill()
  context.stroke()

  const scanX = -unit * 0.3 + ((timestamp / 9) % (unit * 0.6))
  context.strokeStyle = 'rgba(167, 255, 226, 0.75)'
  context.lineWidth = Math.max(1, unit * 0.007)
  context.beginPath()
  context.moveTo(scanX, -frame.height * 0.31 - browOffset)
  context.lineTo(scanX, frame.height * 0.01)
  context.stroke()

  const jawDrop = expression.mouthOpen * frame.height * 0.16
  context.fillStyle = 'rgba(12, 26, 30, 0.78)'
  context.strokeStyle = expression.mouthOpen > 0.34 ? '#ffcf55' : '#38dba0'
  context.beginPath()
  context.moveTo(-unit * 0.37, frame.height * 0.1)
  context.lineTo(-unit * 0.25, frame.height * 0.34 + jawDrop)
  context.lineTo(0, frame.height * 0.48 + jawDrop)
  context.lineTo(unit * 0.25, frame.height * 0.34 + jawDrop)
  context.lineTo(unit * 0.37, frame.height * 0.1)
  context.lineTo(unit * 0.18, frame.height * 0.2)
  context.lineTo(-unit * 0.18, frame.height * 0.2)
  context.closePath()
  context.fill()
  context.stroke()

  context.fillStyle = '#8dffe0'
  for (const side of [-1, 1]) {
    const blink = side < 0 ? expression.blinkLeft : expression.blinkRight
    context.fillRect(side * unit * 0.11 - unit * 0.08, -frame.height * 0.15, unit * 0.16, Math.max(2, unit * 0.022 * (1 - blink * 0.75)))
  }
  context.restore()
}

function drawFestivalMask(
  context: CanvasRenderingContext2D,
  landmarks: FaceMaskLandmark[],
  expression: FaceMaskExpression,
  width: number,
  height: number,
  timestamp: number,
) {
  const frame = faceFrame(landmarks, width, height)
  if (!frame) return
  context.save()
  context.translate(frame.centerX, frame.centerY)
  context.rotate(frame.angle)
  const lift = expression.browRaise * frame.height * 0.09
  const gradient = context.createLinearGradient(-frame.width * 0.5, 0, frame.width * 0.5, 0)
  gradient.addColorStop(0, 'rgba(114, 70, 255, 0.72)')
  gradient.addColorStop(0.5, 'rgba(231, 61, 178, 0.72)')
  gradient.addColorStop(1, 'rgba(255, 171, 47, 0.76)')
  context.fillStyle = gradient
  context.strokeStyle = '#ffe6a8'
  context.lineWidth = Math.max(2, frame.width * 0.012)
  context.beginPath()
  context.moveTo(-frame.width * 0.5, -frame.height * 0.12 - lift)
  context.quadraticCurveTo(0, -frame.height * 0.48 - lift, frame.width * 0.5, -frame.height * 0.12 - lift)
  context.quadraticCurveTo(frame.width * 0.32, frame.height * 0.18, 0, frame.height * 0.04)
  context.quadraticCurveTo(-frame.width * 0.32, frame.height * 0.18, -frame.width * 0.5, -frame.height * 0.12 - lift)
  context.fill()
  context.stroke()
  context.restore()

  drawEye(context, landmarks, LEFT_EYE, width, height, expression.blinkLeft, '#fff3bd')
  drawEye(context, landmarks, RIGHT_EYE, width, height, expression.blinkRight, '#fff3bd')

  if (expression.smile > 0.28) {
    const sparkleCount = 5
    context.fillStyle = `rgba(255, 241, 154, ${0.45 + expression.smile * 0.5})`
    for (let index = 0; index < sparkleCount; index += 1) {
      const angle = timestamp / 520 + index * (Math.PI * 2 / sparkleCount)
      const radius = frame.width * (0.52 + expression.smile * 0.12)
      const x = frame.centerX + Math.cos(angle) * radius
      const y = frame.centerY + Math.sin(angle * 1.3) * frame.height * 0.42
      const size = frame.width * (0.012 + (index % 2) * 0.008)
      context.beginPath()
      context.moveTo(x, y - size)
      context.lineTo(x + size * 0.35, y - size * 0.35)
      context.lineTo(x + size, y)
      context.lineTo(x + size * 0.35, y + size * 0.35)
      context.lineTo(x, y + size)
      context.lineTo(x - size * 0.35, y + size * 0.35)
      context.lineTo(x - size, y)
      context.lineTo(x - size * 0.35, y - size * 0.35)
      context.closePath()
      context.fill()
    }
  }

  if (traceLandmarks(context, landmarks, OUTER_LIPS, width, height)) {
    context.strokeStyle = expression.mouthOpen > 0.3 ? '#fff09a' : 'rgba(255, 230, 168, 0.72)'
    context.lineWidth = Math.max(2, frame.width * (0.01 + expression.mouthOpen * 0.012))
    context.stroke()
  }
}

export function drawFaceMask(
  context: CanvasRenderingContext2D,
  landmarks: FaceMaskLandmark[],
  expression: FaceMaskExpression,
  style: FaceMaskStyle,
  width: number,
  height: number,
  timestamp: number,
) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (style === 'mecha') drawMechaMask(context, landmarks, expression, width, height, timestamp)
  else if (style === 'festival') drawFestivalMask(context, landmarks, expression, width, height, timestamp)
  else drawFoxMask(context, landmarks, expression, width, height, timestamp)
  context.restore()
}
