'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Clock, CheckCircle, AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface FollowUp {
  id: string;
  title: string;
  due_date: string;
  status: string;
  contact_id: string | null;
  notes: string | null;
  contacts?: { name: string | null } | null;
}

function timeStatus(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const hours = diff / 3_600_000;
  if (hours < 0) return { label: `${Math.abs(Math.floor(hours))}h overdue`, color: '#f46b72', overdue: true };
  if (hours < 2) return { label: 'Due soon', color: '#f4c95d', overdue: false };
  if (hours < 24) return { label: `${Math.floor(hours)}h left`, color: '#4d7cff', overdue: false };
  return { label: `${Math.floor(hours / 24)}d left`, color: '#28c99a', overdue: false };
}

export default function FollowUpsPage() {
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('follow_ups').select('*, contacts(name)').eq('status', 'pending').order('due_date', { ascending: true }).limit(100);
    setFollowups((data as FollowUp[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const now = Date.now();
  const filtered = followups.filter(f => {
    const due = new Date(f.due_date).getTime();
    if (filter === 'overdue') return due < now;
    if (filter === 'today') return due >= now && due < now + 86_400_000;
    if (filter === 'upcoming') return due >= now + 86_400_000;
    return true;
  });

  const overdue = followups.filter(f => new Date(f.due_date).getTime() < now).length;
  const today = followups.filter(f => { const d = new Date(f.due_date).getTime(); return d >= now && d < now + 86_400_000; }).length;

  async function markDone(id: string) {
    await supabase.from('follow_ups').update({ status: 'completed' }).eq('id', id);
    setFollowups(prev => prev.filter(f => f.id !== id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Follow-ups</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>{overdue > 0 ? `⚠️ ${overdue} overdue · ` : ''}{today} due today</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.75)', color: 'var(--crm-text-secondary)', fontSize: 13, cursor: 'pointer' }}>
            <RefreshCw size={13} />
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Add Follow-up
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['all', 'overdue', 'today', 'upcoming'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            background: filter === f ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)',
            color: filter === f ? 'white' : 'var(--crm-text-secondary)',
          }}>
            {f}{f === 'overdue' && overdue > 0 ? ` (${overdue})` : f === 'today' && today > 0 ? ` (${today})` : ''}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <CalendarDays size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
            <p style={{ margin: 0 }}>No follow-ups in this category</p>
          </div>
        ) : filtered.map(f => {
          const ts = timeStatus(f.due_date);
          return (
            <div key={f.id} className="crm-glass-soft" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: `3px solid ${ts.color}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: `${ts.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {ts.overdue ? <AlertCircle size={18} color={ts.color} /> : <Clock size={18} color={ts.color} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)', marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
                  {f.contacts?.name ?? 'Unknown contact'} · {new Date(f.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                {f.notes && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>{f.notes}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ts.color, background: `${ts.color}15`, borderRadius: 8, padding: '3px 8px' }}>{ts.label}</span>
                <button onClick={() => void markDone(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 10, background: 'rgba(40,201,154,0.10)', border: '1px solid rgba(40,201,154,0.25)', color: '#28c99a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <CheckCircle size={12} /> Done
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
