"use client"

import Link from 'next/link'
import { useState } from 'react'
import {
  MessageSquare, UserPlus, Briefcase, Radio, Zap, Inbox,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { ActivityItem, ActivityKind } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { useTranslations } from 'next-intl'

interface ActivityFeedProps {
  items: ActivityItem[] | null
  loading: boolean
}

const PAGE_SIZES = [5, 10, 20, 50] as const
type PageSize = (typeof PAGE_SIZES)[number]

interface KindTheme {
  icon: ComponentType<{ className?: string }>
  gradient: string
  dot: string
}

const KIND_THEME: Record<ActivityKind, KindTheme> = {
  message:    { icon: MessageSquare, gradient: 'from-[#3462EE] to-[#5b7ff5]', dot: '#3462EE' },
  contact:    { icon: UserPlus,      gradient: 'from-[#10b981] to-[#34d399]', dot: '#10b981' },
  deal:       { icon: Briefcase,     gradient: 'from-[#f59e0b] to-[#fbbf24]', dot: '#f59e0b' },
  broadcast:  { icon: Radio,         gradient: 'from-[#7c3aed] to-[#a78bfa]', dot: '#7c3aed' },
  automation: { icon: Zap,           gradient: 'from-[#E1306C] to-[#f77737]', dot: '#E1306C' },
}

export function ActivityFeed({ items, loading }: ActivityFeedProps) {
  const t = useTranslations('Dashboard.activityFeed')
  const [pageSize, setPageSize] = useState<PageSize>(5)

  const totalLoaded = items?.length ?? 0
  const visible = items?.slice(0, pageSize) ?? []
  const isSizeUseful = (size: PageSize, i: number) =>
    i === 0 || totalLoaded > PAGE_SIZES[i - 1]

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
        <Link href="/inbox" className="text-xs font-medium text-primary hover:text-primary/80">
          {t('viewAll')}
        </Link>
      </header>

      {loading || !items ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Inbox} title={t('noActivity')} hint={t('noActivityHint')} />
        </div>
      ) : (
        <>
          <ul className="px-5 py-3 space-y-0">
            {visible.map((it, i) => {
              const theme = KIND_THEME[it.kind]
              const Icon = theme.icon
              const isLast = i === visible.length - 1

              const content = (
                <div className="flex items-start gap-3 py-2.5 group">
                  {/* Timeline line + icon */}
                  <div className="relative flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${theme.gradient} shadow-sm transition-transform group-hover:scale-110`}
                    >
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </div>
                    {!isLast && (
                      <div className="mt-1 w-px flex-1 bg-border" style={{ minHeight: 16 }} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1 pb-1">
                    <p className="text-[13px] text-foreground leading-snug line-clamp-2">
                      {it.text}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {relativeTime(it.at, t)}
                    </p>
                  </div>

                  {/* Kind badge */}
                  <span
                    className="shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
                    style={{ background: theme.dot }}
                  >
                    {it.kind}
                  </span>
                </div>
              )

              return (
                <li key={it.id}>
                  {it.href ? (
                    <Link href={it.href} className="block rounded-lg hover:bg-muted/40 transition-colors -mx-2 px-2">
                      {content}
                    </Link>
                  ) : (
                    <div className="rounded-lg hover:bg-muted/40 transition-colors -mx-2 px-2">
                      {content}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <footer className="flex items-center justify-between border-t border-border px-5 py-3 text-xs">
            <span className="text-muted-foreground tabular-nums">
              {t('showingOf', { visible: visible.length, totalLoaded, plus: totalLoaded === 50 ? '+' : '' })}
            </span>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-muted-foreground">{t('show')}</span>
              {PAGE_SIZES.map((size, i) => {
                const disabled = !isSizeUseful(size, i)
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPageSize(size)}
                    disabled={disabled}
                    className={[
                      'rounded-md px-2 py-1 font-medium tabular-nums transition-colors',
                      pageSize === size
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      disabled ? 'cursor-not-allowed opacity-40' : '',
                    ].join(' ')}
                  >
                    {size}
                  </button>
                )
              })}
            </div>
          </footer>
        </>
      )}
    </section>
  )
}

function relativeTime(iso: string, t: ReturnType<typeof useTranslations>): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return t('timeS', { sec: Math.max(1, diffSec) })
  if (diffSec < 3600) return t('timeM', { min: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('timeH', { hr: Math.floor(diffSec / 3600) })
  if (diffSec < 2_592_000) return t('timeD', { day: Math.floor(diffSec / 86400) })
  return new Date(iso).toLocaleDateString()
}
