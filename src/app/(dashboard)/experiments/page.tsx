'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, FlaskConical, Play, Pause, CheckCircle, Trash2, X, AlertCircle, ChevronDown, TrendingUp } from 'lucide-react';
import { v3fetch } from '@/lib/auth-client';

interface Variant { name: string; description?: string | null; }
interface VariantStats { exposures: number; conversions: number; rate: number; }
interface Experiment {
  id: string;
  name: string;
  description: string | null;
  status: string;
  metric: string;
  variants: Variant[];
  started_at: string | null;
  ended_at: string | null;
  winner_variant: string | null;
  created_at: string;
  stats?: Record<string, VariantStats>;
  has_enough_data?: boolean;
  min_exposures_required?: number;
}

const METRICS = ['conversion_rate', 'click_rate', 'open_rate', 'reply_rate', 'revenue'] as const;
const STATUS_COLOR: Record<string, string> = {
  draft: '#8790aa', running: '#28c99a', paused: '#f4c95d', completed: '#4f6df5',
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  draft: <FlaskConical size={12} />, running: <Play size={12} />,
  paused: <Pause size={12} />, completed: <CheckCircle size={12} />,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)',
  fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none',
};

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (e: Experiment) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<string>('conversion_rate');
  const [variants, setVariants] = useState([{ name: 'control' }, { name: 'variant_a' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addVariant = () => {
    if (variants.length >= 5) return;
    setVariants(v => [...v, { name: `variant_${String.fromCharCode(97 + v.length - 1)}` }]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (variants.some(v => !v.name.trim())) { setError('All variants must have a name'); return; }
    setSaving(true); setError('');
    try {
      const res = await v3fetch('/api/v3/experiments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, metric, variants }),
      });
      if (!res.ok) { const d = await res.json() as { detail?: string }; throw new Error(d.detail ?? 'Create failed'); }
      onCreated(await res.json() as Experiment);
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 520, borderRadius: 18, padding: 26, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>New A/B Experiment</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
        </div>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={13} />{error}
          </div>
        )}
        <form onSubmit={e => void handleSave(e)} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Experiment Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CTA Button Color Test" style={inputStyle} autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Description <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(optional)</span></label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What are you testing?" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Primary Metric</label>
            <div style={{ position: 'relative' }}>
              <select value={metric} onChange={e => setMetric(e.target.value)} style={{ ...inputStyle, appearance: 'none', paddingRight: 32 }}>
                {METRICS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--crm-text-muted)' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)' }}>Variants ({variants.length}/5)</label>
              {variants.length < 5 && (
                <button type="button" onClick={addVariant} style={{ fontSize: 11, color: '#4f6df5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Add Variant</button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {variants.map((v, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={v.name} onChange={e => setVariants(vs => vs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder={`Variant ${i + 1} name`} style={{ ...inputStyle, flex: 1 }} />
                  {variants.length > 2 && (
                    <button type="button" onClick={() => setVariants(vs => vs.filter((_, j) => j !== i))} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(244,107,114,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f46b72', flexShrink: 0 }}><X size={12} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              <FlaskConical size={14} />{saving ? 'Creating...' : 'Create Experiment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (filterStatus) params.set('status', filterStatus);
      const res = await v3fetch(`/api/v3/experiments?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const d = await res.json() as { data: Experiment[]; total: number };
      setExperiments(d.data ?? []); setTotal(d.total ?? 0);
    } catch { setError('Failed to load experiments'); }
    finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { void load(); }, [load]);

  const transition = async (id: string, status: string) => {
    setTransitioning(id);
    try {
      const res = await v3fetch(`/api/v3/experiments/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const d = await res.json() as { detail?: string }; throw new Error(d.detail ?? 'Update failed'); }
      const updated = await res.json() as Experiment;
      setExperiments(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setTransitioning(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this experiment?')) return;
    const res = await v3fetch(`/api/v3/experiments/${id}`, { method: 'DELETE' });
    if (res.ok) { setExperiments(prev => prev.filter(e => e.id !== id)); setTotal(t => t - 1); }
    else { const d = await res.json() as { detail?: string }; setError(d.detail ?? 'Delete failed'); }
  };

  const handleCreated = (exp: Experiment) => {
    setExperiments(prev => [exp, ...prev]);
    setTotal(t => t + 1);
    setShowCreate(false);
  };

  const running = experiments.filter(e => e.status === 'running').length;
  const drafts = experiments.filter(e => e.status === 'draft').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}

      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>A/B Testing</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>{total} experiments · {running} running · {drafts} drafts</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> New Experiment
        </button>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6 }}>
        {['', 'draft', 'running', 'paused', 'completed'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: filterStatus === s ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: filterStatus === s ? 'white' : 'var(--crm-text-secondary)' }}>
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 13 }}>
          <AlertCircle size={14} />{error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#f46b72' }}><X size={13} /></button>
        </div>
      )}

      {loading ? (
        <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading experiments...</div>
      ) : experiments.length === 0 ? (
        <div className="crm-glass" style={{ padding: 56, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
          <FlaskConical size={40} style={{ margin: '0 auto 14px', opacity: 0.2 }} />
          <p style={{ margin: '0 0 14px', fontSize: 14 }}>{filterStatus ? `No ${filterStatus} experiments` : 'No experiments yet'}</p>
          {!filterStatus && (
            <button onClick={() => setShowCreate(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> Create First Experiment
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {experiments.map(exp => {
            const color = STATUS_COLOR[exp.status] ?? '#8790aa';
            const isBusy = transitioning === exp.id;
            return (
              <div key={exp.id} className="crm-glass-soft" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `${color}18`, color }}>
                        {STATUS_ICON[exp.status]}{exp.status}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--crm-text-muted)', background: 'rgba(130,145,190,0.10)', padding: '3px 8px', borderRadius: 6 }}>
                        {exp.metric.replace(/_/g, ' ')}
                      </span>
                      {exp.has_enough_data && (
                        <span style={{ fontSize: 11, color: '#28c99a', background: 'rgba(40,201,154,0.10)', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                          ✓ Enough data
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)', marginBottom: 4 }}>{exp.name}</div>
                    {exp.description && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginBottom: 8 }}>{exp.description}</div>}

                    {/* Variant stats */}
                    {exp.variants?.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        {exp.variants.map(v => {
                          const s = exp.stats?.[v.name];
                          const isWinner = exp.winner_variant === v.name;
                          return (
                            <div key={v.name} style={{ padding: '8px 12px', borderRadius: 10, background: isWinner ? 'rgba(40,201,154,0.08)' : 'rgba(130,145,190,0.06)', border: `1px solid ${isWinner ? 'rgba(40,201,154,0.25)' : 'rgba(130,145,190,0.12)'}`, minWidth: 120 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: isWinner ? '#28c99a' : 'var(--crm-text-secondary)', marginBottom: 4 }}>
                                {v.name}{isWinner ? ' 🏆' : ''}
                              </div>
                              {s ? (
                                <div style={{ display: 'flex', gap: 10 }}>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{s.exposures}</div>
                                    <div style={{ fontSize: 9, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>Exposed</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 16, fontWeight: 750, color: '#4f6df5' }}>{s.rate}%</div>
                                    <div style={{ fontSize: 9, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>Rate</div>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>No data yet</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {exp.status === 'running' && !exp.has_enough_data && (
                      <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 8 }}>
                        Need {exp.min_exposures_required ?? 100} exposures per variant for statistical significance
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {exp.status === 'draft' && (
                      <button onClick={() => void transition(exp.id, 'running')} disabled={isBusy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, background: 'rgba(40,201,154,0.10)', border: '1px solid rgba(40,201,154,0.25)', color: '#28c99a', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                        <Play size={11} />Start
                      </button>
                    )}
                    {exp.status === 'running' && (
                      <>
                        <button onClick={() => void transition(exp.id, 'paused')} disabled={isBusy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, background: 'rgba(244,201,93,0.10)', border: '1px solid rgba(244,201,93,0.25)', color: '#f4c95d', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                          <Pause size={11} />Pause
                        </button>
                        <button onClick={() => void transition(exp.id, 'completed')} disabled={isBusy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.25)', color: '#4f6df5', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                          <CheckCircle size={11} />Complete
                        </button>
                      </>
                    )}
                    {exp.status === 'paused' && (
                      <>
                        <button onClick={() => void transition(exp.id, 'running')} disabled={isBusy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, background: 'rgba(40,201,154,0.10)', border: '1px solid rgba(40,201,154,0.25)', color: '#28c99a', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                          <Play size={11} />Resume
                        </button>
                        <button onClick={() => void transition(exp.id, 'completed')} disabled={isBusy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.25)', color: '#4f6df5', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                          <CheckCircle size={11} />Complete
                        </button>
                      </>
                    )}
                    {exp.status === 'draft' && (
                      <button onClick={() => void handleDelete(exp.id)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(244,107,114,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f46b72' }}><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(130,145,190,0.08)', fontSize: 11, color: 'var(--crm-text-muted)' }}>
                  <span>Created {new Date(exp.created_at).toLocaleDateString()}</span>
                  {exp.started_at && <span>Started {new Date(exp.started_at).toLocaleDateString()}</span>}
                  {exp.ended_at && <span>Ended {new Date(exp.ended_at).toLocaleDateString()}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
