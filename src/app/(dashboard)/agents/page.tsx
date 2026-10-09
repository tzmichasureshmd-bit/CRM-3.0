'use client';
import { useState, useEffect, useCallback } from 'react';
import { Bot, Plus, Play, Pause, Trash2, CheckCircle, XCircle, Clock, AlertCircle, Sparkles, Shield, Zap, Brain, RefreshCw, X, Check } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────
interface Agent {
  id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
  enabled: boolean;
  instructions: string;
  allowed_tools: string[];
  requires_approval: boolean;
  max_actions_per_run: number;
  model: string;
  provider: string;
  temperature: number;
  execution_count: number;
  success_count: number;
  failure_count: number;
  last_run_at: string | null;
  created_at: string;
}

interface Execution {
  id: string;
  status: string;
  result_summary: string | null;
  error_message: string | null;
  tokens_used: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  input_context: { input?: string } | null;
  actions_taken: Step[];
}

interface Step {
  stepNumber: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: Record<string, unknown>;
  status: string;
  durationMs: number;
}

interface Approval {
  id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  proposed_action: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface ToolDef {
  name: string;
  description: string;
  category: string;
  approval: string;
}

// ── Constants ─────────────────────────────────────────────────
const AGENT_TYPES = [
  { value: 'sales_assistant', label: 'Sales Agent', icon: '💼', desc: 'Analyzes leads, recommends actions, creates follow-ups' },
  { value: 'lead_qualification', label: 'Lead Qualification', icon: '🎯', desc: 'Scores leads, updates status, qualifies prospects' },
  { value: 'followup', label: 'Follow-up Agent', icon: '📅', desc: 'Finds overdue follow-ups, creates tasks' },
  { value: 'customer_support', label: 'Support Agent', icon: '🎧', desc: 'Analyzes conversations, suggests responses' },
  { value: 'content', label: 'Content Agent', icon: '✍️', desc: 'Generates content drafts (never auto-publishes)' },
  { value: 'appointment', label: 'Appointment Agent', icon: '📆', desc: 'Manages appointments, creates reminders' },
  { value: 'customer_success', label: 'Customer Success', icon: '🌟', desc: 'Monitors health, detects churn risk' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  idle: '#8790aa', running: '#4d7cff', paused: '#f4c95d', error: '#f46b72',
};

const EXEC_STATUS_COLORS: Record<string, string> = {
  completed: '#28c99a', failed: '#f46b72', awaiting_approval: '#f4c95d', running: '#4d7cff',
};

function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function successRate(agent: Agent): number {
  if (agent.execution_count === 0) return 0;
  return Math.round((agent.success_count / agent.execution_count) * 100);
}

// ── AgentCard ─────────────────────────────────────────────────
function AgentCard({ agent, onSelect, onToggle, onDelete, selected }: {
  agent: Agent;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  selected: boolean;
}) {
  const typeInfo = AGENT_TYPES.find(t => t.value === agent.type);
  const rate = successRate(agent);
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
        background: selected ? 'linear-gradient(135deg,rgba(79,109,245,0.18),rgba(139,92,246,0.12))' : 'rgba(255,255,255,0.50)',
        border: selected ? '1.5px solid rgba(79,109,245,0.35)' : '1px solid rgba(255,255,255,0.70)',
        borderLeft: selected ? '3px solid #4f6df5' : '3px solid transparent',
        transition: 'all 150ms ease', marginBottom: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{typeInfo?.icon ?? '🤖'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>{agent.name}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COLORS[agent.status] ?? '#8790aa', background: `${STATUS_COLORS[agent.status] ?? '#8790aa'}18`, borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase' }}>
              {agent.status}
            </span>
            {!agent.enabled && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#8790aa', background: 'rgba(135,144,170,0.12)', borderRadius: 5, padding: '1px 5px' }}>DISABLED</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 6 }}>{typeInfo?.label ?? agent.type}</div>
          <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--crm-text-muted)' }}>
            <span>Runs: {agent.execution_count}</span>
            <span style={{ color: rate >= 70 ? '#28c99a' : rate >= 40 ? '#f4c95d' : '#8790aa' }}>Success: {rate}%</span>
            <span>Last: {timeAgo(agent.last_run_at)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); onToggle(); }}
            title={agent.enabled ? 'Disable' : 'Enable'}
            style={{ width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: agent.enabled ? 'rgba(40,201,154,0.15)' : 'rgba(135,144,170,0.12)', color: agent.enabled ? '#28c99a' : '#8790aa' }}
          >
            {agent.enabled ? <Play size={11} /> : <Pause size={11} />}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            style={{ width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(244,107,114,0.10)', color: '#f46b72' }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      {agent.allowed_tools.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {agent.allowed_tools.slice(0, 4).map(t => (
            <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, background: 'rgba(79,109,245,0.10)', color: '#4f6df5', fontWeight: 600 }}>{t}</span>
          ))}
          {agent.allowed_tools.length > 4 && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, background: 'rgba(135,144,170,0.10)', color: '#8790aa' }}>+{agent.allowed_tools.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── CreateAgentModal ──────────────────────────────────────────
function CreateAgentModal({ tools, onClose, onCreate }: {
  tools: ToolDef[];
  onClose: () => void;
  onCreate: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('sales_assistant');
  const [instructions, setInstructions] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleTool = (t: string) => setSelectedTools(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onCreate({ name, type, instructions, allowed_tools: selectedTools, requires_approval: requiresApproval });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  };

  const typeInfo = AGENT_TYPES.find(t => t.value === type);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>Create AI Agent</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={16} /></button>
        </div>

        {error && <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 12, marginBottom: 14 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>AGENT NAME</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sales Qualifier" style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 13, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>AGENT TYPE</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {AGENT_TYPES.map(t => (
                <button key={t.value} onClick={() => setType(t.value)} style={{ padding: '8px 10px', borderRadius: 10, border: type === t.value ? '1.5px solid #4f6df5' : '1px solid rgba(130,145,190,0.20)', background: type === t.value ? 'rgba(79,109,245,0.10)' : 'rgba(255,255,255,0.50)', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 14 }}>{t.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text)', marginTop: 2 }}>{t.label}</div>
                </button>
              ))}
            </div>
            {typeInfo && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 6 }}>{typeInfo.desc}</div>}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>INSTRUCTIONS (optional)</label>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Additional instructions for this agent..." rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, color: 'var(--crm-text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>ALLOWED TOOLS ({selectedTools.length} selected)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {tools.map(t => (
                <label key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: selectedTools.includes(t.name) ? 'rgba(79,109,245,0.08)' : 'rgba(255,255,255,0.40)', cursor: 'pointer', border: selectedTools.includes(t.name) ? '1px solid rgba(79,109,245,0.20)' : '1px solid transparent' }}>
                  <input type="checkbox" checked={selectedTools.includes(t.name)} onChange={() => toggleTool(t.name)} style={{ accentColor: '#4f6df5' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text)' }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--crm-text-muted)' }}>{t.description}</div>
                  </div>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: t.approval === 'requires_approval' ? 'rgba(244,201,93,0.15)' : 'rgba(40,201,154,0.12)', color: t.approval === 'requires_approval' ? '#f4c95d' : '#28c99a', fontWeight: 600 }}>
                    {t.approval === 'requires_approval' ? 'APPROVAL' : 'AUTO'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={requiresApproval} onChange={e => setRequiresApproval(e.target.checked)} style={{ accentColor: '#4f6df5' }} />
            <span style={{ fontSize: 12, color: 'var(--crm-text)' }}>Require human approval for sensitive actions</span>
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, cursor: 'pointer', color: 'var(--crm-text)' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AgentDetail ───────────────────────────────────────────────
function AgentDetail({ agent, executions, approvals, onRun, onApprove, running, runResult }: {
  agent: Agent;
  executions: Execution[];
  approvals: Approval[];
  onRun: (input: string, contactId?: string) => Promise<void>;
  onApprove: (approvalId: string, decision: 'approved' | 'rejected') => Promise<void>;
  running: boolean;
  runResult: string | null;
}) {
  const [tab, setTab] = useState<'overview' | 'test' | 'history' | 'approvals'>('overview');
  const [testInput, setTestInput] = useState('');
  const [testContactId, setTestContactId] = useState('');
  const typeInfo = AGENT_TYPES.find(t => t.value === agent.type);
  const rate = successRate(agent);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'test', label: 'Test' },
    { id: 'history', label: `History (${executions.length})` },
    { id: 'approvals', label: `Approvals (${approvals.filter(a => a.status === 'pending').length})` },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(130,145,190,0.10)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 28 }}>{typeInfo?.icon ?? '🤖'}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 750, color: 'var(--crm-text)' }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{typeInfo?.label} · {agent.model}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 750, color: rate >= 70 ? '#28c99a' : rate >= 40 ? '#f4c95d' : '#8790aa' }}>{rate}%</div>
              <div style={{ fontSize: 9, color: 'var(--crm-text-muted)' }}>SUCCESS</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{agent.execution_count}</div>
              <div style={{ fontSize: 9, color: 'var(--crm-text-muted)' }}>RUNS</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: tab === t.id ? 700 : 400, background: tab === t.id ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.50)', color: tab === t.id ? 'white' : 'var(--crm-text-secondary)' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {agent.description && <p style={{ margin: 0, fontSize: 12, color: 'var(--crm-text-muted)', lineHeight: 1.6 }}>{agent.description}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Status', value: agent.status.toUpperCase(), color: STATUS_COLORS[agent.status] },
                { label: 'Enabled', value: agent.enabled ? 'Yes' : 'No', color: agent.enabled ? '#28c99a' : '#f46b72' },
                { label: 'Provider', value: agent.provider },
                { label: 'Temperature', value: String(agent.temperature) },
                { label: 'Max Actions', value: String(agent.max_actions_per_run) },
                { label: 'Approval', value: agent.requires_approval ? 'Required' : 'Auto', color: agent.requires_approval ? '#f4c95d' : '#28c99a' },
              ].map(item => (
                <div key={item.label} style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.70)' }}>
                  <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: item.color ?? 'var(--crm-text)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {agent.instructions && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', marginBottom: 6 }}>INSTRUCTIONS</div>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.40)', fontSize: 12, color: 'var(--crm-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{agent.instructions}</div>
              </div>
            )}

            {agent.allowed_tools.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', marginBottom: 6 }}>ALLOWED TOOLS ({agent.allowed_tools.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {agent.allowed_tools.map(t => (
                    <span key={t} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(79,109,245,0.10)', color: '#4f6df5', fontWeight: 600 }}>{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TEST TAB */}
        {tab === 'test' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)', fontSize: 11, color: '#4f6df5' }}>
              <Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} />
              Test this agent with a real input. All CRM actions will execute against live data.
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>INPUT</label>
              <textarea value={testInput} onChange={e => setTestInput(e.target.value)} placeholder={`e.g. "Find hot leads and create follow-ups for the top 3"`} rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, color: 'var(--crm-text)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>CONTACT ID (optional)</label>
              <input value={testContactId} onChange={e => setTestContactId(e.target.value)} placeholder="UUID of contact to analyze" style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button onClick={() => onRun(testInput, testContactId || undefined)} disabled={running || !testInput.trim()} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: testInput.trim() ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.20)', color: testInput.trim() ? 'white' : 'var(--crm-text-muted)', fontSize: 13, fontWeight: 700, cursor: testInput.trim() && !running ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              {running ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Running...</> : <><Play size={13} /> Run Agent</>}
            </button>
            {runResult && (
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(40,201,154,0.08)', border: '1px solid rgba(40,201,154,0.20)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#28c99a', marginBottom: 6 }}>RESULT</div>
                <div style={{ fontSize: 12, color: 'var(--crm-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{runResult}</div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {executions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--crm-text-muted)' }}>
                <Clock size={32} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
                <p style={{ margin: 0, fontSize: 13 }}>No executions yet</p>
              </div>
            ) : executions.map(ex => (
              <div key={ex.id} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.70)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {ex.status === 'completed' ? <CheckCircle size={12} color="#28c99a" /> : ex.status === 'failed' ? <XCircle size={12} color="#f46b72" /> : <Clock size={12} color="#f4c95d" />}
                  <span style={{ fontSize: 11, fontWeight: 700, color: EXEC_STATUS_COLORS[ex.status] ?? '#8790aa', textTransform: 'uppercase' }}>{ex.status}</span>
                  <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginLeft: 'auto' }}>{timeAgo(ex.started_at)}</span>
                </div>
                {ex.input_context?.input && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 4, fontStyle: 'italic' }}>"{ex.input_context.input}"</div>}
                {ex.result_summary && <div style={{ fontSize: 12, color: 'var(--crm-text)', lineHeight: 1.5 }}>{ex.result_summary}</div>}
                {ex.error_message && <div style={{ fontSize: 11, color: '#f46b72', marginTop: 4 }}>{ex.error_message}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 10, color: 'var(--crm-text-muted)' }}>
                  <span>{ex.actions_taken?.length ?? 0} steps</span>
                  {ex.duration_ms && <span>{ex.duration_ms}ms</span>}
                  {ex.tokens_used > 0 && <span>{ex.tokens_used} tokens</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* APPROVALS TAB */}
        {tab === 'approvals' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {approvals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--crm-text-muted)' }}>
                <Shield size={32} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
                <p style={{ margin: 0, fontSize: 13 }}>No pending approvals</p>
              </div>
            ) : approvals.map(ap => (
              <div key={ap.id} style={{ padding: '12px 14px', borderRadius: 12, background: ap.status === 'pending' ? 'rgba(244,201,93,0.06)' : 'rgba(255,255,255,0.40)', border: ap.status === 'pending' ? '1px solid rgba(244,201,93,0.25)' : '1px solid rgba(255,255,255,0.70)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <AlertCircle size={12} color={ap.status === 'pending' ? '#f4c95d' : '#8790aa'} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: ap.status === 'pending' ? '#f4c95d' : '#8790aa', textTransform: 'uppercase' }}>{ap.status}</span>
                  <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginLeft: 'auto' }}>{timeAgo(ap.created_at)}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)', marginBottom: 4 }}>{ap.tool_name}</div>
                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 8, fontFamily: 'monospace', background: 'rgba(0,0,0,0.04)', padding: '4px 8px', borderRadius: 6 }}>
                  {JSON.stringify(ap.tool_input, null, 2)}
                </div>
                {ap.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onApprove(ap.id, 'approved')} style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', background: 'rgba(40,201,154,0.15)', color: '#28c99a', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Check size={11} /> Approve
                    </button>
                    <button onClick={() => onApprove(ap.id, 'rejected')} style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', background: 'rgba(244,107,114,0.10)', color: '#f46b72', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <X size={11} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v3/agents');
      if (res.ok) {
        const d = await res.json() as { agents: Agent[] };
        setAgents(d.agents ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTools = useCallback(async () => {
    const res = await fetch('/api/v3/agents/tools');
    if (res.ok) {
      const d = await res.json() as { tools: ToolDef[] };
      setTools(d.tools ?? []);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
    void loadTools();
  }, [loadAgents, loadTools]);

  const loadExecutions = useCallback(async (agentId: string) => {
    const res = await fetch(`/api/v3/agents/${agentId}/executions`);
    if (res.ok) {
      const d = await res.json() as { executions: Execution[] };
      setExecutions(d.executions ?? []);
    }
  }, []);

  const handleSelect = useCallback((agent: Agent) => {
    setActiveAgent(agent);
    setRunResult(null);
    void loadExecutions(agent.id);
    // Load pending approvals from executions (simplified — in production would be a dedicated endpoint)
    setApprovals([]);
  }, [loadExecutions]);

  const handleCreate = useCallback(async (data: Record<string, unknown>) => {
    const res = await fetch('/api/v3/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      throw new Error(d.error ?? 'Failed to create');
    }
    await loadAgents();
  }, [loadAgents]);

  const handleToggle = useCallback(async (agent: Agent) => {
    const res = await fetch(`/api/v3/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !agent.enabled }),
    });
    if (res.ok) {
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, enabled: !a.enabled } : a));
      if (activeAgent?.id === agent.id) setActiveAgent(prev => prev ? { ...prev, enabled: !prev.enabled } : prev);
    }
  }, [activeAgent]);

  const handleDelete = useCallback(async (agent: Agent) => {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/v3/agents/${agent.id}`, { method: 'DELETE' });
    if (res.ok) {
      setAgents(prev => prev.filter(a => a.id !== agent.id));
      if (activeAgent?.id === agent.id) setActiveAgent(null);
    }
  }, [activeAgent]);

  const handleRun = useCallback(async (input: string, contactId?: string) => {
    if (!activeAgent) return;
    setRunning(true);
    setRunResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/v3/agents/${activeAgent.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, contact_id: contactId }),
      });
      const d = await res.json() as { summary?: string; error?: string; status?: string; steps?: Step[]; pendingApprovals?: Approval[] };
      if (d.error && !d.summary) {
        setError(d.error);
        setRunResult(`Error: ${d.error}`);
      } else {
        setRunResult(d.summary ?? 'Agent completed.');
        if (d.pendingApprovals && d.pendingApprovals.length > 0) {
          setApprovals(prev => [...d.pendingApprovals!, ...prev]);
        }
      }
      await loadExecutions(activeAgent.id);
      // Refresh agent stats
      const agentRes = await fetch(`/api/v3/agents/${activeAgent.id}`);
      if (agentRes.ok) {
        const agentData = await agentRes.json() as { agent: Agent };
        setAgents(prev => prev.map(a => a.id === activeAgent.id ? agentData.agent : a));
        setActiveAgent(agentData.agent);
      }
    } catch {
      setRunResult('Agent execution failed. Check console for details.');
    } finally {
      setRunning(false);
    }
  }, [activeAgent, loadExecutions]);

  const handleApprove = useCallback(async (approvalId: string, decision: 'approved' | 'rejected') => {
    if (!activeAgent) return;
    const res = await fetch(`/api/v3/agents/${activeAgent.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approval_id: approvalId, decision }),
    });
    if (res.ok) {
      setApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status: decision } : a));
    }
  }, [activeAgent]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', gap: 8, overflow: 'hidden' }}>

      {/* Panel 1: Agent List */}
      <div className="crm-glass" style={{ width: 300, minWidth: 260, flexShrink: 0, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(130,145,190,0.10)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--crm-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bot size={16} color="#4f6df5" /> AI Agents
            </h2>
            <button onClick={() => void loadAgents()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}>
              <RefreshCw size={13} />
            </button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{ width: '100%', padding: '8px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Plus size={13} /> New Agent
          </button>
        </div>

        {/* Stats row */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(130,145,190,0.08)', display: 'flex', gap: 12, flexShrink: 0 }}>
          {[
            { label: 'Total', value: agents.length, color: 'var(--crm-text)' },
            { label: 'Active', value: agents.filter(a => a.enabled).length, color: '#28c99a' },
            { label: 'Runs', value: agents.reduce((s, a) => s + a.execution_count, 0), color: '#4f6df5' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 750, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'var(--crm-text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ height: 80, borderRadius: 12, background: 'rgba(255,255,255,0.40)', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))
          ) : agents.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--crm-text-muted)' }}>
              <Bot size={32} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
              <p style={{ margin: 0, fontSize: 13 }}>No agents yet</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.7 }}>Create your first AI agent</p>
            </div>
          ) : agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={activeAgent?.id === agent.id}
              onSelect={() => handleSelect(agent)}
              onToggle={() => void handleToggle(agent)}
              onDelete={() => void handleDelete(agent)}
            />
          ))}
        </div>
      </div>

      {/* Panel 2: Agent Detail */}
      {activeAgent ? (
        <div className="crm-glass" style={{ flex: 1, minWidth: 0, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>
          {error && (
            <div style={{ margin: '8px 12px 0', padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={12} color="#f46b72" />
              <span style={{ fontSize: 11, color: '#f46b72', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f46b72' }}><X size={11} /></button>
            </div>
          )}
          <AgentDetail
            agent={activeAgent}
            executions={executions}
            approvals={approvals}
            onRun={handleRun}
            onApprove={handleApprove}
            running={running}
            runResult={runResult}
          />
        </div>
      ) : (
        <div className="crm-glass" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: 'var(--crm-text-muted)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,rgba(79,109,245,0.15),rgba(139,92,246,0.10))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={28} color="#4f6df5" style={{ opacity: 0.6 }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Select an agent</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.7 }}>Or create a new AI agent to get started</p>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            {[
              { icon: <Brain size={14} />, label: 'Reason over CRM data' },
              { icon: <Zap size={14} />, label: 'Execute approved actions' },
              { icon: <Shield size={14} />, label: 'Human approval gates' },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--crm-text-muted)', background: 'rgba(255,255,255,0.40)', padding: '6px 10px', borderRadius: 8 }}>
                {f.icon} {f.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateAgentModal
          tools={tools}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
