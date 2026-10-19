/**
 * CRM 3.0 — Customer Journey Builder (Premium)
 * Glassmorphism visual journey builder integrated with existing Supabase backend.
 * Text visibility first: explicit foreground colors on every surface.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Navigation, Plus, Play, Pause, Trash2, RefreshCw,
  CheckCircle, XCircle, Clock, AlertCircle, Zap,
  GitBranch, Brain, Timer, Flag, ArrowRight, X,
  ChevronRight, Users, BarChart3, Activity, Save, Copy, Download,
} from 'lucide-react';

import JourneyCanvas from '@/components/journeys/JourneyCanvas';
import JourneyDashboard from '@/components/journeys/JourneyDashboard';
import ExecutionHistory from '@/components/journeys/ExecutionHistory';
import JourneyAnalytics from '@/components/journeys/JourneyAnalytics';
import NodeConfigPanel from '@/components/journeys/NodeConfigPanel';

interface Journey {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'archived';
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  entry_count: number;
  active_count: number;
  completed_count: number;
  conversion_rate: number | null;
  created_at: string;
  updated_at: string;
}

interface CanvasNode {
  id: string;
  type: 'trigger' | 'condition' | 'ai_decision' | 'action' | 'wait' | 'stage' | 'end';
  position: { x: number; y: number };
  data: { label: string; config: Record<string, unknown> };
}

interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: 'yes' | 'no';
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual', contact_created: 'Contact Created', lead_created: 'Lead Created',
  conversation_started: 'Conversation Started', message_received: 'Message Received',
  deal_created: 'Deal Created', deal_stage_changed: 'Deal Stage Changed',
  deal_won: 'Deal Won', appointment_created: 'Appointment Created',
  customer_inactive: 'Customer Inactive', ai_score_threshold: 'AI Score Threshold',
  intent_detected: 'Intent Detected', content_interaction: 'Content Interaction',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; badge: string }> = {
  draft:     { label: 'Draft',     color: '#8b5cf6', badge: 'crm-journey-badge-draft' },
  active:    { label: 'Active',    color: '#22d3ee', badge: 'crm-journey-badge-active' },
  paused:    { label: 'Paused',    color: '#fbbf24', badge: 'crm-journey-badge-paused' },
  archived:  { label: 'Archived',  color: '#94a3b8', badge: 'crm-journey-badge-draft' },
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative z-10 w-full max-w-md crm-journey-glass-strong rounded-[24px] border border-crm-border/30 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-crm-text">New Journey</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-crm-accent flex items-center justify-center text-crm-muted transition-colors">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-crm-danger/10 border border-crm-danger/20 text-[11px] text-crm-danger">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-crm-muted uppercase tracking-wider mb-2">Journey Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hot Lead Nurture"
              className="w-full px-4 py-3 rounded-xl border border-crm-border/30 bg-crm-card-bg/80 text-crm-text text-sm outline-none focus:ring-2 focus:ring-crm-primary/20 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-crm-muted uppercase tracking-wider mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-crm-border/30 bg-crm-card-bg/80 text-crm-text text-sm outline-none focus:ring-2 focus:ring-crm-primary/20 transition-all resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-crm-muted uppercase tracking-wider mb-2">Trigger</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-crm-border/30 bg-crm-card-bg/80 text-crm-text text-sm outline-none focus:ring-2 focus:ring-crm-primary/20 transition-all"
            >
              {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-5 py-3 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-crm-text text-sm font-medium hover:bg-crm-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="flex-1 px-5 py-3 rounded-xl border border-transparent bg-linear-gradient-to-r from-crm-purple to-crm-blue text-white text-sm font-bold shadow-lg hover:shadow-crm-purple/30 transition-all disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Journey'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative z-10 w-full max-w-md crm-journey-glass-strong rounded-[24px] border border-crm-border/30 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-crm-text mb-2">{title}</h3>
        <p className="text-[13px] text-crm-muted mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-5 py-3 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-crm-text text-sm font-medium hover:bg-crm-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-5 py-3 rounded-xl border border-transparent bg-crm-danger text-white text-sm font-bold shadow-lg hover:bg-crm-danger/90 transition-all"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function JourneysPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [tab, setTab] = useState<'builder' | 'analytics' | 'history'>('builder');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmJourney, setConfirmJourney] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canvasDirty, setCanvasDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const loadJourneys = useCallback(async () => {
    try {
      const res = await fetch('/api/v3/journeys');
      if (!res.ok) throw new Error('Failed to load journeys');
      const d = await res.json();
      setJourneys(d.journeys ?? []);
    } catch (err) {
      console.error('[JourneysPage] load error:', err);
      setError('Failed to load journeys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadJourneys(); }, [loadJourneys]);

  const handleCreate = useCallback(async (data: { name: string; description: string; trigger_type: string }) => {
    const res = await fetch('/api/v3/journeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Failed to create journey');
    }
    const created = await res.json();
    setJourneys((prev) => [created.journey, ...prev]);
    setActiveJourney(created.journey);
    setCanvasDirty(false);
  }, []);

  const handleSaveCanvas = useCallback(async (nodes: CanvasNode[], edges: CanvasEdge[]) => {
    if (!activeJourney) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v3/journeys/${activeJourney.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save');
      }
      const updated = await res.json();
      setActiveJourney((prev) => (prev && prev.id === updated.journey.id ? updated.journey : prev));
      setJourneys((prev) => prev.map((j) => (j.id === updated.journey.id ? updated.journey : j)));
      setCanvasDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [activeJourney]);

  const handlePublish = useCallback(async () => {
    if (!activeJourney) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/v3/journeys/${activeJourney.id}/publish`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Publish failed');
      }
      const updated = await res.json();
      setActiveJourney(updated.journey);
      setJourneys((prev) => prev.map((j) => (j.id === updated.journey.id ? updated.journey : j)));
      setCanvasDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
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
      const d = await res.json();
      setJourneys((prev) => prev.map((j) => (j.id === journey.id ? d.journey : j)));
      if (activeJourney?.id === journey.id) setActiveJourney(d.journey);
    } else {
      setError('Failed to toggle journey status');
    }
  }, [activeJourney]);

  const handleDelete = useCallback(async (journey: Journey) => {
    setConfirmJourney(journey);
    setShowConfirm(true);
  }, []);

  const executeDelete = useCallback(async () => {
    if (!confirmJourney) return;
    const res = await fetch(`/api/v3/journeys/${confirmJourney.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setJourneys((prev) => prev.filter((j) => j.id !== confirmJourney!.id));
      if (activeJourney?.id === confirmJourney!.id) setActiveJourney(null);
    } else {
      setError('Failed to delete journey');
    }
    setShowConfirm(false);
    setConfirmJourney(null);
  }, [confirmJourney, activeJourney]);

  const handleDuplicate = useCallback(async (journey: Journey) => {
    const res = await fetch(`/api/v3/journeys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${journey.name} (Copy)`,
        description: journey.description,
        trigger_type: journey.trigger_type,
        trigger_config: journey.trigger_config,
        nodes: journey.nodes,
        edges: journey.edges,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setJourneys((prev) => [d.journey, ...prev]);
    } else {
      setError('Failed to duplicate journey');
    }
  }, []);

  const convRate = activeJourney?.entry_count
    ? Math.round((activeJourney.completed_count / activeJourney.entry_count) * 100)
    : 0;

  return (
    <div className="relative flex h-screen bg-crm-bg overflow-hidden">
      <div className="crm-tab-ambient">
        <div className="crm-tab-ambient-blob" />
        <div className="crm-tab-ambient-blob" />
        <div className="crm-tab-ambient-blob" />
      </div>

      <div className="relative z-10 flex h-full bg-crm-bg overflow-hidden">
        <div className="w-[320px] flex-shrink-0 flex flex-col border-r border-crm-border/30 crm-journey-glass z-20">
          <div className="flex items-center justify-between px-5 py-4 border-b border-crm-border/30 crm-journey-glass z-10 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Navigation size={16} strokeWidth={2} className="text-crm-primary" />
              <h1 className="text-sm font-bold text-crm-text tracking-tight">Journeys</h1>
            </div>
            <button
              onClick={() => void loadJourneys()}
              className="w-8 h-8 rounded-lg hover:bg-crm-accent/10 flex items-center justify-center text-crm-muted transition-colors"
            >
              <RefreshCw size={14} strokeWidth={2} />
            </button>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="w-full px-5 py-3 border border-crm-border/30 bg-crm-card-bg/80 text-[12px] font-medium text-crm-text flex items-center justify-center gap-2 hover:bg-crm-accent/10 transition-colors"
          >
            <Plus size={14} strokeWidth={2} /> New Journey
          </button>

          <div className="px-4 py-3 border-b border-crm-border/30 bg-crm-card-bg/80 backdrop-blur-sm">
            <div className="flex gap-3">
              {[
                { label: 'Total', value: journeys.length, color: 'text-crm-text' },
                { label: 'Active', value: journeys.filter((j) => j.status === 'active').length, color: 'text-crm-success' },
                { label: 'Draft', value: journeys.filter((j) => j.status === 'draft').length, color: 'text-crm-warning' },
              ].map((s) => (
                <div key={s.label} className="flex-1 text-center">
                  <div className="text-xs font-bold text-crm-text">{s.value}</div>
                  <div className="text-[10px] text-crm-muted">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3">
            {loading ? (
              <div className="py-10 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-crm-border animate-pulse" />
                ))}
              </div>
            ) : journeys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-crm-muted">
                <Navigation size={32} className="mb-3 opacity-30" />
                <p className="text-sm text-crm-text">No journeys yet</p>
                <p className="text-[11px] mt-1 text-crm-muted">Create your first customer journey</p>
              </div>
            ) : (
              journeys.map((j) => {
                const st = STATUS_CONFIG[j.status];
                return (
                  <button
                    key={j.id}
                    onClick={() => {
                      setActiveJourney(j);
                      setError(null);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all ${
                      activeJourney?.id === j.id
                        ? 'bg-crm-primary/10 border border-crm-primary/30 shadow-sm'
                        : 'bg-transparent hover:bg-crm-accent/10 border border-transparent'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-crm-text truncate">{j.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${st.badge}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-crm-muted">
                        <span>{TRIGGER_LABELS[j.trigger_type] ?? j.trigger_type}</span>
                        <span className="w-1 h-1 rounded-full bg-crm-border" />
                        <span>{j.entry_count} entered</span>
                        <span className="w-1 h-1 rounded-full bg-crm-border" />
                        <span className="text-crm-success">{j.completed_count} done</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleToggle(j); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-crm-bg/10 hover:bg-crm-success/10 text-crm-success transition-colors"
                      >
                        {j.status === 'active' ? <Pause size={10} strokeWidth={2} /> : <Play size={10} strokeWidth={2} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleDuplicate(j); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-crm-bg/10 hover:bg-crm-primary/10 text-crm-primary transition-colors"
                      >
                        <Copy size={10} strokeWidth={2} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleDelete(j); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-crm-bg/10 hover:bg-crm-danger/10 text-crm-danger transition-colors"
                      >
                        <Trash2 size={10} strokeWidth={2} />
                      </button>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-crm-bg">
          {error && (
            <div className="px-6 py-3 border-b border-crm-border/30 bg-crm-danger/10 flex items-center justify-between z-10">
              <span className="text-[11px] font-medium text-crm-danger">{error}</span>
              <button onClick={() => setError(null)} className="text-[10px] text-crm-danger hover:underline">
                Dismiss
              </button>
            </div>
          )}

          {activeJourney ? (
            <div className="flex flex-col h-full min-w-0">
              <div className="px-6 py-5 border-b border-crm-border/30 crm-journey-glass z-10 flex-shrink-0">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h1 className="text-lg font-bold text-crm-text">{activeJourney.name}</h1>
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                          activeJourney.status === 'active'
                            ? 'crm-journey-badge-active'
                            : activeJourney.status === 'paused'
                            ? 'crm-journey-badge-paused'
                            : 'crm-journey-badge-draft'
                        }`}
                      >
                        {activeJourney.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[12px] text-crm-muted">
                      {TRIGGER_LABELS[activeJourney.trigger_type]} • {activeJourney.nodes.length} nodes • {activeJourney.edges.length} connections
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCanvasDirty(true)}
                      disabled={saving || !canvasDirty}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border border-transparent ${canvasDirty && !saving ? 'bg-linear-gradient-to-r from-crm-purple to-crm-blue text-white shadow-lg hover:shadow-crm-primary/30 transition-all' : 'bg-crm-bg/50 border-crm-border/30 text-crm-muted'} text-sm font-medium disabled:opacity-50`}
                    >
                      <Save size={14} strokeWidth={2} /> {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                    {activeJourney.status === 'draft' && (
                      <button
                        onClick={handlePublish}
                        disabled={publishing}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-transparent bg-crm-success text-crm-text-strong text-sm font-bold shadow-lg hover:shadow-crm-success/30 transition-all disabled:opacity-50"
                      >
                        {publishing ? <><RefreshCw size={14} strokeWidth={2} className="animate-spin" /> Publishing...</> : <><Play size={14} strokeWidth={2} /> Publish</>}
                      </button>
                    )}
                    {(activeJourney.status === 'active' || activeJourney.status === 'paused') && (
                      <button
                        onClick={() => void handleToggle(activeJourney)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-crm-text text-sm font-medium hover:bg-crm-accent transition-colors"
                      >
                        {activeJourney.status === 'active' ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
                        {activeJourney.status === 'active' ? 'Pause' : 'Activate'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex gap-4">
                  {[
                    { label: 'Entered', value: activeJourney.entry_count, color: 'text-crm-purple', icon: <Users size={14} strokeWidth={2} /> },
                    { label: 'Active', value: activeJourney.active_count, color: 'text-crm-warning', icon: <Activity size={14} strokeWidth={2} /> },
                    { label: 'Completed', value: activeJourney.completed_count, color: 'text-crm-success', icon: <CheckCircle size={14} strokeWidth={2} /> },
                    { label: 'Conv', value: `${convRate}%`, color: 'text-crm-purple', icon: <BarChart3 size={14} strokeWidth={2} /> },
                  ].map((s) => (
                    <div key={s.label} className="flex-1 px-4 py-3 rounded-[16px] border border-crm-border/30 bg-crm-bg/50">
                      <div className="flex items-center justify-between mb-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.color} bg-crm-bg/40`}>
                          {s.icon}
                        </div>
                        <span className="text-[10px] font-bold text-crm-muted uppercase">{s.label}</span>
                      </div>
                      <div className="text-lg font-bold text-crm-text">{s.value}</div>
                    </div>
                  ))}
                </div>

                <div className="flex border-b border-crm-border/30 crm-journey-glass z-10 flex-shrink-0">
                  <button
                    onClick={() => setTab('builder')}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      tab === 'builder'
                        ? 'border-crm-primary text-crm-primary bg-crm-primary/5'
                        : 'text-crm-muted hover:text-crm-text'
                    }`}
                  >
                    Builder
                  </button>
                  <button
                    onClick={() => setTab('analytics')}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      tab === 'analytics'
                        ? 'border-crm-purple text-crm-purple bg-crm-purple/5'
                        : 'text-crm-muted hover:text-crm-text'
                    }`}
                  >
                    Analytics
                  </button>
                  <button
                    onClick={() => setTab('history')}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      tab === 'history'
                        ? 'border-crm-primary text-crm-primary bg-crm-primary/5'
                        : 'text-crm-muted hover:text-crm-text'
                    }`}
                  >
                    History ({activeJourney.entry_count > 0 ? activeJourney.entry_count : 0})
                  </button>
                </div>

                <div className="flex-1 overflow-hidden">
                  {tab === 'builder' && (
                    <div className="h-full flex flex-col">
                      <JourneyCanvas
                        journeyId={activeJourney.id}
                        nodes={activeJourney.nodes}
                        edges={activeJourney.edges}
                        onSave={handleSaveCanvas}
                        onPublish={handlePublish}
                        status={activeJourney.status}
                        isLoading={saving || publishing}
                      />
                    </div>
                  )}
                  {tab === 'analytics' && (
                    <div className="h-full overflow-y-auto p-6">
                      <JourneyDashboard accountId="" />
                      <JourneyAnalytics journeyId={activeJourney.id} />
                    </div>
                  )}
                  {tab === 'history' && (
                    <div className="h-full overflow-y-auto p-6">
                      <ExecutionHistory journeyId={activeJourney.id} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-crm-text-secondary">
                <Navigation size={48} className="mb-4 opacity-30" />
                <h3 className="text-sm font-medium text-crm-text">Select a journey</h3>
                <p className="text-[12px] mt-1 text-crm-muted">Create a new journey or select one from the list to begin building.</p>
              </div>
            </div>
          )}
        </div>

        {showCreate && (
          <CreateJourneyModal
            onClose={() => setShowCreate(false)}
            onCreate={handleCreate}
          />
        )}

        {showConfirm && confirmJourney && (
          <ConfirmDialog
            open={showConfirm}
            title={`Delete "${confirmJourney.name}"?`}
            message="This action cannot be undone. All execution history for this journey will be lost."
            onConfirm={executeDelete}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}
