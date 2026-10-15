"use client"

import { Clock } from 'lucide-react'
import { DOW_SHORT_MON_FIRST } from '@/lib/dashboard/date-utils'
import type { ResponseTimeSummary } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { useTranslations } from 'next-intl'

interface ResponseTimeChartProps {
  data: ResponseTimeSummary | null
  loading: boolean
  thresholdMinutes?: number
}

export function ResponseTimeChart({
  data,
  loading,
  thresholdMinutes = 5,
}: ResponseTimeChartProps) {
  const t = useTranslations('Dashboard.responseTimeChart')
  const hasData = data?.buckets.some((b) => b.avgMinutes != null) ?? false

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-3 text-right text-xs">
          {thresholdMinutes > 0 && (
            <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-500 tabular-nums">
              {t('target', { minutes: thresholdMinutes })}
            </span>
          )}
          {data && (data.thisWeekAvg != null || data.lastWeekAvg != null) && (
            <div>
              <div className="text-muted-foreground">
                {t('thisWeek')}{' '}
                <span className="font-medium text-foreground tabular-nums">{fmt(data.thisWeekAvg)}</span>
              </div>
              <div className="text-muted-foreground">
                {t('lastWeek')}{' '}
                <span className="tabular-nums text-foreground">{fmt(data.lastWeekAvg)}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="p-5">
        {loading || !data ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasData ? (
          <EmptyState icon={Clock} title={t('noReplies')} hint={t('noRepliesHint')} />
        ) : (
          <CustomBarChart buckets={data.buckets} />
        )}
      </div>
    </section>
  )
}

// ── Custom SVG bar chart — fully dark-mode aware ──────────────
function CustomBarChart({ buckets }: { buckets: ResponseTimeSummary['buckets'] }) {
  const VB_W = 560
  const VB_H = 220
  const PAD = { top: 12, right: 8, bottom: 32, left: 44 }
  const chartW = VB_W - PAD.left - PAD.right
  const chartH = VB_H - PAD.top - PAD.bottom

  const values = buckets.map((b) => b.avgMinutes ?? 0)
  const maxVal = Math.max(...values, 0.1)
  const niceCeil = (v: number) => {
    if (v <= 0) return 1
    const p = Math.pow(10, Math.floor(Math.log10(v)))
    const n = v / p
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
    return nice * p
  }
  const ceil = niceCeil(maxVal)
  const ticks = [0, ceil * 0.25, ceil * 0.5, ceil * 0.75, ceil].map((v) =>
    parseFloat(v.toFixed(2))
  )

  const barW = Math.floor(chartW / buckets.length * 0.55)
  const gap = chartW / buckets.length

  const xFor = (i: number) => PAD.left + gap * i + gap / 2
  const yFor = (v: number) => PAD.top + chartH - (v / ceil) * chartH
  const hFor = (v: number) => (v / ceil) * chartH

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="h-[260px] w-full"
      aria-label="Average first response time by weekday"
    >
      {/* Gridlines + Y labels */}
      {ticks.map((tick) => {
        const y = yFor(tick)
        return (
          <g key={tick}>
            <line
              x1={PAD.left} x2={VB_W - PAD.right}
              y1={y} y2={y}
              stroke="var(--border)"
              strokeDasharray={tick === 0 ? undefined : '3 3'}
              strokeWidth={tick === 0 ? 1 : 0.8}
            />
            <text
              x={PAD.left - 6}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              style={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            >
              {tick.toFixed(1)}m
            </text>
          </g>
        )
      })}

      {/* Bars + X labels */}
      {buckets.map((b, i) => {
        const v = b.avgMinutes ?? 0
        const x = xFor(i)
        const h = Math.max(hFor(v), v > 0 ? 2 : 0)
        const y = yFor(v)
        return (
          <g key={i}>
            {/* bar */}
            <rect
              x={x - barW / 2}
              y={y}
              width={barW}
              height={h}
              rx={3}
              fill="var(--primary)"
              opacity={v > 0 ? 0.85 : 0.15}
            />
            {/* value label above bar */}
            {v > 0 && (
              <text
                x={x}
                y={y - 4}
                textAnchor="middle"
                style={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
              >
                {v < 1 ? `${Math.round(v * 60)}s` : `${v.toFixed(1)}m`}
              </text>
            )}
            {/* X axis label */}
            <text
              x={x}
              y={VB_H - 6}
              textAnchor="middle"
              style={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            >
              {DOW_SHORT_MON_FIRST[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function fmt(mins: number | null): string {
  if (mins == null) return '—'
  if (mins < 1) return `${Math.max(1, Math.round(mins * 60))}s`
  if (mins < 60) return `${mins.toFixed(1)}m`
  return `${(mins / 60).toFixed(1)}h`
}
