'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Navigation, Plus, Play, Pause, Trash2, RefreshCw,
  CheckCircle, XCircle, Clock, AlertCircle, Zap,
  GitBranch, Brain, Timer, Flag, ArrowRight, X,
  ChevronRight, Users, BarChart3, Activity,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────
interface Journey {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'archived';
  trigger_type: string;
  entry_count: number;
  active_count: number;
  completed_count: number;
  conversion_rate: number | null;
  nodes: JourneyNode[];
  edges: JourneyEdge[];
  created_at: string;
  updated_at: string;
}

interface JourneyNode {
  id: string;
  type: 'trigger' | 'condition' | 'ai_decision' | 'action' | 'wait' | 'stage' | 'end';
  data: { label: string; config: Record<string, unknown> };
  position?: { x: number; y: number };
}

interface JourneyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface Execution {
  id: string;
  contact_id: string | null;
  status: string;
  triggered_by: string;
  nodes_executed: NodeResult[];
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

interface NodeResult {
  nodeId: string;
  nodeType: string;
  status: string;
  result: Record<string, unknown>;
  durationMs: number;
  executedAt: string;
}

// ── Constants ─────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: '#8790aa', active: '#28c99a', paused: '#f4c95d', archived: '#8790aa',
};

const EXEC_COLORS: Record<string, string> = {
  completed: '#28c99a', failed: '#f46b72', waiting: '#f4c95d', running: '#4d7cff',
};

const NODE_TYPES = [
  { type: 'trigger',     label: 'Trigger',      icon: <Zap size={12} />,         color: '#4f6df5', desc: 'Journey entry point' },
  { type: 'condition',   label: 'Condition',    icon: <GitBranch size={12} />,    color: '#f4c95d', desc: 'Branch on field value' },
  { type: 'ai_decision', label: 'AI Decision',  icon: <Brain size={12} />,        color: '#8b5cf6', desc: 'Branch on AI score' },
  { type: 'action',      label: 'Action',       icon: <CheckCircle size={12} />,  color: '#28c99a', desc: 'Execute CRM action' },
  { type: 'wait',        label: 'Wait',         icon: <Timer size={12} />,        color: '#f46b72', desc: 'Pause execution' },
  { type: 'stage',       label: 'Stage',        icon: <Flag size={12} />,         color: '#06b6d4', desc: 'Update journey stage' },
  { type: 'end',         label: 'End',          icon: <X size={12} />,            color: '#8790aa', desc: 'Journey complete' },
] as const;

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual', contact_created: 'Contact Created', lead_created: 'Lead Created',
  conversation_started: 'Conversation Started', message_received: 'Message Received',
  deal_created: 'Deal Created', deal_stage_changed: 'Deal Stage Changed',
  deal_won: 'Deal Won', appointment_created: 'Appointment Created',
  customer_inactive: 'Customer Inactive', ai_score_threshold: 'AI Score Threshold',
  intent_detected: 'Intent Detected', content_interaction: 'Content Interaction',
};

const ACTION_TYPES = [
  { value: 'create_followup',    label: 'Create Follow-up' },
  { value: 'update_lead_status', label: 'Update Lead Status' },
  { value: 'create_task',        label: 'Create Task' },
  { value: 'send_notification',  label: 'Send Notification' },
  { value: 'add_journey_event',  label: 'Log Journey Event' },
];

const CONDITION_FIELDS = [
  { value: 'lead_score',    label: 'Lead Score' },
  { value: 'lead_status',   label: 'Lead Status' },
  { value: 'lead_score_tier', label: 'Score Tier' },
  { value: 'source',        label: 'Source' },
];

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

let _nodeCounter = 0;
function newNodeId() { return `node-${++_nodeCounter}-${Date.now()}`; }
function newEdgeId() { return `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

// ── Journey Card ──────────────────────────────────────────────
function JourneyCard({ journey, selected, onSelect, onToggle, onDelete }: {
  journey: Journey; selected: boolean;
  onSelect: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const statusColor = STATUS_COLORS[journey.status] ?? '#8790aa';
  const convRate = journey.conversion_rate ?? (journey.entry_count > 0 ? Math.round((journey.completed_count / journey.entry_count) * 100) : 0);
  return (
    <button onClick={onSelect} style={{
      width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 12, marginBottom: 5,
      border: 'none', cursor: 'pointer',
      background: selected ? 'linear-gradient(135deg,rgba(79,109,245,0.18),rgba(139,92,246,0.12))' : 'rgba(255,255,255,0.50)',
      borderLeft: selected ? '3px solid #4f6df5' : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{journey.name}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: statusColor, background: `${statusColor}18`, borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase', flexShrink: 0 }}>{journey.status}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginBottom: 5 }}>{TRIGGER_LABELS[journey.trigger_type] ?? journey.trigger_type}</div>
          <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--crm-text-muted)' }}>
            <span>{journey.entry_count} entered</span>
            <span style={{ color: '#28c99a' }}>{journey.completed_count} done</span>
            {convRate > 0 && <span style={{ color: '#4f6df5' }}>{convRate}% conv</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onToggle(); }} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: journey.status === 'active' ? 'rgba(244,201,93,0.15)' : 'rgba(40,201,154,0.12)', color: journey.status === 'active' ? '#f4c95d' : '#28c99a' }}>
            {journey.status === 'active' ? <Pause size={10} /> : <Play size={10} />}
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(244,107,114,0.10)', color: '#f46b72' }}>
            <Trash2 size={10} />
          </button>
        </div>
      </div>
    </button>
  );
}

// ── Node Config Panel ─────────────────────────────────────────
function NodeConfigPanel({ node, onUpdate, onDelete, onClose }: {
  node: JourneyNode; onUpdate: (n: JourneyNode) => void;
  onDelete: () => void; onClose: () => void;
}) {
  const [cfg, setCfg] = useState({ ...node.data.config });
  const [label, setLabel] = useState(node.data.label);

  const save = () => onUpdate({ ...node, data: { label, config: cfg } });

  return (
    <div style={{ position: 'absolute', right: 0, top: 0, width: 260, height: '100%', background: 'rgba(255,255,255,0.95)', borderLeft: '1px solid rgba(130,145,190,0.15)', padding: '14px 14px', overflowY: 'auto', zIndex: 10, backdropFilter: 'blur(12px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)' }}>Configure Node</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={14} /></button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>LABEL</label>
          <input value={label} onChange={e => setLabel(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {node.type === 'condition' && (
          <>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>FIELD</label>
              <select value={(cfg.field as string) ?? 'lead_score'} onChange={e => setCfg(p => ({ ...p, field: e.target.value }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none' }}>
                {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>OPERATOR</label>
              <select value={(cfg.operator as string) ?? 'gt'} onChange={e => setCfg(p => ({ ...p, operator: e.target.value }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none' }}>
                {[['gt','>'],['gte','≥'],['lt','<'],['lte','≤'],['eq','='],['neq','≠'],['contains','contains']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>VALUE</label>
              <input value={(cfg.value as string) ?? ''} onChange={e => setCfg(p => ({ ...p, value: e.target.value }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </>
        )}

        {node.type === 'ai_decision' && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>SCORE THRESHOLD</label>
            <input type="number" min={0} max={100} value={(cfg.score_threshold as number) ?? 70} onChange={e => setCfg(p => ({ ...p, score_threshold: parseInt(e.target.value) }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 4 }}>YES if AI score ≥ threshold</div>
          </div>
        )}

        {node.type === 'action' && (
          <>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>ACTION TYPE</label>
              <select value={(cfg.action_type as string) ?? 'create_followup'} onChange={e => setCfg(p => ({ ...p, action_type: e.target.value }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none' }}>
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>TITLE / MESSAGE</label>
              <input value={(cfg.title as string) ?? (cfg.message as string) ?? ''} onChange={e => setCfg(p => ({ ...p, title: e.target.value, message: e.target.value }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </>
        )}

        {node.type === 'wait' && (
          <>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>AMOUNT</label>
              <input type="number" min={1} value={(cfg.amount as number) ?? 1} onChange={e => setCfg(p => ({ ...p, amount: parseInt(e.target.value) }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>UNIT</label>
              <select value={(cfg.unit as string) ?? 'hours'} onChange={e => setCfg(p => ({ ...p, unit: e.target.value }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none' }}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </>
        )}

        {node.type === 'stage' && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 4 }}>STAGE</label>
            <select value={(cfg.stage as string) ?? 'engagement'} onChange={e => setCfg(p => ({ ...p, stage: e.target.value }))} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)', fontSize: 12, outline: 'none' }}>
              {['discovery','engagement','conversation','qualification','sales','conversion','retention','expansion'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button onClick={save} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
          <button onClick={onDelete} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'rgba(244,107,114,0.10)', color: '#f46b72', fontSize: 11, cursor: 'pointer' }}><Trash2 size={11} /></button>
        </div>
      </div>
    </div>
  );
}

// ── Journey Builder Canvas ────────────────────────────────────
function JourneyBuilder({ journey, onSave }: {
  journey: Journey;
  onSave: (nodes: JourneyNode[], edges: JourneyEdge[]) => Promise<void>;
}) {
  const [nodes, setNodes] = useState<JourneyNode[]>(journey.nodes ?? []);
  const [edges, setEdges] = useState<JourneyEdge[]>(journey.edges ?? []);
  const [selectedNode, setSelectedNode] = useState<JourneyNode | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const addNode = (type: JourneyNode['type']) => {
    const nodeType = NODE_TYPES.find(n => n.type === type);
    const newNode: JourneyNode = {
      id: newNodeId(),
      type,
      data: { label: nodeType?.label ?? type, config: {} },
      position: { x: 80 + nodes.length * 160, y: 120 },
    };
    setNodes(prev => [...prev, newNode]);
    setDirty(true);
  };

  const updateNode = (updated: JourneyNode) => {
    setNodes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setSelectedNode(updated);
    setDirty(true);
  };

  const deleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    setDirty(true);
  };

  const connectNodes = (targetId: string) => {
    if (!connecting || connecting === targetId) { setConnecting(null); return; }
    const exists = edges.some(e => e.source === connecting && e.target === targetId);
    if (!exists) {
      setEdges(prev => [...prev, { id: newEdgeId(), source: connecting, target: targetId }]);
      setDirty(true);
    }
    setConnecting(null);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(nodes, edges);
    setSaving(false);
    setDirty(false);
  };

  // Build a simple vertical layout for display
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(130,145,190,0.10)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', marginRight: 4 }}>ADD NODE:</span>
        {NODE_TYPES.map(nt => (
          <button key={nt.type} onClick={() => addNode(nt.type)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7, border: `1px solid ${nt.color}30`, background: `${nt.color}10`, color: nt.color, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
            {nt.icon} {nt.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {dirty && <span style={{ fontSize: 10, color: '#f4c95d', alignSelf: 'center' }}>Unsaved changes</span>}
          <button onClick={() => void handleSave()} disabled={saving || !dirty} style={{ padding: '5px 14px', borderRadius: 8, border: 'none', background: dirty ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.20)', color: dirty ? 'white' : 'var(--crm-text-muted)', fontSize: 11, fontWeight: 700, cursor: dirty ? 'pointer' : 'default' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', position: 'relative', background: 'rgba(255,255,255,0.15)' }}>
        {nodes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--crm-text-muted)' }}>
            <GitBranch size={36} style={{ opacity: 0.2 }} />
            <p style={{ margin: 0, fontSize: 13 }}>Add nodes to build your journey</p>
            <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>Start with a Trigger node, then add Conditions, Actions, and more</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, alignItems: 'flex-start', minWidth: 600 }}>
            {/* Render nodes in a vertical flow */}
            {nodes.map((node, idx) => {
              const nt = NODE_TYPES.find(t => t.type === node.type);
              const color = nt?.color ?? '#8790aa';
              const isSelected = selectedNode?.id === node.id;
              const isConnecting = connecting === node.id;
              // Find outgoing edges
              const outEdges = edges.filter(e => e.source === node.id);
              const inEdges  = edges.filter(e => e.target === node.id);

              return (
                <div key={node.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 0 }}>
                  {/* Incoming connector line */}
                  {inEdges.length > 0 && (
                    <div style={{ width: 2, height: 20, background: 'rgba(130,145,190,0.25)', marginLeft: 28 }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Node box */}
                    <div
                      onClick={() => setSelectedNode(isSelected ? null : node)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                        borderRadius: 12, cursor: 'pointer', minWidth: 160,
                        background: isSelected ? `${color}18` : 'rgba(255,255,255,0.70)',
                        border: `1.5px solid ${isSelected ? color : `${color}30`}`,
                        boxShadow: isSelected ? `0 0 0 2px ${color}20` : 'none',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <div style={{ width: 26, height: 26, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
                        {nt?.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text)' }}>{node.data.label}</div>
                        <div style={{ fontSize: 9, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>{node.type}</div>
                      </div>
                    </div>

                    {/* Connect button */}
                    <button
                      onClick={() => connecting ? connectNodes(node.id) : setConnecting(node.id)}
                      title={connecting ? `Connect to ${node.data.label}` : 'Start connection'}
                      style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${isConnecting ? '#4f6df5' : 'rgba(130,145,190,0.25)'}`, background: isConnecting ? 'rgba(79,109,245,0.15)' : 'rgba(255,255,255,0.60)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isConnecting ? '#4f6df5' : 'var(--crm-text-muted)' }}
                    >
                      <ArrowRight size={10} />
                    </button>

                    {/* Edge labels */}
                    {outEdges.length > 0 && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {outEdges.map(e => {
                          const target = nodeMap.get(e.target);
                          return (
                            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--crm-text-muted)' }}>
                              {e.label && <span style={{ fontSize: 9, fontWeight: 700, color: e.label === 'yes' ? '#28c99a' : '#f46b72', background: e.label === 'yes' ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.10)', borderRadius: 4, padding: '1px 5px' }}>{e.label.toUpperCase()}</span>}
                              <ChevronRight size={10} />
                              <span style={{ fontWeight: 600 }}>{target?.data.label ?? e.target.slice(0, 8)}</span>
                              <button onClick={() => { setEdges(prev => prev.filter(ed => ed.id !== e.id)); setDirty(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f46b72', padding: 0, lineHeight: 1 }}><X size={9} /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Outgoing connector line */}
                  {idx < nodes.length - 1 && outEdges.length === 0 && (
                    <div style={{ width: 2, height: 16, background: 'rgba(130,145,190,0.15)', marginLeft: 28 }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Node config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={updateNode}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {connecting && (
        <div style={{ padding: '8px 14px', background: 'rgba(79,109,245,0.08)', borderTop: '1px solid rgba(79,109,245,0.15)', fontSize: 11, color: '#4f6df5', flexShrink: 0 }}>
          Click another node to connect, or click the same node to cancel.
        </div>
      )}
    </div>
  );
}

// ── Journey Detail ────────────────────────────────────────────
function JourneyDetail({ journey, executions, onSave, onPublish, onTest, testResult, testing }: {
  journey: Journey;
  executions: Execution[];
  onSave: (nodes: JourneyNode[], edges: JourneyEdge[]) => Promise<void>;
  onPublish: () => Promise<void>;
  onTest: (contactId: string) => Promise<void>;
  testResult: string | null;
  testing: boolean;
}) {
  const [tab, setTab] = useState<'builder' | 'analytics' | 'history' | 'test'>('builder');
  const [testContactId, setTestContactId] = useState('');
  const [publishing, setPublishing] = useState(false);

  const handlePublish = async () => {
    setPublishing(true);
    await onPublish();
    setPublishing(false);
  };

  const tabs = [
    { id: 'builder' as const, label: 'Builder', icon: <GitBranch size={12} /> },
    { id: 'analytics' as const, label: 'Analytics', icon: <BarChart3 size={12} /> },
    { id: 'history' as const, label: `History (${executions.length})`, icon: <Activity size={12} /> },
    { id: 'test' as const, label: 'Test', icon: <Play size={12} /> },
  ];

  const convRate = journey.entry_count > 0 ? Math.round((journey.completed_count / journey.entry_count) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(130,145,190,0.10)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 750, color: 'var(--crm-text)' }}>{journey.name}</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>
              {TRIGGER_LABELS[journey.trigger_type]} · {journey.nodes.length} nodes · {journey.edges.length} connections
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {journey.status === 'draft' && (
              <button onClick={() => void handlePublish()} disabled={publishing} style={{ padding: '6px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#28c99a,#06b6d4)', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: publishing ? 0.7 : 1 }}>
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            )}
            <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLORS[journey.status], background: `${STATUS_COLORS[journey.status]}18`, borderRadius: 7, padding: '4px 9px', alignSelf: 'center', textTransform: 'uppercase' }}>{journey.status}</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
          {[
            { label: 'Entered', value: journey.entry_count, color: '#4f6df5' },
            { label: 'Active', value: journey.active_count, color: '#f4c95d' },
            { label: 'Completed', value: journey.completed_count, color: '#28c99a' },
            { label: 'Conv%', value: `${convRate}%`, color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 750, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'var(--crm-text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: tab === t.id ? 700 : 400, background: tab === t.id ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.50)', color: tab === t.id ? 'white' : 'var(--crm-text-secondary)' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tab === 'builder' && (
          <JourneyBuilder journey={journey} onSave={onSave} />
        )}

        {tab === 'analytics' && (
          <div style={{ padding: '14px 16px', overflowY: 'auto', height: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Total Entered', value: journey.entry_count, color: '#4f6df5', icon: <Users size={14} /> },
                { label: 'Currently Active', value: journey.active_count, color: '#f4c95d', icon: <Activity size={14} /> },
                { label: 'Completed', value: journey.completed_count, color: '#28c99a', icon: <CheckCircle size={14} /> },
                { label: 'Conversion Rate', value: `${convRate}%`, color: '#8b5cf6', icon: <BarChart3 size={14} /> },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.70)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{ color: s.color }}>{s.icon}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 750, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.70)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 10 }}>Node Summary</div>
              {journey.nodes.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>No nodes configured yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {journey.nodes.map(n => {
                    const nt = NODE_TYPES.find(t => t.type === n.type);
                    return (
                      <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.40)' }}>
                        <div style={{ color: nt?.color ?? '#8790aa' }}>{nt?.icon}</div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text)' }}>{n.data.label}</span>
                        <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginLeft: 'auto', textTransform: 'uppercase' }}>{n.type}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div style={{ padding: '14px 16px', overflowY: 'auto', height: '100%' }}>
            {executions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--crm-text-muted)' }}>
                <Clock size={28} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
                <p style={{ margin: 0, fontSize: 13 }}>No executions yet</p>
              </div>
            ) : executions.map(ex => (
              <div key={ex.id} style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.70)', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {ex.status === 'completed' ? <CheckCircle size={12} color="#28c99a" /> : ex.status === 'failed' ? <XCircle size={12} color="#f46b72" /> : <Clock size={12} color="#f4c95d" />}
                  <span style={{ fontSize: 11, fontWeight: 700, color: EXEC_COLORS[ex.status] ?? '#8790aa', textTransform: 'uppercase' }}>{ex.status}</span>
                  <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginLeft: 'auto' }}>{timeAgo(ex.started_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--crm-text-muted)' }}>
                  <span>{ex.nodes_executed?.length ?? 0} nodes</span>
                  {ex.duration_ms && <span>{ex.duration_ms}ms</span>}
                  <span>via {ex.triggered_by}</span>
                </div>
                {ex.error_message && <div style={{ fontSize: 11, color: '#f46b72', marginTop: 4 }}>{ex.error_message}</div>}
              </div>
            ))}
          </div>
        )}

        {tab === 'test' && (
          <div style={{ padding: '14px 16px', overflowY: 'auto', height: '100%' }}>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)', fontSize: 11, color: '#4f6df5', marginBottom: 14 }}>
              Test this journey against a real contact. All CRM actions will execute.
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>CONTACT ID</label>
              <input value={testContactId} onChange={e => setTestContactId(e.target.value)} placeholder="UUID of contact to run journey for" style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button onClick={() => void onTest(testContactId)} disabled={testing || !testContactId.trim()} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: testContactId.trim() ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.20)', color: testContactId.trim() ? 'white' : 'var(--crm-text-muted)', fontSize: 12, fontWeight: 700, cursor: testContactId.trim() && !testing ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {testing ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Running...</> : <><Play size={13} /> Run Journey</>}
            </button>
            {testResult && (
              <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(40,201,154,0.08)', border: '1px solid rgba(40,201,154,0.20)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#28c99a', marginBottom: 6 }}>RESULT</div>
                <div style={{ fontSize: 12, color: 'var(--crm-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{testResult}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create Journey Modal ──────────────────────────────────────
function CreateJourneyModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (data: { name: string; description: string; trigger_type: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('manual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onCreate({ name, description, trigger_type: triggerType });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 440, padding: 24, borderRadius: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--crm-text)' }}>New Journey</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={16} /></button>
        </div>
        {error && <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>NAME</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hot Lead Nurture" style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 13, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>DESCRIPTION</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, color: 'var(--crm-text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5 }}>TRIGGER</label>
            <select value={triggerType} onChange={e => setTriggerType(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, color: 'var(--crm-text)', outline: 'none' }}>
              {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 12, cursor: 'pointer', color: 'var(--crm-text)' }}>Cancel</button>
            <button onClick={() => void handleSubmit()} disabled={saving} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating...' : 'Create Journey'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function JourneysPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadJourneys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v3/journeys');
      if (res.ok) {
        const d = await res.json() as { journeys: Journey[] };
        setJourneys(d.journeys ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadJourneys(); }, [loadJourneys]);

  const loadExecutions = useCallback(async (journeyId: string) => {
    const res = await fetch(`/api/v3/journeys/${journeyId}/executions`);
    if (res.ok) {
      const d = await res.json() as { executions: Execution[] };
      setExecutions(d.executions ?? []);
    }
  }, []);

  const handleSelect = useCallback((j: Journey) => {
    setActiveJourney(j);
    setTestResult(null);
    void loadExecutions(j.id);
  }, [loadExecutions]);

  const handleCreate = useCallback(async (data: { name: string; description: string; trigger_type: string }) => {
    const res = await fetch('/api/v3/journeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      throw new Error(d.error ?? 'Failed to create');
    }
    await loadJourneys();
  }, [loadJourneys]);

  const handleSave = useCallback(async (nodes: JourneyNode[], edges: JourneyEdge[]) => {
    if (!activeJourney) return;
    const res = await fetch(`/api/v3/journeys/${activeJourney.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges }),
    });
    if (res.ok) {
      const d = await res.json() as { journey: Journey };
      setActiveJourney(d.journey);
      setJourneys(prev => prev.map(j => j.id === d.journey.id ? d.journey : j));
    }
  }, [activeJourney]);

  const handlePublish = useCallback(async () => {
    if (!activeJourney) return;
    const res = await fetch(`/api/v3/journeys/${activeJourney.id}/publish`, { method: 'POST' });
    if (res.ok) {
      const d = await res.json() as { journey: Journey };
      setActiveJourney(d.journey);
      setJourneys(prev => prev.map(j => j.id === d.journey.id ? d.journey : j));
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? 'Publish failed');
    }
  }, [activeJourney]);

  const handleToggle = useCallback(async (journey: Journey) => {
    const newStatus = journey.status === 'active' ? 'paused' : 'active';
    const res = await fetch(`/api/v3/journeys/${journey.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setJourneys(prev => prev.map(j => j.id === journey.id ? { ...j, status: newStatus as Journey['status'] } : j));
      if (activeJourney?.id === journey.id) setActiveJourney(prev => prev ? { ...prev, status: newStatus as Journey['status'] } : prev);
    }
  }, [activeJourney]);

  const handleDelete = useCallback(async (journey: Journey) => {
    if (!confirm(`Delete journey "${journey.name}"?`)) return;
    const res = await fetch(`/api/v3/journeys/${journey.id}`, { method: 'DELETE' });
    if (res.ok) {
      setJourneys(prev => prev.filter(j => j.id !== journey.id));
      if (activeJourney?.id === journey.id) setActiveJourney(null);
    }
  }, [activeJourney]);

  const handleTest = useCallback(async (contactId: string) => {
    if (!activeJourney || !contactId.trim()) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/v3/journeys/${activeJourney.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      });
      const d = await res.json() as { summary?: string; error?: string; status?: string; nodesExecuted?: NodeResult[] };
      if (d.error && !d.summary) {
        setTestResult(`Error: ${d.error}`);
      } else {
        const nodeDetails = (d.nodesExecuted ?? []).map(n => `  • ${n.nodeType}: ${n.status}`).join('\n');
        setTestResult(`${d.summary ?? 'Completed'}\n\nNodes:\n${nodeDetails || '  (none)'}`);
      }
      await loadExecutions(activeJourney.id);
      // Refresh journey stats
      const jr = await fetch(`/api/v3/journeys/${activeJourney.id}`);
      if (jr.ok) {
        const jd = await jr.json() as { journey: Journey };
        setActiveJourney(jd.journey);
        setJourneys(prev => prev.map(j => j.id === jd.journey.id ? jd.journey : j));
      }
    } catch {
      setTestResult('Journey execution failed.');
    } finally {
      setTesting(false);
    }
  }, [activeJourney, loadExecutions]);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', gap: 8, overflow: 'hidden' }}>

      {/* Panel 1: Journey List */}
      <div className="crm-glass" style={{ width: 290, minWidth: 250, flexShrink: 0, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(130,145,190,0.10)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--crm-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Navigation size={15} color="#4f6df5" /> Journeys
            </h2>
            <button onClick={() => void loadJourneys()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}>
              <RefreshCw size={13} />
            </button>
          </div>
          <button onClick={() => setShowCreate(true)} style={{ width: '100%', padding: '8px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Plus size={13} /> New Journey
          </button>
        </div>

        {/* Stats */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(130,145,190,0.08)', display: 'flex', gap: 14, flexShrink: 0 }}>
          {[
            { label: 'Total', value: journeys.length, color: 'var(--crm-text)' },
            { label: 'Active', value: journeys.filter(j => j.status === 'active').length, color: '#28c99a' },
            { label: 'Draft', value: journeys.filter(j => j.status === 'draft').length, color: '#f4c95d' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 750, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'var(--crm-text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 72, borderRadius: 12, background: 'rgba(255,255,255,0.40)', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />)
          ) : journeys.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--crm-text-muted)' }}>
              <Navigation size={32} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
              <p style={{ margin: 0, fontSize: 13 }}>No journeys yet</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.7 }}>Create your first customer journey</p>
            </div>
          ) : journeys.map(j => (
            <JourneyCard
              key={j.id}
              journey={j}
              selected={activeJourney?.id === j.id}
              onSelect={() => handleSelect(j)}
              onToggle={() => void handleToggle(j)}
              onDelete={() => void handleDelete(j)}
            />
          ))}
        </div>
      </div>

      {/* Panel 2: Journey Detail */}
      {activeJourney ? (
        <div className="crm-glass" style={{ flex: 1, minWidth: 0, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>
          {error && (
            <div style={{ margin: '8px 12px 0', padding: '8px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={12} color="#f46b72" />
              <span style={{ fontSize: 11, color: '#f46b72', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f46b72' }}><X size={11} /></button>
            </div>
          )}
          <JourneyDetail
            journey={activeJourney}
            executions={executions}
            onSave={handleSave}
            onPublish={handlePublish}
            onTest={handleTest}
            testResult={testResult}
            testing={testing}
          />
        </div>
      ) : (
        <div className="crm-glass" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: 'var(--crm-text-muted)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,rgba(79,109,245,0.15),rgba(139,92,246,0.10))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Navigation size={28} color="#4f6df5" style={{ opacity: 0.6 }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Select a journey</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.7 }}>Or create a new customer journey</p>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            {[
              { icon: <GitBranch size={13} />, label: 'Visual builder' },
              { icon: <Brain size={13} />, label: 'AI decisions' },
              { icon: <Zap size={13} />, label: 'CRM actions' },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--crm-text-muted)', background: 'rgba(255,255,255,0.40)', padding: '6px 10px', borderRadius: 8 }}>
                {f.icon} {f.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateJourneyModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
