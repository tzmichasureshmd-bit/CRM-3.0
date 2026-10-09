'use client';

import { useState, useEffect, useCallback } from 'react';
import { Rss, Plus, Send, Clock, CheckCheck, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Broadcast {
  id: string;
  name: string;
  status: string;
  platform: string | null;
  total_recipients: number | null;
  sent_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  created_at: string;
  scheduled_at: string | null;
}

const STATUS_META: Record<string, { color: string; icon: React.ReactNode }> = {
  sent:      { color: '#28c99a', icon: <CheckCheck size={12} /> },
  scheduled: { color: '#4d7cff', icon: <Clock size={12} /> },
  draft:     { color: '#8790aa', icon: <Rss size={12} /> },
  failed:    { color: '#f46b72', icon: <XCircle size={12} /> },
  sending:   { color: '#f4c95d', icon: <Send size={12} /> },
};

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(50);
    setBroadcasts((data as Broadcast[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Broadcasts</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>Send bulk messages across all channels</p>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> New Broadcast
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading broadcasts...</div>
        ) : broadcasts.length === 0 ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <Rss size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
            <p style={{ margin: 0 }}>No broadcasts yet</p>
          </div>
        ) : broadcasts.map(b => {
          const sm = STATUS_META[b.status] ?? STATUS_META.draft;
          const deliveryRate = b.total_recipients ? Math.round(((b.delivered_count ?? 0) / b.total_recipients) * 100) : 0;
          const readRate = b.delivered_count ? Math.round(((b.read_count ?? 0) / b.delivered_count) * 100) : 0;
          return (
            <div key={b.id} className="crm-glass-soft" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(79,109,245,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Rss size={18} color="#4f6df5" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)' }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
                    {b.platform ?? 'WhatsApp'} · {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: sm.color, background: `${sm.color}15`, borderRadius: 8, padding: '3px 8px' }}>
                  {sm.icon}{b.status}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                  { label: 'Recipients', value: (b.total_recipients ?? 0).toLocaleString() },
                  { label: 'Sent', value: (b.sent_count ?? 0).toLocaleString() },
                  { label: 'Delivered', value: `${deliveryRate}%` },
                  { label: 'Read Rate', value: `${readRate}%` },
                ].map(stat => (
                  <div key={stat.label} style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.40)', borderRadius: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
