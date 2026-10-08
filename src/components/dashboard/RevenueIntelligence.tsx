'use client';
import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';

const DATA = {
  '7D': [
    { label: 'Mon', revenue: 180000, pipeline: 220000 },
    { label: 'Tue', revenue: 210000, pipeline: 240000 },
    { label: 'Wed', revenue: 195000, pipeline: 260000 },
    { label: 'Thu', revenue: 230000, pipeline: 280000 },
    { label: 'Fri', revenue: 260000, pipeline: 310000 },
    { label: 'Sat', revenue: 245000, pipeline: 295000 },
    { label: 'Sun', revenue: 270000, pipeline: 320000 },
  ],
  '1M': [
    { label: 'W1', revenue: 620000, pipeline: 780000 },
    { label: 'W2', revenue: 710000, pipeline: 850000 },
    { label: 'W3', revenue: 680000, pipeline: 920000 },
    { label: 'W4', revenue: 824000, pipeline: 1100000 },
  ],
  '3M': [
    { label: 'Jan', revenue: 100000, pipeline: 140000 },
    { label: 'Feb', revenue: 160000, pipeline: 200000 },
    { label: 'Mar', revenue: 210000, pipeline: 260000 },
    { label: 'Apr', revenue: 240000, pipeline: 300000 },
    { label: 'May', revenue: 280000, pipeline: 360000 },
    { label: 'Jun', revenue: 310000, pipeline: 400000 },
    { label: 'Jul', revenue: 260000, pipeline: 480000 },
  ],
  '1Y': [
    { label: 'Jan', revenue: 80000, pipeline: 120000 },
    { label: 'Feb', revenue: 120000, pipeline: 160000 },
    { label: 'Mar', revenue: 160000, pipeline: 210000 },
    { label: 'Apr', revenue: 200000, pipeline: 260000 },
    { label: 'May', revenue: 240000, pipeline: 310000 },
    { label: 'Jun', revenue: 290000, pipeline: 370000 },
    { label: 'Jul', revenue: 260000, pipeline: 420000 },
    { label: 'Aug', revenue: 310000, pipeline: 460000 },
    { label: 'Sep', revenue: 350000, pipeline: 500000 },
    { label: 'Oct', revenue: 390000, pipeline: 550000 },
    { label: 'Nov', revenue: 420000, pipeline: 600000 },
    { label: 'Dec', revenue: 460000, pipeline: 650000 },
  ],
};

type Range = keyof typeof DATA;

function fmt(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(0)}L`;
  return `₹${(v / 1000).toFixed(0)}K`;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'rgba(255,255,255,0.90)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 14, padding: '10px 14px', boxShadow: '0 8px 24px rgba(75,85,130,0.14)' }}>
      <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

export function RevenueIntelligence() {
  const [range, setRange] = useState<Range>('3M');
  const data = DATA[range];

  return (
    <GlassPanel className="crm-chart-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>Revenue Intelligence</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['7D', '1M', '3M', '1Y'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: range === r ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.12)',
                color: range === r ? 'white' : 'var(--crm-text-muted)',
                border: 'none', transition: 'all 150ms',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f6df5" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#4f6df5" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="pipGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.20} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(130,145,190,0.12)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: 'var(--crm-text-muted)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--crm-text-secondary)', paddingTop: 12 }} />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#4f6df5" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: '#4f6df5' }} />
          <Area type="monotone" dataKey="pipeline" name="Pipeline" stroke="#8b5cf6" strokeWidth={2} fill="url(#pipGrad)" dot={false} activeDot={{ r: 5, fill: '#8b5cf6' }} />
        </AreaChart>
      </ResponsiveContainer>
    </GlassPanel>
  );
}
