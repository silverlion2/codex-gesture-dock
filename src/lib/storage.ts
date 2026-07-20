interface DailyStats {
  date: string
  goodSeconds: number
  trackedSeconds: number
}

const STORAGE_KEY = 'duanzheng.daily-stats.v1'

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function emptyStats(): DailyStats {
  return { date: todayKey(), goodSeconds: 0, trackedSeconds: 0 }
}

function isValidCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isDailyStats(value: unknown): value is DailyStats {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DailyStats>
  return (
    typeof candidate.date === 'string' &&
    isValidCounter(candidate.goodSeconds) &&
    isValidCounter(candidate.trackedSeconds) &&
    candidate.goodSeconds <= candidate.trackedSeconds
  )
}

export function loadDailyStats(): DailyStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStats()
    const parsed: unknown = JSON.parse(raw)
    return isDailyStats(parsed) && parsed.date === todayKey()
      ? parsed
      : emptyStats()
  } catch {
    return emptyStats()
  }
}

export function addDailySample(isGood: boolean): DailyStats {
  const current = loadDailyStats()
  const next = {
    ...current,
    goodSeconds: current.goodSeconds + (isGood ? 1 : 0),
    trackedSeconds: current.trackedSeconds + 1,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Monitoring should continue even when storage is unavailable or full.
  }
  return next
}

export function ratioFromStats(stats: DailyStats): number {
  if (stats.trackedSeconds === 0) return 0
  return Math.round((stats.goodSeconds / stats.trackedSeconds) * 100)
}
