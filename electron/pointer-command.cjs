const POINTER_INPUT_MARGIN = 0.08

function validWorkArea(value) {
  return Boolean(
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0,
  )
}

function mapNormalizedPointerCommand(value, workArea) {
  if (!value || typeof value !== 'object') return null
  if (value.kind === 'click') return { kind: 'click' }
  if (value.kind === 'scroll') {
    return value.delta === -1 || value.delta === 1
      ? { kind: 'scroll', delta: value.delta }
      : null
  }
  if (
    value.kind !== 'move' ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1 ||
    !validWorkArea(workArea)
  ) return null

  const usableRange = 1 - POINTER_INPUT_MARGIN * 2
  const normalize = (coordinate) => Math.max(
    0,
    Math.min(1, (coordinate - POINTER_INPUT_MARGIN) / usableRange),
  )
  return {
    kind: 'move',
    x: Math.round(workArea.x + normalize(value.x) * Math.max(0, workArea.width - 1)),
    y: Math.round(workArea.y + normalize(value.y) * Math.max(0, workArea.height - 1)),
  }
}

module.exports = { mapNormalizedPointerCommand }
