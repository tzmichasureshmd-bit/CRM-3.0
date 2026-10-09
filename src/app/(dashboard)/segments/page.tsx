'use client';

import { Target, Plus, Users, Brain, Zap } from 'lucide-react';

const DEMO_SEGMENTS = [
  { name: 'Hot Leads', type: 'ai_assisted', count: 52, color: '#f46b72', desc: 'Lead score ≥ 70 with high intent' },
  { name: 'Inactive Contacts', type: 'rule_based', count: 134, color: '#8790aa', desc: 'No activity in 30+ days' },
  { name: 'WhatsApp Engaged', type: 'rule_based', count: 89, color: '#28c99a', desc: 'Replied on WhatsApp in last 7 days' },
  { name: 'High Value Prospects', type: 'ai_assisted', count: 23, color: '#4d7cff', desc: 'AI-identified high-value potential' },
  { name: 'Campaign Responders', type: 'manual', count: 67, color: '#8b5cf6', desc: 'Engaged with last campaign' },
];

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ai_assisted: { label: 'AI Assisted', color: '#8b5cf6', icon: <Brain size={10} /> },
  rule_based:  { label: 'Rule Based', color: '#4d7cff', icon: <Zap size={10} /> },
  manual:      { label: 'Manual',     color: '#8790aa', icon: <Users size={10} /> },
};

export default function SegmentsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Smart Segments</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>AI-powered contact segmentation</p>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> New Segment
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {DEMO_SEGMENTS.map(seg => {
          const tm = TYPE_META[seg.type];
          return (
            <div key={seg.name} className="crm-glass" style={{ padding: '18px 20px', cursor: 'pointer', transition: 'transform 150ms' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${seg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Target size={18} color={seg.color} />
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: tm.color, background: `${tm.color}15`, borderRadius: 6, padding: '2px 7px' }}>
                  {tm.icon}{tm.label}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 4 }}>{seg.name}</div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginBottom: 12 }}>{seg.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 22, fontWeight: 750, color: seg.color }}>{seg.count}</div>
                <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>contacts</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
