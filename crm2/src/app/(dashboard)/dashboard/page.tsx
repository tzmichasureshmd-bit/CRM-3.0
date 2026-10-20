"use client"

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'
import {
  endExclusiveISO,
  formatRangeLabel,
  previousPeriod,
  rangeFromSearchParams,
  resolvePreset,
  startISO,
  type RangeState,
} from '@/lib/date-range'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Send,
  WifiOff,
  Calendar,
  Users,
  TrendingUp,
  ChevronRight,
} from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeriesRange,
  loadMetrics,
  loadPipelineDonut,
  loadRecentConversations,
  loadResponseTime,
  loadPlatformCounts,
  loadRangeSummary,
  type RangeBounds,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  RangeSummary,
  ResponseTimeSummary,
  RecentConversation,
  PlatformChannelCounts,
} from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { SalesOverview } from '@/components/dashboard/sales-overview'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { RecentConversationsCard } from '@/components/dashboard/recent-conversations-card'
import { LeadStatCards, type LeadStats } from '@/components/social-media/lead-stat-cards'
import { RecentLeads, type RecentLead } from '@/components/social-media/recent-leads'
import { MessagesByChannel } from '@/components/dashboard/messages-by-channel'
import { DateRangeSelect, DeltaBadge } from '@/components/reports/date-range-select'

import { useTranslations } from 'next-intl'

// ── Platform brand icons (inline SVG, full HD crisp) ──────────
function PlatformBrandIcon({ platform, size = 22 }: { platform: string; size?: number }) {
  switch (platform) {
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" fill="white" width={size} height={size}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.845L.057 23.5l5.797-1.522A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.36-.214-3.717.976.993-3.63-.234-.373A9.818 9.818 0 1112 21.818z"/>
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="white" width={size} height={size}>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
        </svg>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" fill="white" width={size} height={size}>
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
      );
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" fill="white" width={size} height={size}>
          <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      );
    default:
      return null;
  }
}

// ── Platform channel cards config ──────────────────────────────
const PLATFORM_CARDS = [
  { key: 'whatsapp' as const, label: 'WhatsApp',  color: 'var(--chart-2)', abbr: 'WA' },
  { key: 'instagram' as const, label: 'Instagram', color: 'var(--chart-1)', abbr: 'IG' },
  { key: 'facebook' as const, label: 'Facebook',  color: 'var(--info)', abbr: 'FB' },
  { key: 'telegram' as const, label: 'Telegram',  color: 'var(--chart-3)', abbr: 'TG' },
]

// `useSearchParams` (the `?from=&to=&compare=` range below) needs a
// Suspense boundary or the production build bails to CSR and errors out.
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageInner />
    </Suspense>
  )
}

function DashboardPageInner() {
  const t = useTranslations('Dashboard.page')
  const { defaultCurrency, accountId, profile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  const [rangeState, setRangeState] = useState<RangeState>(
    () =>
      rangeFromSearchParams(new URLSearchParams(searchParams.toString())) ?? {
        range: resolvePreset('last30'),
        preset: 'last30',
        compare: false,
      },
  )
  const [seriesState, setSeriesState] = useState<{
    key: string
    data: ConversationsSeriesPoint[]
  } | null>(null)
  const [summaryState, setSummaryState] = useState<{
    key: string
    current: RangeSummary
    previous: RangeSummary | null
  } | null>(null)
  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)
  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)
  const [recentConversations, setRecentConversations] = useState<RecentConversation[] | null>(null)
  const [recentLoading, setRecentLoading] = useState(true)
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null)
  const [leadStatsLoading, setLeadStatsLoading] = useState(true)
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([])
  const [recentLeadsLoading, setRecentLeadsLoading] = useState(true)
  const [platformCounts, setPlatformCounts] = useState<PlatformChannelCounts | null>(null)
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(null)
  const [totalContacts, setTotalContacts] = useState<number | null>(null)
  const [totalConversations, setTotalConversations] = useState<number | null>(null)
  const [unassignedCount, setUnassignedCount] = useState<number | null>(null)
  const [overdueFollowUpsCount, setOverdueFollowUpsCount] = useState<number | null>(null)

  const loadLeads = useCallback(() => {
    fetch('/api/social-media/overview', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setLeadStats(d.stats ?? null); setRecentLeads(d.recentLeads ?? []) })
      .catch((err) => console.error('[dashboard] social overview failed:', err))
      .finally(() => { setLeadStatsLoading(false); setRecentLeadsLoading(false) })
  }, [])

  const loadAll = useCallback(() => {
    const db = createClient()
    void loadPlatformCounts(db).then(setPlatformCounts).catch(console.error)
    void loadMetrics(db).then((m) => setMetrics(m)).catch(console.error).finally(() => setMetricsLoading(false))
    void loadPipelineDonut(db).then((p) => setPipeline(p)).catch(console.error).finally(() => setPipelineLoading(false))
    void loadResponseTime(db).then((r) => setResponseTime(r)).catch(console.error).finally(() => setResponseTimeLoading(false))
    void loadActivity(db, 50).then((a) => setActivity(a)).catch(console.error).finally(() => setActivityLoading(false))
    void loadRecentConversations(db, 6).then((r) => setRecentConversations(r)).catch(console.error).finally(() => setRecentLoading(false))
    void (async () => { try { const { count } = await db.from('contacts').select('id', { count: 'exact', head: true }); setTotalContacts(count ?? 0) } catch { setTotalContacts(0) } })()
    void (async () => { try { const { count } = await db.from('conversations').select('id', { count: 'exact', head: true }); setTotalConversations(count ?? 0) } catch { setTotalConversations(0) } })()
    void (async () => { try { const { count } = await db.from('conversations').select('id', { count: 'exact', head: true }).is('assigned_agent_id', null).neq('status', 'closed'); setUnassignedCount(count ?? 0) } catch { setUnassignedCount(0) } })()
    void (async () => { try { const now = new Date().toISOString(); const { count } = await db.from('follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'pending').lt('due_date', now); setOverdueFollowUpsCount(count ?? 0) } catch { setOverdueFollowUpsCount(0) } })()
  }, [])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { loadLeads() }, [loadLeads])

  useEffect(() => {
    const check = async () => {
      if (!accountId) { setWhatsappConnected(false); return }
      const db = createClient()
      const { data } = await db.from('whatsapp_config').select('status').eq('account_id', accountId).limit(1)
      setWhatsappConnected(data?.[0]?.status === 'connected')
    }
    void check()
  }, [accountId])

  const { range, compare } = rangeState

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('from', range.from)
    params.set('to', range.to)
    if (compare) params.set('compare', '1')
    router.replace(`${pathname}?${params.toString()}`)
  }, [range, compare, pathname, router])

  const seriesKey = `${range.from}|${range.to}`
  const summaryKey = `${seriesKey}|${compare ? '1' : '0'}`
  const series = seriesState?.key === seriesKey ? seriesState.data : null
  const seriesLoading = series === null
  const rangeSummary = summaryState?.key === summaryKey ? summaryState : null
  const rangeSummaryLoading = rangeSummary === null

  useEffect(() => {
    const db = createClient()
    const start = startISO(range)
    const end = endExclusiveISO(range)
    if (!start || !end) return

    loadConversationsSeriesRange(db, range.from, range.to)
      .then((data) => setSeriesState({ key: seriesKey, data }))
      .catch((err) => {
        console.error('[dashboard] conversations series failed:', err)
        setSeriesState({ key: seriesKey, data: [] })
      })

    const prev = previousPeriod(range)
    const prevStart = startISO(prev)
    const prevEnd = endExclusiveISO(prev)
    const previousBounds: RangeBounds | null =
      compare && prevStart && prevEnd ? { start: prevStart, end: prevEnd } : null

    loadRangeSummary(db, { start, end }, previousBounds)
      .then((summary) => setSummaryState({ key: summaryKey, ...summary }))
      .catch((err) => {
        console.error('[dashboard] range summary failed:', err)
        setSummaryState({
          key: summaryKey,
          current: {
            messages: 0,
            newContacts: 0,
            newConversations: 0,
            newDeals: 0,
            dealValue: 0,
          },
          previous: null,
        })
      })
  }, [range, compare, seriesKey, summaryKey])

  const firstName = profile?.full_name?.split(' ')[0] ?? t('there')

  // Live clock — updates every minute so greeting + date stay current
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const greeting = (() => {
    const h = now.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-5">
      <OnboardingBanner />

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">
            {greeting}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{today}</span>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums text-primary font-semibold">{timeStr}</span>
          </div>
          {whatsappConnected === false && (
            <Link href="/settings?tab=whatsapp"
              className="inline-flex items-center gap-1.5 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning hover:bg-warning/20 transition-colors">
              <WifiOff className="h-3.5 w-3.5" />
              Connect WhatsApp
            </Link>
          )}
          {whatsappConnected && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs font-semibold text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Connected
            </span>
          )}
        </div>
      </div>

      {/* ── Date range + comparison ── */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <DateRangeSelect value={rangeState} onChange={setRangeState} />
      </div>

      {/* ── 4 KPI Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title={t('activeConversations')}
              value={metrics.activeConversations.toLocaleString()}
              icon={MessageSquare}
              iconBg="ds-metric-blue ds-metric-icon"
              subtitle={t('newConversationsLine', {
                today: metrics.newConversations.current,
                yesterday: metrics.newConversations.previous,
              })}
            />
            <MetricCard
              title={t('newContactsToday')}
              value={metrics.newContactsToday.current.toLocaleString()}
              icon={UserPlus}
              iconBg="ds-metric-green ds-metric-icon"
              delta={{
                current: metrics.newContactsToday.current,
                previous: metrics.newContactsToday.previous,
                label: t('vsYesterday'),
              }}
            />
            <MetricCard
              title={t('openDealsValue')}
              value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
              icon={DollarSign}
              iconBg="ds-metric-amber ds-metric-icon"
              subtitle={t('openDeals', { count: metrics.openDealsCount })}
            />
            <MetricCard
              title={t('messagesSentToday')}
              value={metrics.messagesSentToday.current.toLocaleString()}
              icon={Send}
              iconBg="ds-metric-violet ds-metric-icon"
              delta={{
                current: metrics.messagesSentToday.current,
                previous: metrics.messagesSentToday.previous,
                label: t('vsYesterday'),
              }}
            />
          </>
        )}
      </div>

      {/* ── Platform Channel Cards (WhatsApp / Instagram / Facebook / Telegram) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PLATFORM_CARDS.map((p) => {
          const count = platformCounts?.[p.key] ?? 0
          return (
            <Link
              key={p.key}
              href={`/inbox?platform=${p.key}`}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: p.color }}
              >
                <PlatformBrandIcon platform={p.key} size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground truncate">{p.label}</p>
                {platformCounts === null ? (
                  <div className="mt-1 h-5 w-10 animate-pulse rounded bg-muted" />
                ) : (
                  <p className="text-xl font-bold tabular-nums text-foreground">
                    {count.toLocaleString()}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">conversations</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── Selected period summary (range-scoped, optional comparison) ── */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">{t('periodSummaryTitle')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatRangeLabel(range)}
              {compare && rangeSummary?.previous
                ? ` · ${t('vsPreviousPeriod')}`
                : ''}
            </p>
          </div>
        </div>
        {rangeSummaryLoading || !rangeSummary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <PeriodStat
              icon={Send}
              label={t('periodMessages')}
              value={rangeSummary.current.messages}
              previous={compare ? (rangeSummary.previous?.messages ?? null) : null}
            />
            <PeriodStat
              icon={UserPlus}
              label={t('periodContacts')}
              value={rangeSummary.current.newContacts}
              previous={compare ? (rangeSummary.previous?.newContacts ?? null) : null}
            />
            <PeriodStat
              icon={MessageSquare}
              label={t('periodConversations')}
              value={rangeSummary.current.newConversations}
              previous={compare ? (rangeSummary.previous?.newConversations ?? null) : null}
            />
            <PeriodStat
              icon={TrendingUp}
              label={t('periodDeals')}
              value={rangeSummary.current.newDeals}
              previous={compare ? (rangeSummary.previous?.newDeals ?? null) : null}
            />
            <PeriodStat
              icon={DollarSign}
              label={t('periodDealValue')}
              value={rangeSummary.current.dealValue}
              previous={compare ? (rangeSummary.previous?.dealValue ?? null) : null}
              format={(v) => formatCurrency(v, defaultCurrency)}
            />
          </div>
        )}
      </section>

      {/* ── Main 3-column grid ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ConversationsChart
            data={series}
            rangeLabel={formatRangeLabel(range)}
            loading={seriesLoading}
          />
        </div>
        <div className="lg:col-span-1 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-[15px] font-semibold text-foreground">Messages by Channel</h2>
          <MessagesByChannel />
        </div>
      </div>

      {/* ── Second row: Sales Funnel + Pipeline + Recent Conversations ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-foreground">{t('salesOverviewTitle')}</h2>
            <Link href="/pipelines"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
              View Pipeline
            </Link>
          </div>
          <SalesOverview defaultCurrency={defaultCurrency} />
        </div>

        <div className="lg:col-span-1">
          <PipelineDonut
            data={pipeline}
            loading={pipelineLoading}
            currency={defaultCurrency}
          />
        </div>

        <div className="lg:col-span-1 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-foreground">{t('recentConversations')}</h2>
            <Link href="/inbox"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
              View All
            </Link>
          </div>
          <RecentConversationsCard conversations={recentConversations ?? []} loading={recentLoading} />
        </div>
      </div>

      {/* ── Overview stat mini-cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStatCard icon={Users} label={t('totalContacts')} value={totalContacts} loading={metricsLoading} color="text-primary" bg="bg-primary/10" />
        <MiniStatCard icon={MessageSquare} label={t('totalConversations')} value={totalConversations} loading={metricsLoading} color="text-info" bg="bg-info/10" />
        <MiniStatCard icon={Calendar} label={t('todaysFollowUps')} value={metrics?.followUpsToday.current ?? null} loading={metricsLoading} color="text-warning" bg="bg-warning/10" />
        <MiniStatCard icon={TrendingUp} label={t('openDealsCountLabel')} value={metrics?.openDealsCount ?? null} loading={metricsLoading} color="text-primary" bg="bg-primary/10" />
      </div>

      {/* ── Unassigned + Overdue ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/inbox?filter=unassigned"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-warning/10 transition-transform group-hover:scale-105">
            <Users className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('unassignedConversations')}</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {unassignedCount !== null ? unassignedCount.toLocaleString() : '—'}
            </p>
          </div>
        </Link>
        <Link href="/inbox?filter=followups"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 transition-transform group-hover:scale-105">
            <Calendar className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('overdueFollowUps')}</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {overdueFollowUpsCount !== null ? overdueFollowUpsCount.toLocaleString() : '—'}
            </p>
          </div>
        </Link>
      </div>

      {/* ── Lead Overview ── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Lead Overview</h2>
          <Link href="/social-media" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            Social Media <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <LeadStatCards stats={leadStats} loading={leadStatsLoading} />
      </div>

      {/* ── Recent Leads ── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Recent Leads</h2>
          <Link href="/contacts?tab=meta_leads" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <RecentLeads leads={recentLeads} loading={recentLeadsLoading} />
      </div>

      {/* ── Response Time + Activity ── */}
      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}

// ── Mini stat card ──────────────────────────────────────────────
function MiniStatCard({
  icon: Icon, label, value, loading, color, bg,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | null
  loading: boolean
  color?: string
  bg?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg ?? 'bg-muted'} ${color ?? 'text-muted-foreground'}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        {loading ? (
          <div className="mt-1 h-5 w-12 animate-pulse rounded bg-muted" />
        ) : (
          <p className="text-lg font-bold tabular-nums text-foreground">
            {(value ?? 0).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Range-scoped stat with an optional previous-period delta ────
function PeriodStat({
  icon: Icon,
  label,
  value,
  previous,
  format,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  previous: number | null
  format?: (v: number) => string
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <p className="truncate text-[11px] font-medium">{label}</p>
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
        {format ? format(value) : value.toLocaleString()}
      </p>
      {previous !== null ? (
        <DeltaBadge current={value} previous={previous} label="vs previous" />
      ) : null}
    </div>
  )
}
