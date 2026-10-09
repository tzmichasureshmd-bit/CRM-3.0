'use client';

import Link from 'next/link';
import { ArrowRight, Flame, Clock, MessageSquare, TrendingUp, Brain, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';

interface CommandState {
  hot_leads: { contact_id: string; contact_name: string; score: number; recommended_action: string }[];
  overdue_followups: { followup_id: string; contact_name: string; overdue_hours: number; title: string }[];
  deals_at_risk: { deal_id: string; deal_title: string; value: number; currency: string; days_stalled: number; risk_reason: string }[];
  important_conversations: { conversation_id: string; contact_name: string; channel: string; unanswered_hours: number }[];
  ai_recommendations: { id: string; what: string; action_href: string; urgency: string }[];
}

const spring = { type: 'spring' as const, visualDuration: 0.3, bounce: 0.2 };

function fmt(v: number, cur = 'USD') {
  const sym = cur === 'INR' ? '₹' : '$';
  if (v >= 1000) return `${sym}${(v / 1000).toFixed(0)}K`;
  return `${sym}${v}`;
}

export function AttentionSection() {
  const [data, setData] = useState<CommandState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v3/command-center');
      if (res.ok) setData(await res.json() as CommandState);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <section style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--crm-text-strong)', marginBottom: 14 }}>What Needs Your Attention?</div>
        <div className="crm-attention-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 110, borderRadius: 16, background: 'rgba(255,255,255,0.40)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      </section>
    );
  }

  const hotCount   = data?.hot_leads?.length ?? 0;
  const overdueCount = data?.overdue_followups?.length ?? 0;
  const convCount  = data?.important_conversations?.length ?? 0;
  const riskCount  = data?.deals_at_risk?.length ?? 0;
  const aiCount    = data?.ai_recommendations?.length ?? 0;

  const topRisk = data?.deals_at_risk?.[0];
  const topHot  = data?.hot_leads?.[0];

  const cards = [
    {
      id: 1, icon: Flame, iconBg: 'linear-gradient(135deg,#ff6b6b,#ff8e53)',
      count: hotCount, title: 'Hot Leads', href: '/leads',
      desc: topHot ? `${topHot.contact_name} — score ${topHot.score}` : 'No hot leads right now',
      cta: 'View Leads', ctaColor: '#DC2626', accent: 'rgba(244,107,114,0.08)',
    },
    {
      id: 2, icon: Clock, iconBg: 'linear-gradient(135deg,#f4c95d,#ffb347)',
      count: overdueCount, title: 'Overdue Follow-ups', href: '/follow-ups',
      desc: overdueCount > 0 ? `${data!.overdue_followups[0].contact_name} — ${data!.overdue_followups[0].overdue_hours}h overdue` : 'All caught up',
      cta: 'View Follow-ups', ctaColor: '#b45309', accent: 'rgba(244,201,93,0.08)',
    },
    {
      id: 3, icon: MessageSquare, iconBg: 'linear-gradient(135deg,#4d7cff,#6fa3ff)',
      count: convCount, title: 'Unanswered', href: '/inbox',
      desc: convCount > 0 ? `${data!.important_conversations[0].contact_name} via ${data!.important_conversations[0].channel}` : 'Inbox clear',
      cta: 'Open Inbox', ctaColor: '#2563EB', accent: 'rgba(77,124,255,0.08)',
    },
    {
      id: 4, icon: AlertTriangle, iconBg: 'linear-gradient(135deg,#f46b72,#ff8e53)',
      count: riskCount, title: 'Deals at Risk', href: '/pipelines',
      desc: topRisk ? `${topRisk.deal_title} — ${topRisk.days_stalled}d stalled` : 'Pipeline healthy',
      cta: 'View Deals', ctaColor: '#DC2626', accent: 'rgba(244,107,114,0.06)',
    },
    {
      id: 5, icon: Brain, iconBg: 'linear-gradient(135deg,#8b5cf6,#a78bfa)',
      count: aiCount, title: 'AI Recommendations', href: '/ai-center',
      desc: aiCount > 0 ? data!.ai_recommendations[0].what : 'No urgent actions',
      cta: 'View Recommendations', ctaColor: '#7c3aed', accent: 'rgba(139,92,246,0.08)',
    },
    {
      id: 6, icon: TrendingUp, iconBg: 'linear-gradient(135deg,#28c99a,#20e3b2)',
      count: (data?.deals_at_risk ?? []).filter(d => d.value > 0).length,
      title: 'Revenue at Risk',
      href: '/revenue',
      desc: topRisk ? `${fmt(topRisk.value, topRisk.currency)} — ${topRisk.risk_reason}` : 'No revenue at risk',
      cta: 'View Attribution', ctaColor: '#059669', accent: 'rgba(40,201,154,0.08)',
    },
  ];

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--crm-text-strong)' }}>What Needs Your Attention?</div>
        <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Real CRM data</span>
      </div>
      <div className="crm-attention-grid">
        <AnimatePresence mode="popLayout">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.id} layout
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={spring}
                className="crm-attention-card"
                style={{ background: `linear-gradient(135deg, rgba(255,255,255,0.65) 0%, ${card.accent} 100%)` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: card.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px rgba(0,0,0,0.12)' }}>
                    <Icon size={17} color="white" strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text-strong)', lineHeight: 1 }}>{card.count}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--crm-text)' }}>{card.title}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--crm-text-muted)', lineHeight: 1.4 }}>{card.desc}</div>
                <Link href={card.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: card.ctaColor, marginTop: 2 }}>
                  {card.cta} <ArrowRight size={11} />
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
