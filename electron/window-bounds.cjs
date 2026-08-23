function isFiniteInteger(value) {
  return Number.isInteger(value) && Number.isFinite(value)
}

function sanitizeBounds(value) {
  if (!value || typeof value !== 'object') return null
  const { x, y, width, height } = value
  if (
    !isFiniteInteger(x) ||
    !isFiniteInteger(y) ||
    !isFiniteInteger(width) ||
    !isFiniteInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { x, y, width, height }
}

function parseWidgetWindowState(value) {
  if (!value || typeof value !== 'object') {
    return { minimal: null, collapsed: null, expanded: null }
  }
  return {
    minimal: sanitizeBounds(value.minimal),
    collapsed: sanitizeBounds(value.collapsed),
    expanded: sanitizeBounds(value.expanded),
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function constrainBounds(
  bounds,
  workArea,
  { defaultSize, minSize = defaultSize, fixedSize = false },
) {
  const clean = sanitizeBounds(bounds)
  if (!clean) return null

  const width = fixedSize
    ? defaultSize.width
    : clamp(clean.width, minSize.width, workArea.width)
  const height = fixedSize
    ? defaultSize.height
    : clamp(clean.height, minSize.height, workArea.height)
  const maximumX = workArea.x + Math.max(0, workArea.width - width)
  const maximumY = workArea.y + Math.max(0, workArea.height - height)

  return {
    x: clamp(clean.x, workArea.x, maximumX),
    y: clamp(clean.y, workArea.y, maximumY),
    width,
    height,
  }
}

module.exports = {
  constrainBounds,
  parseWidgetWindowState,
  sanitizeBounds,
}
