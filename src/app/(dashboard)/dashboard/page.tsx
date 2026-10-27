'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Target, Users, Clock, BarChart3, Brain } from 'lucide-react';
import { KPIWidget } from '@/components/dashboard/KPIWidget';
import { RevenueIntelligence } from '@/components/dashboard/RevenueIntelligence';
import { AIInsights } from '@/components/dashboard/AIInsights';
import { LeadSources } from '@/components/dashboard/LeadSources';
import { AttentionSection } from '@/components/dashboard/AttentionSection';
import { RecentConversations } from '@/components/dashboard/RecentConversations';
import { PipelineOverview } from '@/components/dashboard/PipelineOverview';
import { AICopilot } from '@/components/dashboard/AICopilot';
import { v3fetch } from '@/lib/auth-client';

interface DashboardKPIs {
  revenue: number;
  pipeline: number;
  hotLeads: number;
  pendingFollowups: number;
  conversionRate: number;
  currency: string;
}

function fmt(v: number, currency = 'USD') {
  const sym = currency === 'INR' ? '₹' : '$';
  if (v >= 100000) return `${sym}${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `${sym}${(v / 1000).toFixed(0)}K`;
  return `${sym}${v}`;
}

export default function CommandCenterPage() {
  const [now, setNow]   = useState<Date | null>(null);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadKPIs = useCallback(async () => {
    try {
      const [dealsRes, contactsRes, followupsRes] = await Promise.all([
        v3fetch('/api/v3/deals?limit=500'),
        v3fetch('/api/v3/contacts?limit=500'),
        v3fetch('/api/v3/follow-ups?status=all&limit=200'),
      ]);

      // If any returned 401, session-expired already fired via v3fetch.
      // Don't process further — just bail silently.
      if (!dealsRes.ok || !contactsRes.ok || !followupsRes.ok) return;

      const dealsJson     = await dealsRes.json()     as { data?: { status: string; value: number | null; currency?: string }[] };
      const contactsJson  = await contactsRes.json()  as { data?: { lead_score_tier: string | null }[]; contacts?: { lead_score_tier: string | null }[] };
      const followupsJson = await followupsRes.json() as { follow_ups?: { status: string; due_date: string }[]; data?: { status: string; due_date: string }[] };

      const deals     = dealsJson.data ?? [];
      const contacts  = contactsJson.data ?? contactsJson.contacts ?? [];
      const followups = followupsJson.follow_ups ?? followupsJson.data ?? [];

      const won      = deals.filter(d => d.status === 'won');
      const open     = deals.filter(d => d.status === 'open');
      const revenue  = won.reduce((s, d) => s + (d.value ?? 0), 0);
      const pipeline = open.reduce((s, d) => s + (d.value ?? 0), 0);
      const currency = (deals[0] as { currency?: string } | undefined)?.currency ?? 'USD';
      const hotLeads = contacts.filter(c => c.lead_score_tier === 'hot').length;
      const pending  = followups.filter(f =>
        f.status === 'pending' && new Date(f.due_date) < new Date()
      ).length;
      const convRate = (open.length + won.length) > 0
        ? Math.round((won.length / (open.length + won.length)) * 100)
        : 0;

      setKpis({ revenue, pipeline, hotLeads, pendingFollowups: pending, conversionRate: convRate, currency });
    } catch { /* token expired → layout redirects */ }
  }, []);

  useEffect(() => { void loadKPIs(); }, [loadKPIs]);

  const greeting = now
    ? (now.getHours() < 12 ? 'Good Morning' : now.getHours() < 17 ? 'Good Afternoon' : 'Good Evening')
    : '';
  const dateStr = now?.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) ?? '';
  const timeStr = now?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) ?? '';
  const k = kpis;

  return (
    <div>
      {/* Page header */}
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
              Here&apos;s what needs your attention today.
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>{dateStr}</div>
          <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text-strong)', letterSpacing: '-0.02em' }}>{timeStr}</div>
        </div>
      </div>

      {/* KPI cards — authenticated v3 API data */}
      <div className="crm-kpi-grid">
        <KPIWidget title="Revenue" value={k ? fmt(k.revenue, k.currency) : '—'} change="" trend="up" accent="cyan"
          icon={<DollarSign size={20} strokeWidth={2} />} />
        <KPIWidget title="Pipeline" value={k ? fmt(k.pipeline, k.currency) : '—'} change="" trend="up" accent="blue"
          icon={<Target size={20} strokeWidth={2} />} />
        <KPIWidget title="Hot Leads" value={k ? String(k.hotLeads) : '—'} change="" trend="up" accent="violet"
          icon={<Users size={20} strokeWidth={2} />} />
        <KPIWidget title="Overdue Follow-ups" value={k ? String(k.pendingFollowups) : '—'} change="" trend="down" accent="peach"
          icon={<Clock size={20} strokeWidth={2} />} />
        <KPIWidget title="Win Rate" value={k ? `${k.conversionRate}%` : '—'} change="" trend="up" accent="indigo"
          icon={<BarChart3 size={20} strokeWidth={2} />} />
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
        <AICopilot />
      </div>
    </div>
  );
}
