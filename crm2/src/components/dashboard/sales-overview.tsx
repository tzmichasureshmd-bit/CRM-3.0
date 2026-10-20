"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Users, Target, DollarSign, Trophy, TrendingUp, Layers } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Skeleton } from '@/components/dashboard/skeleton'
import { formatCurrency } from '@/lib/currency'
import type { SalesOverviewResponse } from '@/lib/dashboard/types'

interface SalesOverviewProps {
  defaultCurrency: string
}

const SOURCE_COLORS: Record<string, string> = {
  facebook:    '#1877F2',
  instagram:   '#E1306C',
  whatsapp:    '#25D366',
  google_form: '#f59e0b',
  website:     '#7c3aed',
  manual:      '#64748b',
}

export function SalesOverview({ defaultCurrency }: SalesOverviewProps) {
  const t = useTranslations('Dashboard.salesOverview')
  const [data, setData] = useState<SalesOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch('/api/dashboard/sales-overview', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (active) setData(d) })
      .catch((err) => console.error('[dashboard] sales overview failed:', err))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const cards = data?.cards
  const hasDeals = (data?.dealsByMonth ?? []).some((m) => m.open > 0 || m.won > 0 || m.lost > 0)
  const hasSources = (data?.sources ?? []).some((s) => s.count > 0)

  return (
    <section className="space-y-4">
      {/* ── Colorful metric cards ── */}
      <div className="grid grid-cols-2 gap-3">
        {loading || !cards ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <GradientCard
              icon={Users}
              gradient="from-[#3462EE] to-[#5b7ff5]"
              label={t('totalLeads')}
              value={cards.totalLeads.toLocaleString()}
            />
            <GradientCard
              icon={Target}
              gradient="from-[#10b981] to-[#34d399]"
              label={t('qualifiedLeads')}
              value={cards.qualifiedLeads.toLocaleString()}
            />
            <GradientCard
              icon={DollarSign}
              gradient="from-[#f59e0b] to-[#fbbf24]"
              label={t('openPipelineValue')}
              value={formatCurrency(cards.openDealsValue, defaultCurrency)}
            />
            <GradientCard
              icon={Trophy}
              gradient="from-[#7c3aed] to-[#a78bfa]"
              label={t('wonValue')}
              value={formatCurrency(cards.wonDealsValue, defaultCurrency)}
              sub={cards.winRate !== null ? t('winRate', { rate: cards.winRate }) : undefined}
            />
          </>
        )}
      </div>

      {/* ── Deals by month chart ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t('dealsByMonth')}</h3>
        </div>
        {loading || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasDeals ? (
          <EmptyState icon={Layers} title={t('noDeals')} hint={t('noDealsHint')} />
        ) : (
          <StackedBarChart data={data.dealsByMonth} t={t} />
        )}
      </div>

      {/* ── Lead sources ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t('leadSources')}</h3>
        </div>
        {loading || !data ? (
          <Skeleton className="h-32 w-full" />
        ) : !hasSources ? (
          <EmptyState icon={Users} title={t('noSources')} hint={t('noSourcesHint')} />
        ) : (
          <SourceList sources={data.sources} t={t} />
        )}
      </div>
    </section>
  )
}

// ── Colorful gradient metric card ──────────────────────────────
function GradientCard({
  icon: Icon, gradient, label, value, sub,
}: {
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradient} p-4`}>
      <div className="absolute -right-3 -top-3 h-12 w-12 rounded-full bg-white/10" />
      <div className="relative">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
          <Icon className="h-4 w-4 text-white" />
        </div>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-white/70">{label}</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums text-white leading-tight">{value}</p>
        {sub && <p className="mt-0.5 text-[10px] text-white/70">{sub}</p>}
      </div>
    </div>
  )
}

// ── Custom SVG stacked bar chart ────────────────────────────────
function StackedBarChart({
  data,
  t,
}: {
  data: SalesOverviewResponse['dealsByMonth']
  t: ReturnType<typeof useTranslations<'Dashboard.salesOverview'>>
}) {
  const VB_W = 400
  const VB_H = 160
  const PAD = { top: 8, right: 8, bottom: 28, left: 28 }
  const chartW = VB_W - PAD.left - PAD.right
  const chartH = VB_H - PAD.top - PAD.bottom

  const maxVal = Math.max(...data.map((d) => d.open + d.won + d.lost), 1)
  const barW = Math.floor((chartW / data.length) * 0.55)
  const gap = chartW / data.length

  const COLORS = { open: '#f59e0b', won: '#10b981', lost: '#ef4444' }

  return (
    <div>
      {/* Legend */}
      <div className="mb-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        {(['open', 'won', 'lost'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} />
            {t(`chart${k.charAt(0).toUpperCase() + k.slice(1)}` as 'chartOpen')}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-48 w-full">
        {/* Gridlines */}
        {[0, 0.5, 1].map((frac) => {
          const y = PAD.top + chartH * (1 - frac)
          return (
            <g key={frac}>
              <line x1={PAD.left} x2={VB_W - PAD.right} y1={y} y2={y}
                stroke="var(--border)" strokeDasharray={frac === 0 ? undefined : '3 3'} strokeWidth={0.8} />
              <text x={PAD.left - 4} y={y} textAnchor="end" dominantBaseline="middle"
                style={{ fontSize: 9, fill: 'var(--muted-foreground)' }}>
                {Math.round(maxVal * frac)}
              </text>
            </g>
          )
        })}

        {data.map((d, i) => {
          const x = PAD.left + gap * i + gap / 2 - barW / 2
          const segments = [
            { key: 'lost' as const, val: d.lost },
            { key: 'won' as const, val: d.won },
            { key: 'open' as const, val: d.open },
          ]
          let yOffset = PAD.top + chartH
          return (
            <g key={d.label}>
              {segments.map(({ key, val }) => {
                if (val === 0) return null
                const h = (val / maxVal) * chartH
                yOffset -= h
                return (
                  <rect key={key} x={x} y={yOffset} width={barW} height={h}
                    rx={key === 'open' ? 3 : 0}
                    fill={COLORS[key]} opacity={0.9} />
                )
              })}
              <text x={x + barW / 2} y={VB_H - 6} textAnchor="middle"
                style={{ fontSize: 9, fill: 'var(--muted-foreground)' }}>
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Source list with colored bars ──────────────────────────────
function SourceList({
  sources, t,
}: {
  sources: { key: string; count: number }[]
  t: ReturnType<typeof useTranslations<'Dashboard.salesOverview'>>
}) {
  const total = sources.reduce((sum, s) => sum + s.count, 0)
  return (
    <ul className="space-y-2.5">
      {sources.map((s) => {
        const pct = total > 0 ? Math.round((s.count / total) * 100) : 0
        const color = SOURCE_COLORS[s.key] ?? '#64748b'
        return (
          <li key={s.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                {t(`source.${s.key}` as 'source.facebook', {
                  fallback: s.key.charAt(0).toUpperCase() + s.key.slice(1),
                })}
              </span>
              <span className="tabular-nums text-muted-foreground">{s.count} · {pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(pct, 2)}%`, background: color }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl bg-muted p-4 h-24 animate-pulse" />
  )
}
