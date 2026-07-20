export function formatDuration(totalSeconds: number) {
  if (totalSeconds < 60) return `${Math.floor(totalSeconds)} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}
