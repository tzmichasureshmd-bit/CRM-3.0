import { cn } from '@/lib/utils'

/**
 * Shared skeleton primitive — a pulsing slate block sized to whatever
 * container it's dropped into. Used by every dashboard widget while
 * its data fetches.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-4 rounded-2xl border border-border bg-card p-5', className)}>
      <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
      <div className="flex-1">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-7 w-20" />
        <Skeleton className="mt-2 h-3 w-16" />
      </div>
    </div>
  )
}
