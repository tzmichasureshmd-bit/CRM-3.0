'use client';

import Link from 'next/link';
import { ArrowRight, Shuffle } from 'lucide-react';
import { Flame, Clock, MessageSquare, TrendingUp, Brain, Megaphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

const INITIAL_CARDS = [
  { id: 1, icon: Flame,         iconBg: 'linear-gradient(135deg,#ff6b6b,#ff8e53)', count: 5,  title: 'Hot Leads',           desc: 'Waiting for response',  href: '/leads',       cta: 'View Leads',           ctaColor: '#f46b72', accent: 'rgba(244,107,114,0.08)' },
  { id: 2, icon: Clock,         iconBg: 'linear-gradient(135deg,#f4c95d,#ffb347)', count: 3,  title: 'Follow-ups',          desc: 'Overdue follow-ups',    href: '/follow-ups',  cta: 'View Follow-ups',      ctaColor: '#f4a23a', accent: 'rgba(244,201,93,0.08)'  },
  { id: 3, icon: MessageSquare, iconBg: 'linear-gradient(135deg,#4d7cff,#6fa3ff)', count: 12, title: 'Conversations',       desc: 'Important messages',    href: '/inbox',       cta: 'Open Inbox',           ctaColor: '#4d7cff', accent: 'rgba(77,124,255,0.08)'  },
  { id: 4, icon: TrendingUp,    iconBg: 'linear-gradient(135deg,#28c99a,#20e3b2)', count: 4,  title: 'Opportunities',       desc: 'Likely to convert',     href: '/pipelines',   cta: 'View Deals',           ctaColor: '#28c99a', accent: 'rgba(40,201,154,0.08)'  },
  { id: 5, icon: Brain,         iconBg: 'linear-gradient(135deg,#8b5cf6,#a78bfa)', count: 3,  title: 'AI Recommendations',  desc: 'Actions suggested',     href: '/ai-center',   cta: 'View Recommendations', ctaColor: '#8b5cf6', accent: 'rgba(139,92,246,0.08)'  },
  { id: 6, icon: Megaphone,     iconBg: 'linear-gradient(135deg,#ec78b5,#f472b6)', count: 2,  title: 'Campaigns',           desc: 'Need attention',        href: '/campaigns',   cta: 'View Campaigns',       ctaColor: '#ec78b5', accent: 'rgba(236,120,181,0.08)' },
];

const springTransition = {
  type: 'spring' as const,
  visualDuration: 0.3,
  bounce: 0.2,
};

export function AttentionSection() {
  const [cards, setCards] = useState(INITIAL_CARDS);

  function shuffle() {
    setCards(prev => [...prev].sort(() => Math.random() - 0.5));
  }

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--crm-text)' }}>
          What Needs Your Attention?
        </div>
        <button
          onClick={shuffle}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.55)',
            border: '1px solid rgba(255,255,255,0.72)',
            fontSize: 12, fontWeight: 600,
            color: 'var(--crm-text-secondary)',
            cursor: 'pointer', transition: 'all 150ms',
          }}
        >
          <Shuffle size={13} />
          Shuffle
        </button>
      </div>

      <div className="crm-attention-grid">
        <AnimatePresence mode="popLayout">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.id}
                layout
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={springTransition}
                className="crm-attention-card"
                style={{ background: `linear-gradient(135deg, rgba(255,255,255,0.65) 0%, ${card.accent} 100%)` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 12,
                    background: card.iconBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
                  }}>
                    <Icon size={17} color="white" strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', lineHeight: 1 }}>{card.count}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--crm-text)' }}>{card.title}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--crm-text-muted)' }}>{card.desc}</div>
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
