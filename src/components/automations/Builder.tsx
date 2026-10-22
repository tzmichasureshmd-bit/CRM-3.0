'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  X, ArrowRight, ArrowLeft, Plus, Trash2, Brain, Check, Loader2, Save, Rocket,
  FlaskConical, AlertCircle, ChevronUp, ChevronDown, Zap, AlertTriangle,
} from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';
import {
  TRIGGER_GROUPS, TRIGGER_MAP, ACTIONS, ACTION_MAP, CONDITION_FIELDS,
  CONDITION_FIELD_MAP, OPERATORS, OPERATOR_MAP, CHANNELS,
} from '@/lib/ai/automation-catalog';
import type { Automation, AutomationStep, ConditionClause } from './types';
import { stepSummary } from './types';

interface DraftAction { id: string; type: string; config: Record<string, unknown> }

export interface TemplateDraft {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  aiEnabled?: boolean;
  match: 'all' | 'any';
  conditions: { field: string; operator: string; value?: string }[];
  actions: { type: string; config: Record<string, unknown> }[];
}

interface BuilderProps {
  initial?: { automation: Automation; steps?: AutomationStep[] } | null;
  template?: TemplateDraft | null;
  onClose: () => void;
  onSaved: (automation: Automation, activated: boolean) => void;
}

const WIZARD = [
  { n: 'Basics', desc: 'Name & description' },
  { n: 'Trigger', desc: 'When it starts' },
  { n: 'Conditions', desc: 'Who it applies to' },
  { n: 'Actions', desc: 'What happens' },
  { n: 'Timing', desc: 'Schedule & delays' },
  { n: 'Review', desc: 'Test & save' },
];

function uid() { return Math.random().toString(36).slice(2, 10); }

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)',
  fontSize: 13, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6,
};

export function AutomationBuilder({ initial, template, onClose, onSaved }: BuilderProps) {
  

  const editing = !!initial;
  const seed = !editing ? template ?? null : null;
  const [wizard, setWizard] = useState(0);
  const [name, setName] = useState(initial?.automation.name ?? seed?.name ?? '');
  const [description, setDescription] = useState(initial?.automation.description ?? seed?.description ?? '');
  const [aiEnabled, setAiEnabled] = useState(initial?.automation.ai_enabled ?? seed?.aiEnabled ?? false);
  const [triggerType, setTriggerType] = useState(initial?.automation.trigger_type ?? seed?.triggerType ?? 'manual');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(initial?.automation.trigger_config ?? seed?.triggerConfig ?? {});
  const [match, setMatch] = useState<'all' | 'any'>(seed?.match ?? 'all');
  const [conditions, setConditions] = useState<ConditionClause[]>(seed?.conditions ?? []);
  const [actions, setActions] = useState<DraftAction[]>([]);
  const [includeEnd, setIncludeEnd] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string | null }[]>([]);
  const [users, setUsers] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [testContactId, setTestContactId] = useState('');
  const [testing, setTesting] = useState(false);
  const [simResult, setSimResult] = useState<{ status: string; stepsLog: { step_type: string; action?: string; status: string; detail: string }[]; error?: string | null } | null>(null);

  // Hydrate existing steps
  useEffect(() => {
    if (!initial) {
      if (template?.actions?.length) {
        setActions(template.actions.map(a => ({ id: uid(), type: a.type, config: a.config })));
      } else {
        setActions([{ id: uid(), type: 'send_notification', config: {} }]);
      }
      return;
    }
    const apply = (allSteps: AutomationStep[]) => {
      const conds: ConditionClause[] = [];
      const acts: DraftAction[] = [];
      let hasEnd = false;
      for (const s of [...allSteps].sort((a, b) => a.position - b.position)) {
        if (s.step_type === 'condition') {
          const cfg = s.config as { match?: 'all' | 'any'; conditions?: ConditionClause[]; field?: string; operator?: string; value?: string };
          if (cfg.match) setMatch(cfg.match);
          if (Array.isArray(cfg.conditions)) conds.push(...cfg.conditions);
          else if (cfg.field) conds.push({ field: cfg.field, operator: cfg.operator ?? 'eq', value: String(cfg.value ?? '') });
        } else if (s.step_type === 'end') {
          hasEnd = true;
        } else {
          const type = String((s.config as { action?: string }).action ?? s.step_type);
          acts.push({ id: uid(), type, config: (s.config ?? {}) as Record<string, unknown> });
        }
      }
      setConditions(conds);
      setActions(acts.length ? acts : []);
      setIncludeEnd(hasEnd);
    };

    if (initial.steps) { apply(initial.steps); return; }
    (async () => {
      try {
        const res = await fetch(`/api/v3/automations/${initial.automation.id}`);
        const d = await res.json() as { steps?: AutomationStep[] };
        apply(d.steps ?? []);
      } catch { apply([]); }
    })();
  }, [initial, template]);

  useEffect(() => {
    (async () => {
      const [cr, pr] = await Promise.all([
        v3fetch('/api/v3/contacts?limit=100').then(r => r.ok ? r.json() : {}),
        v3fetch('/api/v3/profile').then(r => r.ok ? r.json() : {}),
      ]);
      const cData = (cr as { data?: { id: string; name: string | null }[]; contacts?: { id: string; name: string | null }[] }).data ?? (cr as { contacts?: { id: string; name: string | null }[] }).contacts ?? [];
      setContacts(cData);
      const pData = (pr as { profile?: { user_id: string; full_name: string | null } }).profile;
      if (pData) setUsers([pData]);
    })();
  }, []);

  const triggerDef = TRIGGER_MAP[triggerType];
  const isSchedule = triggerType === 'schedule';

  function addAction(type = 'send_message') {
    setActions(prev => [...prev, { id: uid(), type, config: {} }]);
  }
  function updateAction(id: string, patch: Partial<DraftAction>) {
    setActions(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }
  function updateActionConfig(id: string, key: string, value: unknown) {
    setActions(prev => prev.map(a => a.id === id ? { ...a, config: { ...a.config, [key]: value } } : a));
  }
  function moveAction(idx: number, dir: -1 | 1) {
    setActions(prev => {
      const next = [...prev];
      const t = idx + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[idx], next[t]] = [next[t], next[idx]];
      return next;
    });
  }

  function addCondition() {
    setConditions(prev => [...prev, { field: 'lead_status', operator: 'eq', value: 'new' }]);
  }
  function updateCondition(i: number, patch: Partial<ConditionClause>) {
    setConditions(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }
  function removeCondition(i: number) {
    setConditions(prev => prev.filter((_, idx) => idx !== i));
  }

  function validateWizard(index: number): string | null {
    if (index === 0 && !name.trim()) return 'Please give your automation a name.';
    if (index === 1) {
      if (!triggerType) return 'Please choose a trigger.';
      if (isSchedule && !triggerConfig.interval_minutes) return 'Please set the run interval.';
    }
    if (index === 2) {
      for (const c of conditions) {
        if (!c.field || !c.operator) return 'Each condition needs a field and operator.';
        const op = OPERATOR_MAP[c.operator];
        if (op && op.valueType !== 'none' && (c.value === undefined || c.value === '')) return 'Each condition needs a value.';
      }
    }
    if (index === 3) {
      if (actions.length === 0) return 'Add at least one action.';
      for (const a of actions) {
        const def = ACTION_MAP[a.type];
        if (!def) return `Unknown action "${a.type}".`;
        for (const f of def.fields) {
          if (f.required && (a.config[f.key] === undefined || a.config[f.key] === '')) return `"${def.label}": ${f.label} is required.`;
        }
      }
    }
    return null;
  }

  function next() {
    const err = validateWizard(wizard);
    if (err) { setError(err); return; }
    setError(null);
    setWizard(w => Math.min(WIZARD.length - 1, w + 1));
  }

  function buildSteps(): AutomationStep[] {
    const steps: AutomationStep[] = [];
    let pos = 0;
    if (conditions.length > 0) {
      steps.push({ step_type: 'condition', position: pos++, config: { match, conditions } });
    }
    for (const a of actions) {
      steps.push({ step_type: a.type, position: pos++, config: a.config });
    }
    if (includeEnd) steps.push({ step_type: 'end', position: pos++, config: {} });
    return steps;
  }

  async function save(activate: boolean) {
    for (let i = 0; i < WIZARD.length - 1; i++) {
      const err = validateWizard(i);
      if (err) { setWizard(i); setError(err); return; }
    }
    setSaving(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(), description: description || null,
        trigger_type: triggerType, trigger_config: triggerConfig,
        ai_enabled: aiEnabled, steps: buildSteps(), activate,
      };
      // POST derives status from `activate`; PATCH only reads `status`.
      if (editing) { if (activate) payload.status = 'active'; }
      else payload.status = activate ? 'active' : 'draft';
      const res = await fetch(editing ? `/api/v3/automations/${initial!.automation.id}` : '/api/v3/automations', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { automation?: Automation; error?: string };
      if (!res.ok || !data.automation) throw new Error(data.error ?? 'Failed to save');
      onSaved(data.automation, activate);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function runSimulation() {
    if (!editing) { setError('Save the automation as a draft first, then run a simulation.'); return; }
    if (!testContactId) { setError('Select a contact to test with.'); return; }
    setTesting(true); setError(null); setSimResult(null);
    try {
      const res = await fetch(`/api/v3/automations/${initial!.automation.id}/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: testContactId, mode: 'simulate' }),
      });
      const d = await res.json();
      setSimResult(d);
    } catch {
      setError('Simulation failed to run.');
    } finally { setTesting(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--crm-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={18} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{editing ? 'Edit Automation' : 'Create Automation'}</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--crm-text-muted)' }}>Step {wizard + 1} of {WIZARD.length} · {WIZARD[wizard].desc}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--crm-text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 22px', borderBottom: '1px solid var(--crm-border-soft)', flexShrink: 0, overflowX: 'auto' }}>
          {WIZARD.map((s, i) => (
            <button key={s.n} onClick={() => i <= wizard && setWizard(i)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 9, background: i === wizard ? 'linear-gradient(135deg,rgba(79,109,245,0.16),rgba(139,92,246,0.10))' : 'transparent', border: i === wizard ? '1px solid rgba(79,109,245,0.25)' : '1px solid transparent', cursor: i <= wizard ? 'pointer' : 'default', opacity: i > wizard ? 0.5 : 1, whiteSpace: 'nowrap' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: i < wizard ? '#28c99a' : i === wizard ? '#4f6df5' : 'rgba(130,145,190,0.2)', color: i <= wizard ? 'white' : 'var(--crm-text-muted)' }}>
                {i < wizard ? <Check size={11} /> : i + 1}
              </span>
              <span style={{ fontSize: 12, fontWeight: i === wizard ? 700 : 500, color: i === wizard ? 'var(--crm-primary)' : 'var(--crm-text-secondary)' }}>{s.n}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {wizard === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Automation Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hot Lead Follow-up" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea value={description ?? ''} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What does this automation do?" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'linear-gradient(135deg,rgba(139,92,246,0.10),rgba(79,109,245,0.07))', border: '1px solid rgba(139,92,246,0.20)' }}>
                <Brain size={16} color="#8b5cf6" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>AI-assisted</div>
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Mark this automation as AI-enhanced for your team.</div>
                </div>
                <button onClick={() => setAiEnabled(v => !v)} aria-label="Toggle AI" style={{ width: 40, height: 22, borderRadius: 11, background: aiEnabled ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.25)', position: 'relative', transition: 'background 200ms' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: aiEnabled ? 21 : 3, transition: 'left 200ms', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                </button>
              </div>
            </div>
          )}

          {wizard === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Choose a Trigger *</label>
                <select value={triggerType} onChange={e => { setTriggerType(e.target.value); setTriggerConfig({}); }} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {TRIGGER_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.triggers.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                {triggerDef && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--crm-text-muted)' }}>{triggerDef.description}</p>}
                {triggerDef && !triggerDef.eventDriven && !triggerDef.scheduled && triggerType !== 'manual' && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#f4c95d' }}>Note: this trigger runs on demand.</p>
                )}
                {triggerDef?.eventDriven && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 10, background: 'rgba(244,201,93,0.10)', border: '1px solid rgba(244,201,93,0.25)' }}>
                    <AlertTriangle size={13} color="#f4c95d" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 11, color: 'var(--crm-text-secondary)' }}>Requires an inbound event via the trigger ingestion endpoint. Runs automatically once your webhooks/integrations post to <code>/api/v3/automations/events</code>.</span>
                  </div>
                )}
              </div>

              {/* Trigger-specific config */}
              {isSchedule && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Run every (minutes) *</label>
                    <input type="number" min={5} value={String(triggerConfig.interval_minutes ?? 60)} onChange={e => setTriggerConfig(p => ({ ...p, interval_minutes: Number(e.target.value) }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Target</label>
                    <select value={triggerConfig.run_all ? 'all' : 'specific'} onChange={e => setTriggerConfig(p => ({ ...p, run_all: e.target.value === 'all' }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="all">All contacts (max 100)</option>
                      <option value="specific">Specific contacts</option>
                    </select>
                  </div>
                </div>
              )}

              {triggerType === 'keyword_match' && (
                <div>
                  <label style={labelStyle}>Keywords (comma separated)</label>
                  <input value={String(triggerConfig.keywords ?? '')} onChange={e => setTriggerConfig({ keywords: e.target.value })} placeholder="pricing, demo, buy" style={inputStyle} />
                </div>
              )}
              {(triggerType === 'deal_stage_changed' || triggerType === 'lead_status_changed') && (
                <div>
                  <label style={labelStyle}>Only when status/stage equals</label>
                  <input value={String(triggerConfig.stage ?? triggerConfig.status ?? '')} onChange={e => setTriggerConfig({ stage: e.target.value })} placeholder="e.g. won" style={inputStyle} />
                </div>
              )}
              {triggerType === 'ai_score_threshold' && (
                <div>
                  <label style={labelStyle}>Score threshold</label>
                  <input type="number" value={String(triggerConfig.threshold ?? 70)} onChange={e => setTriggerConfig({ threshold: Number(e.target.value) })} style={inputStyle} />
                </div>
              )}
            </div>
          )}

          {wizard === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>Conditions (optional)</div>
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Only continue if the contact matches.</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['all', 'any'] as const).map(m => (
                    <button key={m} onClick={() => setMatch(m)} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: match === m ? 'rgba(79,109,245,0.14)' : 'rgba(255,255,255,0.5)', border: '1px solid rgba(130,145,190,0.2)', color: match === m ? 'var(--crm-primary)' : 'var(--crm-text-muted)' }}>{m === 'all' ? 'Match ALL' : 'Match ANY'}</button>
                  ))}
                </div>
              </div>
              {conditions.length === 0 && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', padding: '20px 0', textAlign: 'center' }}>No conditions — runs for every triggered contact.</div>}
              {conditions.map((c, i) => {
                const op = OPERATOR_MAP[c.operator];
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 1.4fr auto', gap: 8, alignItems: 'center' }}>
                    <select value={c.field} onChange={e => updateCondition(i, { field: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {CONDITION_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select value={c.operator} onChange={e => updateCondition(i, { operator: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {op?.valueType === 'none' ? (
                      <span style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>—</span>
                    ) : CONDITION_FIELD_MAP[c.field]?.options ? (
                      <select value={c.value ?? ''} onChange={e => updateCondition(i, { value: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Select…</option>
                        {CONDITION_FIELD_MAP[c.field].options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input value={c.value ?? ''} onChange={e => updateCondition(i, { value: e.target.value })} placeholder="value" style={inputStyle} />
                    )}
                    <button onClick={() => removeCondition(i)} style={{ color: '#f46b72', padding: 8 }}><Trash2 size={14} /></button>
                  </div>
                );
              })}
              <button onClick={addCondition} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.10)', border: '1px dashed rgba(79,109,245,0.35)', color: 'var(--crm-primary)', fontSize: 12, fontWeight: 600 }}>
                <Plus size={13} /> Add Condition
              </button>
            </div>
          )}

          {wizard === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>Actions *</div>
              {actions.length === 0 && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', textAlign: 'center', padding: '16px 0' }}>No actions yet. Add at least one.</div>}
              {actions.map((a, idx) => {
                const def = ACTION_MAP[a.type];
                return (
                  <div key={a.id} style={{ borderRadius: 14, border: '1px solid var(--crm-border-soft)', background: 'rgba(255,255,255,0.45)', padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 7, background: 'rgba(79,109,245,0.14)', color: 'var(--crm-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{idx + 1}</span>
                      <select value={a.type} onChange={e => updateAction(a.id, { type: e.target.value, config: {} })} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                        {ACTIONS.map(opt => <option key={opt.type} value={opt.type}>{opt.label}</option>)}
                      </select>
                      <button onClick={() => moveAction(idx, -1)} disabled={idx === 0} style={{ padding: 6, color: 'var(--crm-text-muted)', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                      <button onClick={() => moveAction(idx, 1)} disabled={idx === actions.length - 1} style={{ padding: 6, color: 'var(--crm-text-muted)', opacity: idx === actions.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                      <button onClick={() => setActions(prev => prev.filter(x => x.id !== a.id))} style={{ padding: 6, color: '#f46b72' }}><Trash2 size={14} /></button>
                    </div>
                    {def && <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--crm-text-muted)' }}>{def.description}</p>}
                    <div style={{ display: 'grid', gap: 10 }}>
                      {def?.fields.map(f => (
                        <div key={f.key}>
                          <label style={labelStyle}>{f.label}{f.required ? ' *' : ''}</label>
                          {f.type === 'textarea' ? (
                            <textarea rows={2} value={String(a.config[f.key] ?? '')} onChange={e => updateActionConfig(a.id, f.key, e.target.value)} placeholder={f.placeholder} style={{ ...inputStyle, resize: 'vertical' }} />
                          ) : f.type === 'select' ? (
                            <select value={String(a.config[f.key] ?? '')} onChange={e => updateActionConfig(a.id, f.key, e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                              <option value="">Select…</option>
                              {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : f.type === 'channel' ? (
                            <select value={String(a.config[f.key] ?? 'whatsapp')} onChange={e => updateActionConfig(a.id, f.key, e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                              {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          ) : f.type === 'user' ? (
                            <select value={String(a.config[f.key] ?? '')} onChange={e => updateActionConfig(a.id, f.key, e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                              <option value="">Select member…</option>
                              {users.map(u => <option key={u.user_id} value={u.user_id}>{u.full_name ?? u.user_id}</option>)}
                            </select>
                          ) : (
                            <input type={f.type === 'number' ? 'number' : 'text'} value={String(a.config[f.key] ?? '')} onChange={e => updateActionConfig(a.id, f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)} placeholder={f.placeholder} style={inputStyle} />
                          )}
                          {f.hint && <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--crm-text-muted)' }}>{f.hint}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <button onClick={() => addAction()} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.10)', border: '1px dashed rgba(79,109,245,0.35)', color: 'var(--crm-primary)', fontSize: 12, fontWeight: 600 }}>
                <Plus size={13} /> Add Action
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 4 }}>
                <input type="checkbox" checked={includeEnd} onChange={e => setIncludeEnd(e.target.checked)} /> End workflow after these actions
              </label>
            </div>
          )}

          {wizard === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>Timing</div>
              {isSchedule ? (
                <div>
                  <label style={labelStyle}>Run every (minutes)</label>
                  <input type="number" min={5} value={String(triggerConfig.interval_minutes ?? 60)} onChange={e => setTriggerConfig(p => ({ ...p, interval_minutes: Number(e.target.value) }))} style={inputStyle} />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>This automation runs when its trigger fires. Add <strong>Wait / Delay</strong> actions to pause between steps.</div>
              )}
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)', fontSize: 12, color: 'var(--crm-text-secondary)' }}>
                Delays are persisted to a durable job queue and resumed by the background scheduler — no browser needs to stay open.
              </div>
            </div>
          )}

          {wizard === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>Review</div>
              <div style={{ borderRadius: 14, border: '1px solid var(--crm-border-soft)', background: 'rgba(255,255,255,0.45)', padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)' }}>{name || 'Untitled automation'}</div>
                {description && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 3 }}>{description}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  <Chip color="#4d7cff">{TRIGGER_MAP[triggerType]?.label ?? triggerType}</Chip>
                  {aiEnabled && <Chip color="#8b5cf6">AI</Chip>}
                  <Chip color="#8790aa">{actions.length} action{actions.length === 1 ? '' : 's'}</Chip>
                  {conditions.length > 0 && <Chip color="#28c99a">{conditions.length} condition{conditions.length === 1 ? '' : 's'}</Chip>}
                </div>
              </div>

              {/* Flow preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <FlowNode color="#4d7cff" label="TRIGGER" text={TRIGGER_MAP[triggerType]?.label ?? triggerType} />
                {buildSteps().filter(s => s.step_type !== 'end').map((s, i) => (
                  <FlowNode key={i} color={s.step_type === 'condition' ? '#28c99a' : s.step_type === 'wait' ? '#8790aa' : '#f4c95d'} label={s.step_type === 'condition' ? 'CONDITION' : s.step_type === 'wait' ? 'WAIT' : 'ACTION'} text={stepSummary(s)} />
                ))}
                <FlowNode color="#4f6df5" label="END" text="Workflow complete" />
              </div>

              {/* Test */}
              <div style={{ borderRadius: 14, border: '1px dashed rgba(79,109,245,0.35)', background: 'rgba(79,109,245,0.05)', padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <FlaskConical size={15} color="#4f6df5" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)' }}>Simulation (safe — no messages sent)</span>
                </div>
                {!editing && <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--crm-text-muted)' }}>Save your draft first, then reopen it to simulate against a real contact.</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={testContactId} onChange={e => setTestContactId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', flex: 1 }}>
                    <option value="">Select a contact…</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
                  </select>
                  <button onClick={runSimulation} disabled={testing || !editing} style={{ padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 12, fontWeight: 600, opacity: (testing || !editing) ? 0.6 : 1, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {testing ? <Loader2 size={13} className="spin" /> : <FlaskConical size={13} />} Simulate
                  </button>
                </div>
                {simResult && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: simResult.status === 'failed' ? '#f46b72' : '#28c99a', marginBottom: 6 }}>
                      {simResult.status === 'failed' ? 'Simulation found issues' : 'Simulation OK'}
                    </div>
                    {simResult.stepsLog?.map((s, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--crm-text-secondary)', padding: '3px 0', borderBottom: '1px solid var(--crm-border-soft)' }}>
                        <span style={{ color: s.status === 'completed' ? '#28c99a' : s.status === 'skipped' ? '#f4c95d' : '#f46b72' }}>{s.status === 'completed' ? '✓' : s.status === 'skipped' ? '→' : '✗'}</span>{' '}
                        <strong>{s.action ?? s.step_type}</strong>: {s.detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.2)' }}>
              <AlertCircle size={13} color="#f46b72" /><span style={{ fontSize: 12, color: '#f46b72' }}>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--crm-border-soft)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(130,145,190,0.25)', color: 'var(--crm-text-secondary)', fontSize: 13 }}>Cancel</button>
          <div style={{ flex: 1 }} />
          {wizard > 0 && (
            <button onClick={() => { setError(null); setWizard(w => w - 1); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(130,145,190,0.25)', color: 'var(--crm-text-secondary)', fontSize: 13 }}>
              <ArrowLeft size={14} /> Back
            </button>
          )}
          {wizard < WIZARD.length - 1 ? (
            <button onClick={next} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600 }}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <>
              <button onClick={() => void save(false)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(130,145,190,0.3)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? <Loader2 size={13} className="spin" /> : <Save size={14} />} Save Draft
              </button>
              <button onClick={() => void save(true)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#28c99a,#4f6df5)', color: 'white', fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? <Loader2 size={13} className="spin" /> : <Rocket size={14} />} Save & Activate
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}18`, borderRadius: 6, padding: '3px 8px' }}>{children}</span>;
}

function FlowNode({ color, label, text }: { color: string; label: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color, background: `${color}15`, border: `1px solid ${color}30`, borderRadius: 6, padding: '3px 7px', minWidth: 74, textAlign: 'center' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--crm-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  );
}
