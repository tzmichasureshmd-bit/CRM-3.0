'use client';
import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Zap, AlertCircle, Clock, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface Insight {
  id: string;
  what: string;
  why: string;
  action_label: string;
  action_href: string;
  urgency: string;
  category: string;
}

const URGENCY_COLORS: Record<string, string> = {
  immediate: '#f46b72', today: '#f4c95d', this_week: '#4f6df5', low: '#8790aa',
};

const CAT_ICONS: Record<string, React.ReactNode> = {
  lead: <Zap size={11} />,
  deal: <TrendingUp size={11} />,
  team: <Clock size={11} />,
  default: <AlertCircle size={11} />,
};

export function AIInsights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v3/command-center');
      if (res.ok) {
        const d = await res.json() as { ai_recommendations?: Insight[] };
        setInsights(d.ai_recommendations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="crm-glass-ai" style={{ padding: 22, borderRadius: 'var(--crm-radius-lg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="crm-ai-orb" style={{ width: 40, height: 40 }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text-strong)' }}>AI Insights</div>
          <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Real CRM data</div>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', textAlign: 'center', padding: '16px 0' }}>Analyzing CRM data...</div>
      ) : insights.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', textAlign: 'center', padding: '16px 0' }}>
          No urgent actions right now. Your CRM is healthy.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insights.slice(0, 4).map(ins => {
            const urgColor = URGENCY_COLORS[ins.urgency] ?? '#8790aa';
            const icon = CAT_ICONS[ins.category] ?? CAT_ICONS.default;
            return (
              <div key={ins.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.45)', border: `1px solid ${urgColor}20` }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: `${urgColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: urgColor, flexShrink: 0, marginTop: 1 }}>
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)', lineHeight: 1.4 }}>{ins.what}</div>
                  <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{ins.why}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 12, fontWeight: 600, textDecoration: 'none', marginTop: 4 }}>
        Full Command Center <ArrowRight size={13} />
      </Link>
    </div>
  );
}
