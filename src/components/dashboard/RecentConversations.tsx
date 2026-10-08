'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';

const convos = [
  { name: 'Priya Sharma',  msg: 'Can you share the pricing details?',    platform: 'IG', platformColor: '#f46b72', time: '2m',  color: '#f46b72' },
  { name: 'Rahul Mehta',   msg: "I'm interested in your services.",       platform: 'WA', platformColor: '#28c99a', time: '1m',  color: '#28c99a' },
  { name: 'Sneha Kapoor',  msg: 'Do you have a demo?',                    platform: 'FB', platformColor: '#4d7cff', time: '18m', color: '#4d7cff' },
  { name: 'Amit Verma',    msg: 'Can we schedule a call?',                platform: 'EM', platformColor: '#8b5cf6', time: '25m', color: '#8b5cf6' },
  { name: 'Neha Singh',    msg: 'Looking forward to your response.',      platform: 'WA', platformColor: '#28c99a', time: '32m', color: '#28c99a' },
];

export function RecentConversations() {
  return (
    <GlassPanel className="crm-table-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Recent Conversations</div>
        <Link href="/inbox" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--crm-primary)' }}>
          View all <ArrowRight size={12} />
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {convos.map(c => (
          <Link key={c.name} href="/inbox" className="crm-conv-card">
            {/* Avatar */}
            <div
              className="crm-conv-avatar"
              style={{ background: `linear-gradient(135deg,${c.color}55,${c.color}22)`, color: c.color }}
            >
              {c.name[0]}
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="crm-conv-name">{c.name}</div>
              <div className="crm-conv-msg">{c.msg}</div>
            </div>

            {/* Platform + time */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
              <div className="crm-conv-platform" style={{ background: c.platformColor }}>
                {c.platform}
              </div>
              <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>{c.time}</span>
            </div>
          </Link>
        ))}
      </div>
    </GlassPanel>
  );
}
