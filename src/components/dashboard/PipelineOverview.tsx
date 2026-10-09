'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

const stages = [
  {
    label: 'New', count: 12, value: '₹18,40,000', color: '#4d7cff', bg: 'rgba(77,124,255,0.08)',
    deals: [{ name: 'Aster Labs', val: '₹80,000', pct: 90 }, { name: 'Nova Retail', val: '₹1,20,000', pct: 70 }],
  },
  {
    label: 'Contacted', count: 8, value: '₹12,60,000', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)',
    deals: [{ name: 'BrightPath', val: '₹2,40,000', pct: 75 }, { name: 'Greenline', val: '₹90,000', pct: 60 }],
  },
  {
    label: 'Qualified', count: 5, value: '₹8,40,000', color: '#28c99a', bg: 'rgba(40,201,154,0.08)',
    deals: [{ name: 'NorthPeak', val: '₹3,20,000', pct: 80 }, { name: 'Atlas Energy', val: '₹1,50,000', pct: 75 }],
  },
  {
    label: 'Proposal', count: 4, value: '₹6,20,000', color: '#f4c95d', bg: 'rgba(244,201,93,0.08)',
    deals: [{ name: 'Bloom Market', val: '₹2,80,000', pct: 85 }, { name: 'PulseWorks', val: '₹1,20,000', pct: 70 }],
  },
];

export function PipelineOverview() {
  return (
    <GlassPanel className="crm-table-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text-strong)' }}>Pipeline Overview</div>
        <Link href="/pipelines" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--crm-primary)' }}>
          View all <ArrowRight size={12} />
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {stages.map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 14, padding: '12px 10px', border: `1px solid ${s.color}22` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.label}</span>
              <span style={{ fontSize: 10, background: s.color, color: 'white', borderRadius: 6, padding: '1px 6px', fontWeight: 600 }}>{s.count}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text-strong)', marginBottom: 10 }}>{s.value}</div>
            {s.deals.map(d => (
              <div key={d.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: `${s.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: s.color }}>{d.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>{d.val}</div>
                  </div>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(130,145,190,0.15)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.pct}%`, background: s.color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
