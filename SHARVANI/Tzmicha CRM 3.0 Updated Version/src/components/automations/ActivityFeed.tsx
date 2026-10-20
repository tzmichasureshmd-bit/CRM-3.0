'use client';

import { useState, useEffect } from 'react';
import { X, History, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { Execution } from './types';
import { EXEC_STATUS_META, fmtDate } from './types';

export function ActivityFeed({ onClose }: { onClose: () => void }) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/v3/automations/executions?limit=100${filter !== 'all' ? `&status=${filter}` : ''}`);
      const d = await res.json() as { executions?: Execution[]; error?: string };
      if (!res.ok) throw new Error(d.error ?? 'Failed to load');
      setExecutions(d.executions ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [filter]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 660, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--crm-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <History size={18} color="var(--crm-primary)" />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>Automation Activity</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={load} style={{ padding: 6, color: 'var(--crm-text-muted)' }}><RefreshCw size={15} className={loading ? 'spin' : ''} /></button>
            <button onClick={onClose} style={{ padding: 6, color: 'var(--crm-text-muted)' }}><X size={18} /></button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '10px 22px', borderBottom: '1px solid var(--crm-border-soft)', flexShrink: 0, overflowX: 'auto' }}>
          {['all', 'completed', 'running', 'waiting', 'failed'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap', background: filter === f ? 'rgba(79,109,245,0.12)' : 'transparent', color: filter === f ? 'var(--crm-primary)' : 'var(--crm-text-muted)' }}>{f}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {error && <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', marginBottom: 12 }}><AlertCircle size={13} color="#f46b72" /><span style={{ fontSize: 12, color: '#f46b72' }}>{error}</span></div>}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader2 size={22} className="spin" color="var(--crm-primary)" /></div>
          ) : executions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--crm-text-muted)' }}>No execution activity yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {executions.map(ex => {
                const em = EXEC_STATUS_META[ex.status] ?? EXEC_STATUS_META.pending;
                return (
                  <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11, border: '1px solid var(--crm-border-soft)', background: 'rgba(255,255,255,0.4)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: em.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.automation_name ?? 'Automation'}</div>
                      <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{ex.trigger_type} · {fmtDate(ex.started_at)}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: em.color, background: `${em.color}18`, borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>{em.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
