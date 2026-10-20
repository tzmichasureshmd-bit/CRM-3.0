'use client';
import { TrendingUp, TrendingDown } from 'lucide-react';

type Accent = 'cyan' | 'blue' | 'violet' | 'peach' | 'indigo';

interface KPIWidgetProps {
  title: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  accent?: Accent;
}

export function KPIWidget({ title, value, change, trend = 'neutral', icon, accent = 'blue' }: KPIWidgetProps) {
  return (
    <div className="crm-kpi-card">
      <div className={`crm-kpi-icon ${accent}`}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text-strong)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12.5, color: 'var(--crm-text-secondary)', marginTop: 2, fontWeight: 500 }}>{title}</div>
        {change && (
          <div className={trend === 'up' ? 'crm-trend-up' : trend === 'down' ? 'crm-trend-down' : ''} style={{ marginTop: 8 }}>
            {trend === 'up' && <TrendingUp size={12} />}
            {trend === 'down' && <TrendingDown size={12} />}
            {change}
          </div>
        )}
      </div>
    </div>
  );
}
