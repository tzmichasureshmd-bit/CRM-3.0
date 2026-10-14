'use client';

import { useState, useEffect } from 'react';
import { DollarSign, Target, Users, Clock, BarChart3, Brain } from 'lucide-react';
import { KPIWidget } from '@/components/dashboard/KPIWidget';
import { RevenueIntelligence } from '@/components/dashboard/RevenueIntelligence';
import { AIInsights } from '@/components/dashboard/AIInsights';
import { LeadSources } from '@/components/dashboard/LeadSources';
import { AttentionSection } from '@/components/dashboard/AttentionSection';
import { RecentConversations } from '@/components/dashboard/RecentConversations';
import { PipelineOverview } from '@/components/dashboard/PipelineOverview';
import { getStoredUser } from '@/lib/api-client';

function fmt(v: number, currency = 'USD') {
  const sym = currency === 'INR' ? '₹' : '$';
  if (v >= 100000) return `${sym}${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `${sym}${(v / 1000).toFixed(0)}K`;
  return `${sym}${v}`;
}

export default function DashboardPage() {
  const [now, setNow] = useState(new Date());
  const user = getStoredUser();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const greeting = now.getHours() < 12 ? 'Good Morning' : now.getHours() < 17 ? 'Good Afternoon' : 'Good Evening';
  const dateStr  = now.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr  = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      {/* Header */}
      <div className="crm-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(79,109,245,0.30)', flexShrink: 0 }}>
            <Brain size={24} color="white" strokeWidth={1.8} />
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 750, color: 'var(--crm-text-strong)', margin: 0, letterSpacing: '-0.02em' }}>
              {greeting} 👋
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 13.5, color: 'var(--crm-text-secondary)' }}>
              Welcome back · {user?.role ?? 'owner'}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>{dateStr}</div>
          <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text-strong)', letterSpacing: '-0.02em' }}>{timeStr}</div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="crm-kpi-grid">
        <KPIWidget title="Revenue"            value={fmt(0)}  change="" trend="up"   accent="cyan"   icon={<DollarSign size={20} strokeWidth={2} />} />
        <KPIWidget title="Pipeline"           value={fmt(0)}  change="" trend="up"   accent="blue"   icon={<Target     size={20} strokeWidth={2} />} />
        <KPIWidget title="Hot Leads"          value="0"       change="" trend="up"   accent="violet" icon={<Users      size={20} strokeWidth={2} />} />
        <KPIWidget title="Overdue Follow-ups" value="0"       change="" trend="down" accent="peach"  icon={<Clock      size={20} strokeWidth={2} />} />
        <KPIWidget title="Win Rate"           value="0%"      change="" trend="up"   accent="indigo" icon={<BarChart3  size={20} strokeWidth={2} />} />
      </div>

      {/* Dashboard grid */}
      <div className="crm-dashboard-grid">
        <RevenueIntelligence />
        <AIInsights />
        <LeadSources />
      </div>

      <AttentionSection />

      <div className="crm-bottom-grid">
        <RecentConversations />
        <PipelineOverview />
      </div>
    </div>
  );
}
