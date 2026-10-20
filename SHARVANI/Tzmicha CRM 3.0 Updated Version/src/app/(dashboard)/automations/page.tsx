'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, Plus, Play, Pause, Brain, Search, RefreshCw, Trash2, ChevronRight,
  AlertCircle, X, History, BarChart3, Loader2, Inbox, LayoutTemplate,
} from 'lucide-react';
import { TRIGGER_MAP } from '@/lib/ai/automation-catalog';
import { AutomationBuilder } from '@/components/automations/Builder';
import { AutomationDetail } from '@/components/automations/Detail';
import { ActivityFeed } from '@/components/automations/ActivityFeed';
import { WorkflowPipeline } from '@/components/automations/WorkflowPipeline';
import type { Automation, AutomationSummary, AgentLite } from '@/components/automations/types';
import { STATUS_META, timeAgo } from '@/components/automations/types';

const EMPTY_SUMMARY: AutomationSummary = { total: 0, active: 0, draft: 0, paused: 0, archived: 0, executions: 0, successes: 0, failures: 0 };

export default function AutomationsPage() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [summary, setSummary] = useState<AutomationSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [toolsCount, setToolsCount] = useState(0);
  const [tools, setTools] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [showBuilder, setShowBuilder] = useState(false);
  const [editing, setEditing] = useState<{ automation: Automation } | null>(null);
  const [detail, setDetail] = useState<Automation | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/v3/automations');
      const data = await res.json() as { automations?: Automation[]; summary?: AutomationSummary; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load automations');
      setAutomations(data.automations ?? []);
      setSummary(data.summary ?? EMPTY_SUMMARY);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load automations');
    } finally { setLoading(false); }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const [aRes, tRes] = await Promise.all([
        fetch('/api/v3/agents'),
        fetch('/api/v3/agents/tools'),
      ]);
      if (aRes.ok) {
        const d = await aRes.json() as { agents?: AgentLite[] };
        setAgents(d.agents ?? []);
      }
      if (tRes.ok) {
        const d = await tRes.json() as { tools?: { name?: string }[] };
        const names = (d.tools ?? []).map(x => x.name).filter((n): n is string => !!n);
        setTools(names);
        setToolsCount(names.length);
      }
    } catch { /* agents are optional context for the dashboard */ }
  }, []);

  useEffect(() => { void load(); void loadAgents(); }, [load, loadAgents]);

  const refreshAll = useCallback(() => { void load(); void loadAgents(); }, [load, loadAgents]);

  const filtered = useMemo(() => {
    return automations.filter(a => {
      if (filter !== 'all' && a.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [automations, filter, search]);

  const enabledAgents = useMemo(() => agents.filter(a => a.enabled), [agents]);
  const toolsInUse = useMemo(() => new Set(enabledAgents.flatMap(a => a.allowed_tools)).size, [enabledAgents]);
  const successRate = summary.executions > 0 ? Math.round((summary.successes / summary.executions) * 100) : 0;
  const lastRunAt = useMemo(
    () => automations.reduce<string | null>((acc, a) => (a.last_run_at && (!acc || a.last_run_at > acc) ? a.last_run_at : acc), null),
    [automations],
  );

  async function toggleRow(a: Automation) {
    setRowBusy(a.id);
    try {
      const next = a.status === 'active' ? 'paused' : 'active';
      const res = await fetch(`/api/v3/automations/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed'); }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setRowBusy(null); }
  }

  async function deleteRow(a: Automation) {
    if (!confirm(`Delete "${a.name}"? This cannot be undone.`)) return;
    setRowBusy(a.id);
    try {
      const res = await fetch(`/api/v3/automations/${a.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed'); }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setRowBusy(null); }
  }

  function openCreate() {
    setEditing(null); setShowBuilder(true);
  }

  function browseTemplates() {
    router.push('/agents#templates');
  }

  const FILTERS = ['all', 'active', 'draft', 'paused', 'archived'];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1240, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(79,109,245,0.35)' }}>
            <Zap size={22} color="white" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 780, color: 'var(--crm-text)', letterSpacing: '-0.01em' }}>Automations</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--crm-text-muted)' }}>AI agents and trigger-based workflows that run for you, 24/7.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={browseTemplates} style={hbtn('ghost')}><LayoutTemplate size={15} /> Browse Templates</button>
          <button onClick={() => setShowActivity(true)} style={hbtn('ghost')}><History size={15} /> Execution History</button>
          <button onClick={refreshAll} style={hbtn('ghost')} title="Refresh status"><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>
          <button onClick={openCreate} style={hbtn('primary')}><Plus size={15} /> Create Automation</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
        <Card icon={<Zap size={16} />} color="#4d7cff" label="Total" value={summary.total} />
        <Card icon={<Play size={16} />} color="#28c99a" label="Active" value={summary.active} />
        <Card icon={<Brain size={16} />} color="#8b5cf6" label="AI Agents" value={`${enabledAgents.length}/${agents.length}`} />
        <Card icon={<BarChart3 size={16} />} color="#f4c95d" label="Executions" value={summary.executions} />
        <Card icon={<Brain size={16} />} color="#f59e0b" label="Success Rate" value={`${successRate}%`} />
      </div>

      {/* Architecture pipeline */}
      <div style={{ marginBottom: 20 }}>
        <WorkflowPipeline
          metrics={{
            activeAutomations: summary.active,
            totalAutomations: summary.total,
            enabledAgents: enabledAgents.length,
            totalAgents: agents.length,
            toolsInUse,
            totalExecutions: summary.executions,
            completedExecutions: summary.successes,
            successRate,
            lastRunAt,
          }}
        />
      </div>

      {/* Automations management */}
      <div className="crm-glass" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--crm-border-soft)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Zap size={16} color="var(--crm-primary)" />
            <span style={{ fontSize: 14, fontWeight: 750, color: 'var(--crm-text)' }}>Your Automations</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
            <Search size={15} color="var(--crm-text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search automations…" style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.6)', fontSize: 13, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '7px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, textTransform: 'capitalize', background: filter === f ? 'rgba(79,109,245,0.12)' : 'transparent', color: filter === f ? 'var(--crm-primary)' : 'var(--crm-text-muted)' }}>{f}</button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ margin: 16, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.2)' }}>
            <AlertCircle size={15} color="#f46b72" /><span style={{ fontSize: 13, color: '#f46b72', flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} style={{ color: '#f46b72' }}><X size={14} /></button>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 18 }}>
            {[0, 1, 2].map(i => <div key={i} className="crm-skeleton" style={{ height: 60, borderRadius: 12 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '56px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(79,109,245,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Inbox size={26} color="var(--crm-primary)" /></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{automations.length === 0 ? 'No automations yet' : 'No matches'}</div>
              <div style={{ fontSize: 13, color: 'var(--crm-text-muted)', marginTop: 4 }}>{automations.length === 0 ? 'Start from a template or create your first automation.' : 'Try a different search or filter.'}</div>
            </div>
            {automations.length === 0 && <button onClick={openCreate} style={hbtn('primary')}><Plus size={15} /> Create Automation</button>}
          </div>
        ) : (
          <div>
            {filtered.map(a => {
              const sm = STATUS_META[a.status] ?? STATUS_META.draft;
              const trigger = TRIGGER_MAP[a.trigger_type];
              const rate = a.execution_count > 0 ? Math.round((a.success_count / a.execution_count) * 100) : null;
              return (
                <div key={a.id} className="crm-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--crm-border-soft)', cursor: 'pointer' }} onClick={() => setDetail(a)}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: sm.bg, color: sm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {a.status === 'active' ? <Play size={16} /> : a.status === 'paused' ? <Pause size={16} /> : <Zap size={16} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      {a.ai_enabled && <Brain size={12} color="#8b5cf6" />}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {trigger?.label ?? a.trigger_type}{a.description ? ` · ${a.description}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sm.color, background: sm.bg, borderRadius: 7, padding: '4px 9px', flexShrink: 0 }}>{sm.label}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 74, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)' }}>{a.execution_count ?? 0} runs</span>
                    <span style={{ fontSize: 10, color: rate === null ? 'var(--crm-text-muted)' : rate >= 90 ? '#28c99a' : rate >= 70 ? '#f4c95d' : '#f46b72' }}>{rate === null ? '—' : `${rate}% ok`}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', minWidth: 74, flexShrink: 0, textAlign: 'right' }}>{timeAgo(a.last_run_at)}</div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <IconBtn title={a.status === 'active' ? 'Pause' : 'Activate'} onClick={() => toggleRow(a)} disabled={rowBusy === a.id}>
                      {rowBusy === a.id ? <Loader2 size={14} className="spin" /> : a.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                    </IconBtn>
                    <IconBtn title="Delete" danger onClick={() => deleteRow(a)} disabled={rowBusy === a.id}><Trash2 size={14} /></IconBtn>
                    <IconBtn title="Open" onClick={() => setDetail(a)}><ChevronRight size={15} /></IconBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showBuilder && (
        <AutomationBuilder
          initial={editing}
          onClose={() => { setShowBuilder(false); setEditing(null); }}
          onSaved={() => { setShowBuilder(false); setEditing(null); void load(); }}
        />
      )}

      {detail && (
        <AutomationDetail
          automation={detail}
          onClose={() => setDetail(null)}
          onChanged={load}
          onEdit={(a) => { setDetail(null); setEditing({ automation: a }); setShowBuilder(true); }}
        />
      )}

      {showActivity && <ActivityFeed onClose={() => setShowActivity(false)} />}
    </div>
  );
}

function Card({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: number | string }) {
  return (
    <div className="crm-glass" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 11, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 780, color: 'var(--crm-text)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} style={{ padding: 8, borderRadius: 9, color: danger ? '#f46b72' : 'var(--crm-text-muted)', opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

function hbtn(variant: 'primary' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 11, fontSize: 13, fontWeight: 650 };
  if (variant === 'primary') return { ...base, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', boxShadow: '0 6px 18px rgba(79,109,245,0.28)' };
  return { ...base, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(130,145,190,0.28)', color: 'var(--crm-text-secondary)' };
}
