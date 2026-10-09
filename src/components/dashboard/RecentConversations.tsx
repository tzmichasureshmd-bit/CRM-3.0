'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { createClient } from '@/lib/supabase/client';

interface Conv {
  id: string;
  platform: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  contact: { name: string | null } | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: '#28c99a', instagram: '#f46b72', facebook: '#4d7cff',
  email: '#8b5cf6', telegram: '#06b6d4',
};
const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: 'WA', instagram: 'IG', facebook: 'FB', email: 'EM', telegram: 'TG',
};

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function RecentConversations() {
  const [convos, setConvos] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select('id, platform, last_message_text, last_message_at, unread_count, contact:contacts(name)')
      .eq('status', 'open')
      .order('last_message_at', { ascending: false })
      .limit(5);
    setConvos((data as Conv[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <GlassPanel className="crm-table-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text-strong)' }}>Recent Conversations</div>
        <Link href="/inbox" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--crm-primary)' }}>
          View all <ArrowRight size={12} />
        </Link>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.40)', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
        </div>
      ) : convos.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>No open conversations</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {convos.map(c => {
            const platColor = PLATFORM_COLORS[c.platform ?? ''] ?? '#8790aa';
            const platLabel = PLATFORM_LABELS[c.platform ?? ''] ?? '??';
            const name = c.contact?.name ?? 'Unknown';
            return (
              <Link key={c.id} href="/inbox" className="crm-conv-card">
                <div className="crm-conv-avatar" style={{ background: `linear-gradient(135deg,${platColor}55,${platColor}22)`, color: platColor }}>
                  {name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="crm-conv-name">{name}</div>
                  <div className="crm-conv-msg">{c.last_message_text ?? 'No messages'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <div className="crm-conv-platform" style={{ background: platColor }}>{platLabel}</div>
                  <span style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>{timeAgo(c.last_message_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}
