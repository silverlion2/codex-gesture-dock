function createRecoveryLimiter({
  limit = 2,
  windowMs = 60_000,
  now = Date.now,
} = {}) {
  let startedAt = null
  let count = 0

  return {
    record() {
      const current = now()
      if (startedAt === null || current - startedAt > windowMs) {
        startedAt = current
        count = 0
      }
      count += 1
      return {
        attempt: count,
        exhausted: count > limit,
      }
    },
  }
}

module.exports = { createRecoveryLimiter }
