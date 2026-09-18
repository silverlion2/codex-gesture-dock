// Based on the published One Euro filter algorithm:
// https://gery.casiez.net/1euro/ and
// https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/util/filtering/one_euro_filter.cc

export interface OneEuroFilterState {
  value: number
  derivative: number
  timestampSeconds: number
}

export interface OneEuroFilterOptions {
  minCutoff?: number
  beta?: number
  derivativeCutoff?: number
  maxGapSeconds?: number
}

export interface OneEuroFilterResult {
  state: OneEuroFilterState | null
  value: number | null
  reset: boolean
}

const TAU_SCALE = 2 * Math.PI
const DEFAULT_MIN_CUTOFF = 1
const DEFAULT_BETA = 4
const DEFAULT_DERIVATIVE_CUTOFF = 1
export const ONE_EURO_MAX_GAP_SECONDS = 0.5

function alpha(cutoff: number, deltaSeconds: number) {
  const safeCutoff = Math.max(cutoff, Number.EPSILON)
  const tau = 1 / (TAU_SCALE * safeCutoff)
  return 1 / (1 + tau / deltaSeconds)
}

function lowPass(previous: number, next: number, weight: number) {
  return previous + weight * (next - previous)
}

export function advanceOneEuroFilter(
  previous: OneEuroFilterState | null,
  input: number,
  timestampSeconds: number,
  options: OneEuroFilterOptions = {},
): OneEuroFilterResult {
  if (!Number.isFinite(input) || !Number.isFinite(timestampSeconds)) {
    return { state: null, value: null, reset: true }
  }

  const minCutoff = Math.max(options.minCutoff ?? DEFAULT_MIN_CUTOFF, Number.EPSILON)
  const beta = Math.max(options.beta ?? DEFAULT_BETA, 0)
  const derivativeCutoff = Math.max(
    options.derivativeCutoff ?? DEFAULT_DERIVATIVE_CUTOFF,
    Number.EPSILON,
  )
  const maxGapSeconds = Math.max(
    options.maxGapSeconds ?? ONE_EURO_MAX_GAP_SECONDS,
    Number.EPSILON,
  )

  if (
    previous === null ||
    !Number.isFinite(previous.value) ||
    !Number.isFinite(previous.derivative) ||
    !Number.isFinite(previous.timestampSeconds)
  ) {
    const state = { value: input, derivative: 0, timestampSeconds }
    return { state, value: input, reset: true }
  }

  const deltaSeconds = timestampSeconds - previous.timestampSeconds
  if (deltaSeconds <= 0 || deltaSeconds > maxGapSeconds) {
    const state = { value: input, derivative: 0, timestampSeconds }
    return { state, value: input, reset: true }
  }

  const rawDerivative = (input - previous.value) / deltaSeconds
  const derivative = lowPass(
    previous.derivative,
    rawDerivative,
    alpha(derivativeCutoff, deltaSeconds),
  )
  const cutoff = minCutoff + beta * Math.abs(derivative)
  const value = lowPass(previous.value, input, alpha(cutoff, deltaSeconds))
  return {
    state: { value, derivative, timestampSeconds },
    value,
    reset: false,
  }
}
