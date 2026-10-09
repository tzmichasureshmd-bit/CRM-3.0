'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Plus, Play, Pause, CheckCircle, XCircle, Clock,
  Brain, Search, RefreshCw, Trash2, ChevronRight,
  AlertCircle, X,
  ArrowRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ── Types ────────────────────────────────────────────────────
interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  status: string;
  ai_enabled: boolean;
  execution_count: number;
  success_count: number;
  failure_count: number;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
}

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger_type: string;
  steps: unknown[];
  ai_nodes: unknown[];
  tags: string[];
}

interface ExecutionLog {
  id: string;
  status: string;
  trigger_type: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  contact_id: string | null;
}

// ── Constants ────────────────────────────────────────────────
const TRIGGER_LABELS: Record<string, string> = {
  new_message_received:   'New Message Received',
  first_inbound_message:  'First Message from Contact',
  keyword_match:          'Keyword Match',
  new_contact_created:    'New Contact Created',
  conversation_assigned:  'Conversation Assigned',
  tag_added:              'Tag Added',
  time_based:             'Time-Based Schedule',
  interactive_reply:      'Button/List Reply',
  lead_score_changed:     'Lead Score Changed',
  deal_stage_changed:     'Deal Stage Changed',
  deal_won:               'Deal Won',
  deal_lost:              'Deal Lost',
  follow_up_due:          'Follow-up Due',
  follow_up_overdue:      'Follow-up Overdue',
  ai_intent_detected:     'AI Intent Detected',
  ai_score_threshold:     'AI Score Threshold Reached',
};

const TRIGGER_GROUPS = [
  {
    label: 'Conversations',
    triggers: ['new_message_received','first_inbound_message','keyword_match','interactive_reply','conversation_assigned'],
  },
  {
    label: 'Contacts & Leads',
    triggers: ['new_contact_created','tag_added','lead_score_changed'],
  },
  {
    label: 'Deals',
    triggers: ['deal_stage_changed','deal_won','deal_lost'],
  },
  {
    label: 'Follow-ups',
    triggers: ['follow_up_due','follow_up_overdue'],
  },
  {
    label: 'AI Intelligence',
    triggers: ['ai_intent_detected','ai_score_threshold'],
  },
  {
    label: 'Scheduled',
    triggers: ['time_based'],
  },
];

const STATUS_META: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  active:   { color: '#28c99a', bg: 'rgba(40,201,154,0.12)',  icon: <CheckCircle size={11} />, label: 'Active' },
  paused:   { color: '#f4c95d', bg: 'rgba(244,201,93,0.12)',  icon: <Pause size={11} />,       label: 'Paused' },
  draft:    { color: '#8790aa', bg: 'rgba(135,144,170,0.12)', icon: <Clock size={11} />,        label: 'Draft' },
  error:    { color: '#f46b72', bg: 'rgba(244,107,114,0.12)', icon: <XCircle size={11} />,      label: 'Error' },
  archived: { color: '#8790aa', bg: 'rgba(135,144,170,0.12)', icon: <X size={11} />,            label: 'Archived' },
};

const CATEGORY_COLORS: Record<string, string> = {
  ai_powered:   '#8b5cf6',
  lead_nurture: '#4d7cff',
  sales:        '#28c99a',
  support:      '#f46b72',
  onboarding:   '#f4c95d',
  retention:    '#ec78b5',
  general:      '#8790aa',
};

function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Create Automation Modal ───────────────────────────────────
function CreateAutomationModal({
  onClose, onCreated, templates,
}: {
  onClose: () => void;
  onCreated: (a: Automation) => void;
  templates: AutomationTemplate[];
}) {
  const [step, setStep]           = useState<'template' | 'configure'>('template');
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [triggerType, setTrigger] = useState('new_message_received');
  const [aiEnabled, setAI]        = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [selectedTemplate, setTemplate] = useState<AutomationTemplate | null>(null);

  const applyTemplate = (t: AutomationTemplate) => {
    setTemplate(t);
    setName(t.name);
    setDesc(t.description);
    setTrigger(t.trigger_type);
    setAI(t.ai_nodes.length > 0);
    setStep('configure');
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v3/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description || null,
          trigger_type: triggerType,
          trigger_config: {},
          ai_enabled: aiEnabled,
          steps: selectedTemplate?.steps ?? [],
          ai_nodes: selectedTemplate?.ai_nodes ?? [],
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to create');
      }
      const d = await res.json() as { automation: Automation };
      onCreated(d.automation);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create automation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 640, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(130,145,190,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>
              {step === 'template' ? 'Choose a Template' : 'Configure Automation'}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--crm-text-muted)' }}>
              {step === 'template' ? 'Start from a template or build from scratch' : 'Set up your automation trigger and AI settings'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {step === 'template' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Scratch option */}
              <button onClick={() => setStep('configure')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: 'rgba(79,109,245,0.08)', border: '2px dashed rgba(79,109,245,0.30)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Plus size={18} color="white" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#4f6df5' }}>Build from Scratch</div>
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Create a custom automation with any trigger and actions</div>
                </div>
              </button>

              {/* Templates */}
              {templates.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.75)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${CATEGORY_COLORS[t.category] ?? '#8790aa'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {t.ai_nodes.length > 0 ? <Brain size={18} color={CATEGORY_COLORS[t.category] ?? '#8790aa'} /> : <Zap size={18} color={CATEGORY_COLORS[t.category] ?? '#8790aa'} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{t.description}</div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                      {t.tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{ fontSize: 9, fontWeight: 600, color: CATEGORY_COLORS[t.category] ?? '#8790aa', background: `${CATEGORY_COLORS[t.category] ?? '#8790aa'}15`, borderRadius: 5, padding: '2px 6px' }}>{tag}</span>
                      ))}
                      {t.ai_nodes.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.12)', borderRadius: 5, padding: '2px 6px' }}>✨ AI</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} color="var(--crm-text-muted)" />
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {selectedTemplate && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.08)', border: '1px solid rgba(79,109,245,0.20)', fontSize: 12, color: '#4f6df5' }}>
                  Using template: <strong>{selectedTemplate.name}</strong>
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Automation Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hot Lead Follow-up" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 13, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Description</label>
                <textarea value={description} onChange={e => setDesc(e.target.value)} placeholder="What does this automation do?" rows={2} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 13, color: 'var(--crm-text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Trigger</label>
                <select value={triggerType} onChange={e => setTrigger(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 13, color: 'var(--crm-text)', outline: 'none', cursor: 'pointer' }}>
                  {TRIGGER_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.triggers.map(t => (
                        <option key={t} value={t}>{TRIGGER_LABELS[t] ?? t}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'linear-gradient(135deg,rgba(139,92,246,0.10),rgba(79,109,245,0.07))', border: '1px solid rgba(139,92,246,0.20)' }}>
                <Brain size={16} color="#8b5cf6" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>Enable AI Intelligence</div>
                  <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Add AI score/intent/sentiment conditions to this automation</div>
                </div>
                <button onClick={() => setAI(p => !p)} style={{ width: 40, height: 22, borderRadius: 11, background: aiEnabled ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.25)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 200ms' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: aiEnabled ? 21 : 3, transition: 'left 200ms', boxShadow: '0 1px 4px rgba(0,0,0,0.20)' }} />
                </button>
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)' }}>
                  <AlertCircle size={12} color="#f46b72" />
                  <span style={{ fontSize: 12, color: '#f46b72' }}>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(130,145,190,0.10)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          {step === 'configure' && selectedTemplate && (
            <button onClick={() => setStep('template')} style={{ padding: '8px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(130,145,190,0.25)', color: 'var(--crm-text-secondary)', fontSize: 13, cursor: 'pointer' }}>
              Back
            </button>
          )}
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(130,145,190,0.25)', color: 'var(--crm-text-secondary)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          {step === 'configure' && (
            <button onClick={() => void handleSave()} disabled={saving} style={{ padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating...' : 'Create Automation'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Automation Detail Panel ───────────────────────────────────
function AutomationDetailPanel({
  automation, onClose, onToggle, onDelete,
}: {
  automation: Automation;
  onClose: () => void;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [logs, setLogs]       = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExec]  = useState(false);
  const [testContactId, setTestContact] = useState('');
  const [execResult, setExecResult] = useState<{ status: string; steps_log: { step_type: string; status: string; detail: string }[] } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await fetch(`/api/v3/automations/${automation.id}`);
      if (res.ok) {
        const d = await res.json() as { executions?: ExecutionLog[] };
        setLogs(d.executions ?? []);
      }
      setLoading(false);
    };
    void load();
  }, [automation.id]);

  const handleTestRun = async () => {
    if (!testContactId.trim()) return;
    setExec(true);
    setExecResult(null);
    try {
      const res = await fetch(`/api/v3/automations/${automation.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: testContactId.trim() }),
      });
      const d = await res.json() as { status: string; steps_log: { step_type: string; status: string; detail: string }[] };
      setExecResult(d);
    } catch {
      setExecResult({ status: 'failed', steps_log: [{ step_type: 'error', status: 'failed', detail: 'Network error' }] });
    } finally {
      setExec(false);
    }
  };

  const sm = STATUS_META[automation.status] ?? STATUS_META.draft;
  const successRate = automation.execution_count > 0
    ? Math.round((automation.success_count / automation.execution_count) * 100)
    : 0;

  return (
    <div className="crm-glass" style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(130,145,190,0.10)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 4 }}>{automation.name}</div>
            {automation.description && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{automation.description}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', flexShrink: 0 }}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: sm.color, background: sm.bg, borderRadius: 6, padding: '2px 7px' }}>
            {sm.icon}{sm.label}
          </span>
          {automation.ai_enabled && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.12)', borderRadius: 6, padding: '2px 7px' }}>✨ AI</span>
          )}
          <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', background: 'rgba(130,145,190,0.10)', borderRadius: 6, padding: '2px 7px' }}>
            {TRIGGER_LABELS[automation.trigger_type] ?? automation.trigger_type}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            { label: 'Total Runs', value: automation.execution_count, color: '#4d7cff' },
            { label: 'Success Rate', value: `${successRate}%`, color: '#28c99a' },
            { label: 'Failures', value: automation.failure_count, color: '#f46b72' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.45)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 750, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'var(--crm-text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Last error */}
        {automation.last_error && (
          <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', display: 'flex', gap: 8 }}>
            <AlertCircle size={12} color="#f46b72" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#f46b72', marginBottom: 2 }}>Last Error</div>
              <div style={{ fontSize: 11, color: '#f46b72' }}>{automation.last_error}</div>
            </div>
          </div>
        )}

        {/* Test run */}
        <div style={{ background: 'rgba(255,255,255,0.45)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 8 }}>Test Run</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={testContactId}
              onChange={e => setTestContact(e.target.value)}
              placeholder="Contact ID..."
              style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, color: 'var(--crm-text)', outline: 'none' }}
            />
            <button
              onClick={() => void handleTestRun()}
              disabled={executing || !testContactId.trim()}
              style={{ padding: '7px 12px', borderRadius: 8, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: executing ? 0.7 : 1, whiteSpace: 'nowrap' }}
            >
              {executing ? '...' : <><Play size={10} style={{ display: 'inline', marginRight: 3 }} />Run</>}
            </button>
          </div>
          {execResult && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: execResult.status === 'completed' ? '#28c99a' : '#f46b72', marginBottom: 4 }}>
                {execResult.status === 'completed' ? '✓ Completed' : '✗ Failed'}
              </div>
              {execResult.steps_log?.map((s, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--crm-text-muted)', padding: '2px 0', borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                  <span style={{ color: s.status === 'completed' ? '#28c99a' : s.status === 'skipped' ? '#f4c95d' : '#f46b72' }}>
                    {s.status === 'completed' ? '✓' : s.status === 'skipped' ? '→' : '✗'}
                  </span>{' '}
                  <strong>{s.step_type}</strong>: {s.detail}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Execution history */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 8 }}>Execution History</div>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>Loading...</div>
          ) : logs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>No executions yet</div>
          ) : logs.map(log => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: log.status === 'completed' ? '#28c99a' : log.status === 'failed' ? '#f46b72' : '#f4c95d', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text)', textTransform: 'capitalize' }}>{log.status}</div>
                {log.error_message && <div style={{ fontSize: 10, color: '#f46b72', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.error_message}</div>}
              </div>
              <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', flexShrink: 0 }}>{timeAgo(log.started_at)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(130,145,190,0.10)', display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onToggle(automation.id, !automation.is_active)}
          style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: automation.is_active ? 'rgba(244,201,93,0.12)' : 'rgba(40,201,154,0.12)', border: `1px solid ${automation.is_active ? 'rgba(244,201,93,0.30)' : 'rgba(40,201,154,0.30)'}`, color: automation.is_active ? '#f4c95d' : '#28c99a', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          {automation.is_active ? <><Pause size={11} />Pause</> : <><Play size={11} />Activate</>}
        </button>
        <button
          onClick={() => { if (confirm('Delete this automation?')) onDelete(automation.id); }}
          style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function AutomationsPage() {
  const supabase = createClient();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates]     = useState<AutomationTemplate[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatus]     = useState('all');
  const [selected, setSelected]       = useState<Automation | null>(null);
  const [showCreate, setShowCreate]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search) params.set('search', search);

    const [autoRes, tmplRes] = await Promise.all([
      fetch(`/api/v3/automations?${params.toString()}`),
      fetch('/api/v3/automations/templates'),
    ]);

    if (autoRes.ok) {
      const d = await autoRes.json() as { automations: Automation[] };
      setAutomations(d.automations ?? []);
    } else {
      // Fallback: direct Supabase query
      const { data } = await supabase
        .from('automations')
        .select('id,name,description,trigger_type,trigger_config,is_active,status,ai_enabled,execution_count,success_count,failure_count,last_run_at,last_error,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      setAutomations((data as Automation[]) ?? []);
    }

    if (tmplRes.ok) {
      const d = await tmplRes.json() as { templates: AutomationTemplate[] };
      setTemplates(d.templates ?? []);
    }

    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = useCallback(async (id: string, active: boolean) => {
    const res = await fetch(`/api/v3/automations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active, status: active ? 'active' : 'paused' }),
    });
    if (res.ok) {
      setAutomations(prev => prev.map(a => a.id === id ? { ...a, is_active: active, status: active ? 'active' : 'paused' } : a));
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, is_active: active, status: active ? 'active' : 'paused' } : prev);
    }
  }, [selected]);

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/v3/automations/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setAutomations(prev => prev.filter(a => a.id !== id));
      if (selected?.id === id) setSelected(null);
    }
  }, [selected]);

  const handleCreated = useCallback((a: Automation) => {
    setAutomations(prev => [a, ...prev]);
    setShowCreate(false);
    setSelected(a);
  }, []);

  const active   = automations.filter(a => a.is_active).length;
  const totalRuns = automations.reduce((s, a) => s + (a.execution_count ?? 0), 0);
  const aiCount  = automations.filter(a => a.ai_enabled).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: 'calc(100vh - 90px)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="crm-page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Smart Automations</h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--crm-text-secondary)' }}>
            {active} active · {totalRuns.toLocaleString()} total runs · {aiCount} AI-powered
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> New Automation
        </button>
      </div>

      {/* AI Banner */}
      <div className="crm-glass-ai" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div className="crm-ai-orb" style={{ width: 32, height: 32 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>AI-Enhanced Automation Engine</div>
          <div style={{ fontSize: 11, color: 'var(--crm-text-secondary)' }}>
            Add AI score conditions, intent detection, and sentiment routing to any automation.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {['Score > 80 → Assign Sales', 'Negative Sentiment → Escalate', 'Pricing Intent → Create Deal'].map(chip => (
            <span key={chip} style={{ fontSize: 10, fontWeight: 600, color: '#8b5cf6', background: 'rgba(139,92,246,0.12)', borderRadius: 8, padding: '4px 8px', whiteSpace: 'nowrap' }}>{chip}</span>
          ))}
        </div>
      </div>

      {/* Flow diagram */}
      <div className="crm-glass" style={{ padding: '12px 18px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
          {[
            { label: 'TRIGGER', color: '#4d7cff', desc: 'Event fires' },
            { label: 'AI ANALYSIS', color: '#8b5cf6', desc: 'Score · Intent · Sentiment', ai: true },
            { label: 'CONDITIONS', color: '#28c99a', desc: 'Evaluate rules' },
            { label: 'ACTIONS', color: '#f4c95d', desc: 'Execute steps' },
            { label: 'WAIT', color: '#8790aa', desc: 'Delay if needed' },
            { label: 'LOG', color: '#4f6df5', desc: 'Record result' },
          ].map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ padding: '6px 12px', borderRadius: 8, background: s.ai ? 'linear-gradient(135deg,rgba(139,92,246,0.18),rgba(79,109,245,0.12))' : `${s.color}12`, border: `1px solid ${s.color}30`, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</div>
                <div style={{ fontSize: 9, color: 'var(--crm-text-muted)', whiteSpace: 'nowrap' }}>{s.desc}</div>
              </div>
              {i < 5 && <ArrowRight size={12} color="var(--crm-text-muted)" style={{ margin: '0 4px', flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', gap: 10, overflow: 'hidden', minHeight: 0 }}>
        {/* List */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', minWidth: 0 }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.80)', borderRadius: 10, padding: '7px 11px', flex: 1, maxWidth: 320 }}>
              <Search size={12} color="var(--crm-text-muted)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search automations..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--crm-text)' }} />
            </div>
            <select value={statusFilter} onChange={e => setStatus(e.target.value)} style={{ padding: '7px 10px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, color: 'var(--crm-text)', cursor: 'pointer', outline: 'none' }}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="draft">Draft</option>
              <option value="error">Error</option>
            </select>
            <button onClick={() => void load()} style={{ padding: '7px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(130,145,190,0.20)', color: 'var(--crm-text-muted)', cursor: 'pointer' }}>
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Automation list */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 72, borderRadius: 14, background: 'rgba(255,255,255,0.40)' }} />
              ))
            ) : automations.length === 0 ? (
              <div className="crm-glass" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--crm-text-muted)' }}>
                <Zap size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
                <p style={{ margin: '0 0 12px', fontSize: 14 }}>No automations yet</p>
                <button onClick={() => setShowCreate(true)} style={{ padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Create First Automation
                </button>
              </div>
            ) : automations.map(a => {
              const sm = STATUS_META[a.status] ?? STATUS_META.draft;
              const isSelected = selected?.id === a.id;
              const successRate = a.execution_count > 0 ? Math.round((a.success_count / a.execution_count) * 100) : null;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(isSelected ? null : a)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderRadius: 14, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                    background: isSelected
                      ? 'linear-gradient(135deg,rgba(79,109,245,0.16),rgba(139,92,246,0.10))'
                      : 'rgba(255,255,255,0.50)',
                    borderLeft: isSelected ? '3px solid #4f6df5' : '3px solid transparent',
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: a.ai_enabled ? 'linear-gradient(135deg,rgba(139,92,246,0.18),rgba(79,109,245,0.12))' : 'rgba(79,109,245,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {a.ai_enabled ? <Brain size={18} color="#8b5cf6" /> : <Zap size={18} color="#4f6df5" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      {a.ai_enabled && <span style={{ fontSize: 9, fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.12)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>AI</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>
                      {TRIGGER_LABELS[a.trigger_type] ?? a.trigger_type} · {a.execution_count} runs
                      {successRate !== null && ` · ${successRate}% success`}
                      {' · '}Last: {timeAgo(a.last_run_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: sm.color, background: sm.bg, borderRadius: 7, padding: '3px 7px' }}>
                      {sm.icon}{sm.label}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); void handleToggle(a.id, !a.is_active); }}
                      style={{ padding: '5px 10px', borderRadius: 8, background: a.is_active ? 'rgba(244,201,93,0.10)' : 'rgba(40,201,154,0.10)', border: `1px solid ${a.is_active ? 'rgba(244,201,93,0.25)' : 'rgba(40,201,154,0.25)'}`, color: a.is_active ? '#f4c95d' : '#28c99a', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                    >
                      {a.is_active ? <><Pause size={10} />Pause</> : <><Play size={10} />Activate</>}
                    </button>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <AutomationDetailPanel
            automation={selected}
            onClose={() => setSelected(null)}
            onToggle={(id, active) => void handleToggle(id, active)}
            onDelete={(id) => void handleDelete(id)}
          />
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateAutomationModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          templates={templates}
        />
      )}
    </div>
  );
}
