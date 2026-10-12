'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Target, Plus, Users, Brain, Zap, RefreshCw, X } from 'lucide-react';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  type: string;
  contact_count: number;
  last_computed_at: string | null;
  created_at: string;
}

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ai_assisted: { label: 'AI Assisted', color: '#8b5cf6', icon: <Brain size={10} /> },
  rule_based:  { label: 'Rule Based',  color: '#4d7cff', icon: <Zap size={10} /> },
  manual:      { label: 'Manual',      color: '#8790aa', icon: <Users size={10} /> },
};

const ACCENT_COLORS = ['#f46b72', '#28c99a', '#4d7cff', '#f4c95d', '#8b5cf6', '#06b6d4'];

// ── Create Segment Modal ──────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: (seg: Segment) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [name, setName]         = useState('');
  const [description, setDesc]  = useState('');
  const [type, setType]         = useState('manual');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const submit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/v3/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, type }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to create segment');
      }
      const d = await res.json() as { segment: Segment };
      onCreated(d.segment);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create segment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="crm-glass" style={{ width: 440, padding: 28, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--crm-text)' }}>New Segment</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)' }}>Segment Name *</label>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            placeholder="e.g. High-Intent Leads"
            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', fontSize: 13, outline: 'none' }}
          />
        </div>

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)' }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Optional description..."
            rows={2}
            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'var(--crm-text)', fontSize: 13, outline: 'none', resize: 'none' }}
          />
        </div>

        {/* Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)' }}>Type</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['manual', 'rule_based', 'ai_assisted'] as const).map((t) => {
              const tm = TYPE_META[t];
              const active = type === t;
              return (
                <button key={t} onClick={() => setType(t)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 10px', borderRadius: 10, border: `1px solid ${active ? tm.color : 'rgba(255,255,255,0.12)'}`, background: active ? `${tm.color}18` : 'transparent', color: active ? tm.color : 'var(--crm-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms' }}>
                  {tm.icon}{tm.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p style={{ margin: 0, fontSize: 12, color: '#f46b72' }}>{error}</p>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={saving || !name.trim()}
            style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !name.trim() ? 0.6 : 1 }}>
            {saving ? 'Creating…' : 'Create Segment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/v3/segments');
      if (!res.ok) throw new Error('Failed');
      const d = await res.json() as { segments: Segment[] };
      setSegments(d.segments ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreated = (seg: Segment) => {
    setSegments((prev) => [seg, ...prev]);
    setShowModal(false);
  };

  return (
    <>
      {showModal && <CreateModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="crm-page-header">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Smart Segments</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>AI-powered contact segmentation</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> New Segment
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 140, borderRadius: 16, background: 'rgba(255,255,255,0.40)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : error ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <p style={{ margin: '0 0 12px' }}>Failed to load segments.</p>
            <button onClick={() => void load()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.25)', color: '#4f6df5', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : segments.length === 0 ? (
          <div className="crm-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <Target size={36} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <p style={{ margin: 0, fontSize: 14 }}>No segments yet</p>
            <p style={{ margin: '6px 0 16px', fontSize: 12 }}>Create your first segment to group contacts by behaviour, score or source.</p>
            <button onClick={() => setShowModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={12} /> Create Segment
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {segments.map((seg, i) => {
              const tm = TYPE_META[seg.type] ?? TYPE_META.manual;
              const color = ACCENT_COLORS[i % ACCENT_COLORS.length];
              return (
                <div key={seg.id} className="crm-glass" style={{ padding: '18px 20px', cursor: 'pointer', transition: 'transform 150ms' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Target size={18} color={color} />
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: tm.color, background: `${tm.color}15`, borderRadius: 6, padding: '2px 7px' }}>
                      {tm.icon}{tm.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 4 }}>{seg.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginBottom: 12 }}>{seg.description ?? 'No description'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 22, fontWeight: 750, color }}>{seg.contact_count}</div>
                    <span style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>contacts</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
