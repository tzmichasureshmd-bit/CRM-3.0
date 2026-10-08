'use client';
import { Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const insights = [
  'Requested pricing',
  'Visited landing page',
  'Replied multiple times',
  'Engaged with campaign',
];

export function AIInsights() {
  return (
    <div className="crm-glass-ai" style={{ padding: 22, borderRadius: 'var(--crm-radius-lg)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="crm-ai-orb" style={{ width: 48, height: 48 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>AI Insights</div>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--crm-text)' }}>
        4 leads show high buying intent.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {insights.map(item => (
          <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Check size={10} color="white" strokeWidth={3} />
            </div>
            <span style={{ fontSize: 13, color: 'var(--crm-text-secondary)' }}>{item}</span>
          </div>
        ))}
      </div>
      <Link href="/leads" className="crm-btn-primary" style={{ justifyContent: 'center', marginTop: 4 }}>
        View Leads <ArrowRight size={14} />
      </Link>
    </div>
  );
}
