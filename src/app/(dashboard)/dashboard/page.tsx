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
import { AICopilot } from '@/components/dashboard/AICopilot';

export default function CommandCenterPage() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const greeting = now ? (now.getHours() < 12 ? 'Good Morning' : now.getHours() < 17 ? 'Good Afternoon' : 'Good Evening') : '';
  const dateStr = now?.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) ?? '';
  const timeStr = now?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) ?? '';

  return (
    <div>
      {/* Page header */}
      <div className="crm-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(79,109,245,0.30)', flexShrink: 0 }}>
            <Brain size={24} color="white" strokeWidth={1.8} />
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 750, color: 'var(--crm-text)', margin: 0, letterSpacing: '-0.02em' }}>
              {greeting}, John 👋
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 13.5, color: 'var(--crm-text-secondary)' }}>
              Here&apos;s what needs your attention today.
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>{dateStr}</div>
          <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', letterSpacing: '-0.02em' }}>{timeStr}</div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="crm-kpi-grid">
        <KPIWidget title="Revenue" value="₹8,24,000" change="↑ 12%" trend="up" accent="cyan"
          icon={<DollarSign size={20} strokeWidth={2} />} />
        <KPIWidget title="Pipeline" value="₹24,80,000" change="↑ 8%" trend="up" accent="blue"
          icon={<Target size={20} strokeWidth={2} />} />
        <KPIWidget title="Hot Leads" value="52" change="↑ 22%" trend="up" accent="violet"
          icon={<Users size={20} strokeWidth={2} />} />
        <KPIWidget title="Pending Follow-ups" value="18" change="↓ 5%" trend="down" accent="peach"
          icon={<Clock size={20} strokeWidth={2} />} />
        <KPIWidget title="Conversion Rate" value="24.6%" change="↑ 3.2%" trend="up" accent="indigo"
          icon={<BarChart3 size={20} strokeWidth={2} />} />
      </div>

      {/* Dashboard grid: chart + AI insights + lead sources */}
      <div className="crm-dashboard-grid">
        <RevenueIntelligence />
        <AIInsights />
        <LeadSources />
      </div>

      {/* Attention section */}
      <AttentionSection />

      {/* Bottom grid */}
      <div className="crm-bottom-grid">
        <RecentConversations />
        <PipelineOverview />
        <AICopilot />
      </div>
    </div>
  );
}
