'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Play, Pause, Pencil, Copy, Trash2, FlaskConical, Loader2,
  AlertCircle, CheckCircle, XCircle, Clock, History, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';
import { TRIGGER_MAP, ACTION_MAP, OPERATOR_MAP, CONDITION_FIELD_MAP } from '@/lib/ai/automation-catalog';
import type { Automation, AutomationStep, Execution, ConditionClause } from './types';
import { STATUS_META, EXEC_STATUS_META, stepSummary, fmtDate } from './types';

interface DetailProps {
  automation: Automation;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (a: Automation) => void;
}

export function AutomationDetail({ automation: initial, onClose, onChanged, onEdit }: DetailProps) {
  
  const [automation, setAutomation] = useState(initial);
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string | null }[]>([]);
  const [testContactId, setTestContactId] = useState('');
  const [mode, setMode] = useState<'simulate' | 'live'>('simulate');
  const [testResult, setTestResult] = useState<{ status: string; stepsLog?: { step_type: string; action?: string; status: string; detail: string }[]; error?: string | null } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<'flow' | 'history' | 'test'>('flow');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await v3fetch(`/api/v3/automations/${initial.id}`);
      const data = await res.json() as { automation?: Automation; steps?: AutomationStep[]; executions?: Execution[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      if (data.automation) setAutomation(data.automation);
      setSteps(data.steps ?? []);
      setExecutions(data.executions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [initial.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    (async () => {
      const cr = await v3fetch('/api/v3/contacts?limit=100');
      if (cr.ok) {
        const cd = await cr.json() as { data?: { id: string; name: string | null }[]; contacts?: { id: string; name: string | null }[] };
        setContacts(cd.data ?? cd.contacts ?? []);
      }
    })();
  }, []);

  async function toggleActive() {
    setBusy(true); setError(null);
    try {
      const next = automation.status === 'active' ? 'paused' : 'active';
      const res = await fetch(`/api/v3/automations/${automation.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const d = await res.json() as { automation?: Automation; error?: string };
      if (!res.ok || !d.automation) throw new Error(d.error ?? 'Failed');
      setAutomation(d.automation); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  async function duplicate() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v3/automations/${automation.id}/duplicate`, { method: 'POST' });
      const d = await res.json() as { automation?: Automation; error?: string };
      if (!res.ok || !d.automation) throw new Error(d.error ?? 'Failed');
      onChanged(); onEdit(d.automation);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`Delete "${automation.name}"? This cannot be undone.`)) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v3/automations/${automation.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed'); }
      onChanged(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); setBusy(false); }
  }

  async function runTest() {
    if (!testContactId) { setError('Select a contact first.'); return; }
    setBusy(true); setError(null); setTestResult(null);
    try {
      const res = await fetch(`/api/v3/automations/${automation.id}/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: testContactId, mode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Execution failed');
      setTestResult(d);
      if (mode === 'live') void load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Execution failed'); }
    finally { setBusy(false); }
  }

  const sm = STATUS_META[automation.status] ?? STATUS_META.draft;
  const trigger = TRIGGER_MAP[automation.trigger_type];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--crm-border-soft)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Zap size={19} color="white" />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{automation.name}</h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--crm-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{automation.description || trigger?.label || automation.trigger_type}</p>
              </div>
            </div>
            <button onClick={onClose} style={{ color: 'var(--crm-text-muted)', padding: 4, flexShrink: 0 }}><X size={18} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: sm.color, background: sm.bg, borderRadius: 6, padding: '4px 9px' }}>{sm.label}</span>
            {automation.ai_enabled && <span style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.12)', borderRadius: 6, padding: '4px 9px' }}>AI</span>}
            <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Ran {automation.execution_count ?? 0}× · {automation.success_count ?? 0} ok · {automation.failure_count ?? 0} failed</span>
            <div style={{ flex: 1 }} />
            <button onClick={toggleActive} disabled={busy} style={btn(automation.status === 'active' ? 'ghost' : 'primary')}>
              {automation.status === 'active' ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Activate</>}
            </button>
            <button onClick={() => onEdit(automation)} style={btn('ghost')}><Pencil size={13} /> Edit</button>
            <button onClick={duplicate} disabled={busy} style={btn('ghost')}><Copy size={13} /></button>
            <button onClick={remove} disabled={busy} style={btn('danger')}><Trash2 size={13} /></button>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
            {([['flow', 'Workflow'], ['history', 'History'], ['test', 'Test']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: '6px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600, background: tab === k ? 'rgba(79,109,245,0.12)' : 'transparent', color: tab === k ? 'var(--crm-primary)' : 'var(--crm-text-muted)' }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {error && (
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.2)' }}>
              <AlertCircle size={13} color="#f46b72" /><span style={{ fontSize: 12, color: '#f46b72' }}>{error}</span>
            </div>
          )}

          {tab === 'flow' && (
            loading ? <Spinner /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <TriggerNode label={trigger?.label ?? automation.trigger_type} />
                {steps.length === 0 && <p style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>No steps configured.</p>}
                {steps.map((s, i) => <StepNode key={s.id ?? i} step={s} index={i} />)}
              </div>
            )
          )}

          {tab === 'history' && (
            loading ? <Spinner /> : executions.length === 0 ? (
              <Empty icon={<History size={22} />} text="No executions yet. Run a test or wait for the trigger." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {executions.map(ex => {
                  const em = EXEC_STATUS_META[ex.status] ?? EXEC_STATUS_META.pending;
                  const open = expanded === ex.id;
                  return (
                    <div key={ex.id} style={{ borderRadius: 12, border: '1px solid var(--crm-border-soft)', background: 'rgba(255,255,255,0.45)', overflow: 'hidden' }}>
                      <button onClick={() => setExpanded(open ? null : ex.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', textAlign: 'left' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: em.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: em.color, minWidth: 76 }}>{em.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{fmtDate(ex.started_at)}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{ex.total_steps ? `${ex.current_step ?? 0}/${ex.total_steps} steps` : ''}</span>
                        {open ? <ChevronUp size={14} color="var(--crm-text-muted)" /> : <ChevronDown size={14} color="var(--crm-text-muted)" />}
                      </button>
                      {open && (
                        <div style={{ padding: '0 14px 12px 34px' }}>
                          {ex.error_message && <div style={{ fontSize: 11, color: '#f46b72', marginBottom: 6 }}>{ex.error_message}</div>}
                          {(ex.steps_log ?? []).map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '3px 0', color: 'var(--crm-text-secondary)' }}>
                              {s.status === 'completed' ? <CheckCircle size={12} color="#28c99a" /> : s.status === 'skipped' ? <Clock size={12} color="#f4c95d" /> : <XCircle size={12} color="#f46b72" />}
                              <strong>{s.action ?? s.step_type}</strong>: {s.detail}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'test' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['simulate', 'live'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: mode === m ? (m === 'live' ? 'rgba(244,107,114,0.12)' : 'rgba(79,109,245,0.12)') : 'rgba(255,255,255,0.5)', color: mode === m ? (m === 'live' ? '#f46b72' : 'var(--crm-primary)') : 'var(--crm-text-muted)', border: '1px solid var(--crm-border-soft)' }}>
                    {m === 'simulate' ? 'Simulate (safe)' : 'Run Live'}
                  </button>
                ))}
              </div>
              {mode === 'live' && (
                <div style={{ fontSize: 11, color: '#f46b72', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <AlertCircle size={13} /> Live mode sends real messages and updates records.
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Test Contact</label>
                <select value={testContactId} onChange={e => setTestContactId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.6)', fontSize: 13, color: 'var(--crm-text)', cursor: 'pointer' }}>
                  <option value="">Select a contact…</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
                </select>
              </div>
              <button onClick={runTest} disabled={busy} style={{ ...btn('primary'), justifyContent: 'center', padding: '11px' }}>
                {busy ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />} {mode === 'simulate' ? 'Run Simulation' : 'Execute Now'}
              </button>
              {testResult && (
                <div style={{ borderRadius: 12, border: '1px solid var(--crm-border-soft)', background: 'rgba(255,255,255,0.45)', padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: testResult.status === 'failed' ? '#f46b72' : '#28c99a', marginBottom: 8 }}>
                    {testResult.status === 'failed' ? 'Failed' : testResult.status === 'waiting' ? 'Paused (waiting)' : 'Completed'}
                  </div>
                  {testResult.error && <div style={{ fontSize: 11, color: '#f46b72', marginBottom: 6 }}>{testResult.error}</div>}
                  {(testResult.stepsLog ?? []).map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '4px 0', borderTop: i ? '1px solid var(--crm-border-soft)' : 'none', color: 'var(--crm-text-secondary)' }}>
                      {s.status === 'completed' ? <CheckCircle size={12} color="#28c99a" /> : s.status === 'skipped' ? <Clock size={12} color="#f4c95d" /> : <XCircle size={12} color="#f46b72" />}
                      <span><strong>{ACTIONS_LABEL(s)}</strong>: {s.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ACTIONS_LABEL(s: { step_type: string; action?: string }) {
  return ACTION_MAP[s.action ?? s.step_type]?.label ?? s.step_type;
}

function TriggerNode({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: '#4d7cff', background: 'rgba(77,124,255,0.12)', border: '1px solid rgba(77,124,255,0.25)', borderRadius: 6, padding: '3px 8px', minWidth: 74, textAlign: 'center' }}>TRIGGER</span>
      <span style={{ fontSize: 13, color: 'var(--crm-text)' }}>{label}</span>
    </div>
  );
}

function StepNode({ step, index }: { step: AutomationStep; index: number }) {
  const isCond = step.step_type === 'condition';
  const isWait = step.step_type === 'wait';
  const color = isCond ? '#28c99a' : isWait ? '#8790aa' : '#f4c95d';
  const label = isCond ? 'CONDITION' : isWait ? 'WAIT' : 'ACTION';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color, background: `${color}15`, border: `1px solid ${color}30`, borderRadius: 6, padding: '3px 8px', minWidth: 74, textAlign: 'center', marginTop: 2 }}>{label}</span>
      <div>
        <span style={{ fontSize: 13, color: 'var(--crm-text)' }}>{stepSummary(step)}</span>
        {isCond && <ConditionList step={step} />}
        <div style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>step {index + 1}</div>
      </div>
    </div>
  );
}

function ConditionList({ step }: { step: AutomationStep }) {
  const cfg = step.config as { match?: string; conditions?: ConditionClause[] };
  if (!cfg.conditions?.length) return null;
  return (
    <div style={{ marginTop: 4 }}>
      {cfg.conditions.map((c, i) => (
        <div key={i} style={{ fontSize: 11, color: 'var(--crm-text-secondary)' }}>
          <span style={{ color: 'var(--crm-text-muted)' }}>{i > 0 ? (cfg.match === 'any' ? 'OR' : 'AND') + ' ' : ''}</span>
          {CONDITION_FIELD_MAP[c.field]?.label ?? c.field} <em>{OPERATOR_MAP[c.operator]?.label ?? c.operator}</em> {OPERATOR_MAP[c.operator]?.valueType !== 'none' ? c.value : ''}
        </div>
      ))}
    </div>
  );
}

function Spinner() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader2 size={22} className="spin" color="var(--crm-primary)" /></div>;
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 30, color: 'var(--crm-text-muted)' }}>{icon}<span style={{ fontSize: 12 }}>{text}</span></div>;
}

function btn(variant: 'primary' | 'ghost' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10, fontSize: 12, fontWeight: 600 };
  if (variant === 'primary') return { ...base, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white' };
  if (variant === 'danger') return { ...base, background: 'rgba(244,107,114,0.10)', color: '#f46b72', border: '1px solid rgba(244,107,114,0.2)' };
  return { ...base, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(130,145,190,0.28)', color: 'var(--crm-text-secondary)' };
}
