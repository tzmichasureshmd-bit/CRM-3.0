"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from './skeleton'

interface ChannelSlice {
  platform: string
  count: number
  color: string
  label: string
}

const CHANNEL_META: Record<string, { color: string; label: string }> = {
  whatsapp:  { color: 'var(--chart-2)', label: 'WhatsApp' },
  instagram: { color: 'var(--chart-1)', label: 'Instagram' },
  facebook:  { color: 'var(--info)', label: 'Facebook' },
  telegram:  { color: 'var(--chart-3)', label: 'Telegram' },
  threads:   { color: 'var(--foreground)', label: 'Threads' },
  x:         { color: 'var(--muted-foreground)', label: 'Twitter/X' },
}

export function MessagesByChannel() {
  const [slices, setSlices] = useState<ChannelSlice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const db = createClient()
    void (async () => {
      try {
        const { data } = await db.from('conversations').select('platform')
        if (!data) return
        const counts: Record<string, number> = {}
        for (const row of data as { platform: string }[]) {
          const p = row.platform || 'whatsapp'
          counts[p] = (counts[p] ?? 0) + 1
        }
        const t = Object.values(counts).reduce((a, b) => a + b, 0)
        setTotal(t)
        setSlices(
          Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([platform, count]) => ({
              platform,
              count,
              color: CHANNEL_META[platform]?.color ?? 'var(--muted-foreground)',
              label: CHANNEL_META[platform]?.label ?? platform,
            }))
        )
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <Skeleton className="h-56 w-full rounded-2xl" />

  // SVG donut
  const size = 160
  const r = 58
  const ringW = 20
  const cx = size / 2
  const cy = size / 2

  const safeTotal = total || 1
  const minFrac = 0.03
  const rawShares = slices.map(s => s.count / safeTotal)
  const floored = rawShares.map(x => Math.max(x, minFrac))
  const floorSum = floored.reduce((a, b) => a + b, 0)
  const shares = floored.map(x => x / floorSum)

  const offsets: number[] = [0]
  for (let i = 0; i < shares.length; i++) offsets.push(offsets[i] + shares[i])

  const segments = slices.map((s, i) => {
    const start = offsets[i] * Math.PI * 2 - Math.PI / 2
    const end = offsets[i + 1] * Math.PI * 2 - Math.PI / 2
    return { path: arcPath(cx, cy, r, start, end), color: s.color, id: s.platform }
  })

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Donut */}
      <div className="relative flex items-center justify-center">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--muted)" strokeWidth={ringW} />
          {segments.map(seg => (
            <path key={seg.id} d={seg.path} fill="none" stroke={seg.color} strokeWidth={ringW} strokeLinecap="butt" />
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--muted-foreground)' }}>Messages</text>
          <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 20, fontWeight: 700, fill: 'var(--foreground)' }}>
            {total.toLocaleString()}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="w-full space-y-2">
        {slices.map(s => {
          const pct = total > 0 ? Math.round((s.count / total) * 100) : 0
          return (
            <div key={s.platform} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 text-xs text-muted-foreground">{s.label}</span>
              <span className="text-xs font-semibold text-foreground">{pct}%</span>
            </div>
          )
        })}
        {slices.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">No conversations yet</p>
        )}
      </div>
    </div>
  )
}

function arcPath(cx: number, cy: number, r: number, startRad: number, endRad: number): string {
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy + r * Math.sin(startRad)
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy + r * Math.sin(endRad)
  const largeArc = endRad - startRad > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}
