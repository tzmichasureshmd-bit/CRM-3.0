'use client';
import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';

interface MonthRow { label: string; revenue: number; }

function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 100_000)   return `$${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

export function RevenueIntelligence() {
  const [data, setData] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v3/revenue-intelligence?view=overview&months=6');
      if (res.ok) {
        const d = await res.json() as { monthly_revenue?: MonthRow[] };
        setData(d.monthly_revenue ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <GlassPanel className="crm-chart-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-text-strong)' }}>Revenue Trend</div>
        <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Last 6 months · Real data</span>
      </div>
      {loading ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>Loading...</div>
      ) : data.every(d => d.revenue === 0) ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crm-text-muted)', fontSize: 12, textAlign: 'center' }}>
          No won deals yet.<br />Revenue will appear here once deals are marked won.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4f6df5" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#4f6df5" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,145,190,0.12)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#627D98' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: '#627D98' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: unknown) => [fmt(v as number), 'Revenue']} contentStyle={{ background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 14, fontSize: 12 }} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#4f6df5" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: '#4f6df5' }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </GlassPanel>
  );
}
