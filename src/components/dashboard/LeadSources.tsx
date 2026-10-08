'use client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';

const data = [
  { name: 'Instagram', value: 32, color: '#f46b72' },
  { name: 'WhatsApp', value: 28, color: '#28c99a' },
  { name: 'Facebook', value: 18, color: '#4d7cff' },
  { name: 'Website', value: 12, color: '#f4c95d' },
  { name: 'Email', value: 10, color: '#ec78b5' },
];

export function LeadSources() {
  return (
    <GlassPanel className="crm-chart-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Lead Sources</div>
        <button style={{ background: 'none', border: 'none', color: 'var(--crm-text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>···</button>
      </div>
      <div style={{ position: 'relative', height: 140 }}>
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={44} outerRadius={64} dataKey="value" strokeWidth={0}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip formatter={(v) => [`${v}%`]} contentStyle={{ background: 'rgba(255,255,255,0.90)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 12, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', lineHeight: 1 }}>248</div>
          <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>Total Leads</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        {data.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--crm-text-secondary)' }}>{d.name}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>{d.value}%</span>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
