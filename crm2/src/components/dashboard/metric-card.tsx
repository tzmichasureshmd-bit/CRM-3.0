import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DeltaBadge } from '@/components/reports/date-range-select'

interface MetricCardProps {
  title: string
  value: string
  icon: ComponentType<{ className?: string }>
  /** Current vs previous value; rendered as a percentage-change pill. */
  delta?: { current: number; previous: number; label: string }
  subtitle?: string
  iconBg?: string
  cardBg?: string
  children?: ReactNode
}

export function MetricCard({ title, value, icon: Icon, delta, subtitle, iconBg, cardBg, children }: MetricCardProps) {
  return (
    <div className={cn(
      'flex items-center gap-4 rounded-2xl border border-border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
      cardBg ?? 'bg-card',
    )}>
      {/* Icon */}
      <div className={cn(
        'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl',
        iconBg ?? 'bg-primary/10 text-primary',
      )}>
        <Icon className="h-6 w-6" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-muted-foreground leading-none">{title}</p>
        <p className="mt-1.5 text-[26px] leading-none font-bold tabular-nums text-foreground tracking-tight">
          {value}
        </p>
        {delta ? (
          <div className="mt-2">
            <DeltaBadge current={delta.current} previous={delta.previous} label={delta.label} />
          </div>
        ) : subtitle ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}
