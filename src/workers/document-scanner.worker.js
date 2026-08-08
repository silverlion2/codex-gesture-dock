/* OpenCV runs in a dedicated classic worker so its Emscripten runtime cannot
   weaken the renderer's Content Security Policy or block the interface. */

let openCvPromise = null

function loadOpenCv() {
  if (openCvPromise) return openCvPromise
  openCvPromise = new Promise((resolve, reject) => {
    try {
      importScripts('opencv.js')
      const runtime = self.cv
      if (!runtime) {
        reject(new Error('OpenCV worker runtime was not created'))
        return
      }
      if (typeof runtime.then === 'function') {
        runtime.then(resolve, reject)
        return
      }
      if (runtime.Mat) {
        resolve(runtime)
        return
      }
      const timeout = self.setTimeout(() => reject(new Error('OpenCV worker initialization timed out')), 20_000)
      runtime.onRuntimeInitialized = () => {
        self.clearTimeout(timeout)
        resolve(runtime)
      }
    } catch (error) {
      reject(error)
    }
  }).catch((error) => {
    openCvPromise = null
    throw error
  })
  return openCvPromise
}

function orderCorners(points) {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y))
  const byDifference = [...points].sort((a, b) => a.x - a.y - (b.x - b.y))
  const ordered = {
    topLeft: bySum[0],
    topRight: byDifference[3],
    bottomRight: bySum[3],
    bottomLeft: byDifference[0],
  }
  if (new Set(Object.values(ordered)).size === 4) return ordered
  const byY = [...points].sort((a, b) => a.y - b.y)
  const top = byY.slice(0, 2).sort((a, b) => a.x - b.x)
  const bottom = byY.slice(2).sort((a, b) => a.x - b.x)
  return { topLeft: top[0], topRight: top[1], bottomRight: bottom[1], bottomLeft: bottom[0] }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function outputSize(corners, maxDimension = 2200) {
  const naturalWidth = Math.max(
    distance(corners.topLeft, corners.topRight),
    distance(corners.bottomLeft, corners.bottomRight),
  )
  const naturalHeight = Math.max(
    distance(corners.topLeft, corners.bottomLeft),
    distance(corners.topRight, corners.bottomRight),
  )
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight))
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

function insetCorners(width, height) {
  const insetX = Math.round(width * 0.015)
  const insetY = Math.round(height * 0.015)
  return {
    topLeft: { x: insetX, y: insetY },
    topRight: { x: width - insetX, y: insetY },
    bottomRight: { x: width - insetX, y: height - insetY },
    bottomLeft: { x: insetX, y: height - insetY },
  }
}

function findCorners(cv, source) {
  const detectionScale = Math.min(1, 1200 / Math.max(source.cols, source.rows))
  const resized = new cv.Mat()
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  let bestPoints = null
  let bestArea = 0

  try {
    cv.resize(
      source,
      resized,
      new cv.Size(Math.round(source.cols * detectionScale), Math.round(source.rows * detectionScale)),
      0,
      0,
      cv.INTER_AREA,
    )
    cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edges, 55, 165)
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    const minimumArea = resized.cols * resized.rows * 0.12
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index)
      const approximation = new cv.Mat()
      try {
        const perimeter = cv.arcLength(contour, true)
        cv.approxPolyDP(contour, approximation, perimeter * 0.025, true)
        if (approximation.rows !== 4 || !cv.isContourConvex(approximation)) continue
        const area = Math.abs(cv.contourArea(approximation))
        if (area < minimumArea || area <= bestArea) continue
        const points = []
        for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) {
          points.push({
            x: approximation.data32S[pointIndex * 2] / detectionScale,
            y: approximation.data32S[pointIndex * 2 + 1] / detectionScale,
          })
        }
        bestArea = area
        bestPoints = points
      } finally {
        approximation.delete()
        contour.delete()
      }
    }
  } finally {
    resized.delete()
    gray.delete()
    blurred.delete()
    edges.delete()
    contours.delete()
    hierarchy.delete()
  }

  return bestPoints
    ? { corners: orderCorners(bestPoints), autoDetected: true }
    : { corners: insetCorners(source.cols, source.rows), autoDetected: false }
}

function enhance(cv, warped, filter) {
  if (filter === 'color') return warped.clone()
  const gray = new cv.Mat()
  const output = new cv.Mat()
  try {
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY)
    if (filter === 'document') {
      const binary = new cv.Mat()
      try {
        cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 12)
        cv.cvtColor(binary, output, cv.COLOR_GRAY2RGBA)
      } finally {
        binary.delete()
      }
    } else {
      cv.cvtColor(gray, output, cv.COLOR_GRAY2RGBA)
    }
    return output
  } finally {
    gray.delete()
  }
}

async function processScan(message) {
  const cv = await loadOpenCv()
  self.postMessage({ type: 'progress', id: message.id, message: '正在检测纸张边缘' })
  const source = new cv.Mat(message.height, message.width, cv.CV_8UC4)
  source.data.set(new Uint8ClampedArray(message.pixels))
  const warped = new cv.Mat()
  let enhanced = null
  let transform = null
  let sourcePoints = null
  let destinationPoints = null

  try {
    const detection = findCorners(cv, source)
    const { width, height } = outputSize(detection.corners)
    const { topLeft, topRight, bottomRight, bottomLeft } = detection.corners
    sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      topLeft.x, topLeft.y,
      topRight.x, topRight.y,
      bottomRight.x, bottomRight.y,
      bottomLeft.x, bottomLeft.y,
    ])
    destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      width - 1, 0,
      width - 1, height - 1,
      0, height - 1,
    ])
    transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints)
    cv.warpPerspective(
      source,
      warped,
      transform,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
      new cv.Scalar(),
    )
    self.postMessage({ type: 'progress', id: message.id, message: '正在增强扫描图' })
    enhanced = enhance(cv, warped, message.filter)
    const output = new Uint8ClampedArray(enhanced.data)
    self.postMessage({
      type: 'result',
      id: message.id,
      width,
      height,
      autoDetected: detection.autoDetected,
      pixels: output.buffer,
    }, [output.buffer])
  } finally {
    source.delete()
    warped.delete()
    enhanced?.delete()
    transform?.delete()
    sourcePoints?.delete()
    destinationPoints?.delete()
  }
}

self.addEventListener('message', (event) => {
  void processScan(event.data).catch((error) => {
    self.postMessage({
      type: 'error',
      id: event.data.id,
      message: error instanceof Error ? error.message : String(error),
    })
  })
})
