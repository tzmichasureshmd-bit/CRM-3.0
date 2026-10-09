'use client';
import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';

const COLORS = ['#f46b72', '#28c99a', '#4d7cff', '#f4c95d', '#ec78b5', '#8b5cf6'];

interface SourceRow { source: string; count: number; }

export function LeadSources() {
  const [data, setData] = useState<SourceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v3/revenue-intelligence?view=overview');
      if (res.ok) {
        const d = await res.json() as { source_breakdown?: SourceRow[]; overview?: { total_contacts: number } };
        setData(d.source_breakdown ?? []);
        setTotal(d.overview?.total_contacts ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pieData = data.map((s, i) => ({ name: s.source, value: s.count, color: COLORS[i % COLORS.length] }));

  return (
    <GlassPanel className="crm-chart-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text-strong)' }}>Lead Sources</div>
        <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Real data</span>
      </div>
      {loading ? (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>Loading...</div>
      ) : pieData.length === 0 ? (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--crm-text-muted)', fontSize: 12, textAlign: 'center' }}>
          No source data.<br />Add source to contacts.
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', height: 140 }}>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={64} dataKey="value" strokeWidth={0}>
                  {pieData.map((_e, i) => <Cell key={i} fill={pieData[i].color} />)}
                </Pie>
                <Tooltip formatter={(v: unknown) => [String(v), 'Contacts']} contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text-strong)', lineHeight: 1 }}>{total}</div>
              <div style={{ fontSize: 10, color: 'var(--crm-text-secondary)', marginTop: 2 }}>Total</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {pieData.slice(0, 5).map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--crm-text-secondary)', textTransform: 'capitalize' }}>{d.name}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassPanel>
  );
}
