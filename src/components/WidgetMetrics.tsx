import type { TrendPoint } from '../hooks/usePoseMonitor'
import { formatDuration } from '../lib/format'
import type { PostureStatus } from '../lib/posture'

interface WidgetMetricsProps {
  score: number | null
  status: PostureStatus
  sessionSeconds: number
  awayCount: number
  trend: TrendPoint[]
}

function trendPolyline(points: TrendPoint[]) {
  if (points.length === 0) return ''
  const yForStatus = { good: 20, fair: 50, poor: 80 }
  return points
    .map((point, index) => {
      const x = points.length === 1 ? 100 : (index / (points.length - 1)) * 100
      return `${x},${yForStatus[point.status]}`
    })
    .join(' ')
}

export function WidgetMetrics({
  score,
  status,
  sessionSeconds,
  awayCount,
  trend,
}: WidgetMetricsProps) {
  const recentTrend = trend.slice(-24)

  return (
    <>
      <section className={`widget-metrics status-${status}`} aria-label="本次数据">
        <strong className="widget-score">{score ?? '—'}</strong>
        <div>
          <span>本次</span>
          <strong>{formatDuration(sessionSeconds)}</strong>
        </div>
        <div>
          <span>离席</span>
          <strong>{awayCount} 次</strong>
        </div>
      </section>

      <section className="mini-trend" aria-label="最近坐姿趋势">
        <div className="mini-trend-heading">
          <strong>坐姿趋势</strong>
          <span>最近 {Math.min(recentTrend.length, 24)} 秒</span>
        </div>
        {recentTrend.length === 0 ? (
          <div className="mini-trend-empty">完成校准后开始记录</div>
        ) : (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" x2="100" y1="20" y2="20" />
            <line x1="0" x2="100" y1="50" y2="50" />
            <line x1="0" x2="100" y1="80" y2="80" />
            <polyline points={trendPolyline(recentTrend)} />
          </svg>
        )}
      </section>
    </>
  )
}
