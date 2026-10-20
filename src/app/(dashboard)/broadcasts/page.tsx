'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Rss, Plus, Send, Clock, CheckCheck, XCircle, X,
  AlertCircle, Smartphone, AtSign, Mail, MessageSquare,
  Users, RotateCcw, ShieldCheck, AlertTriangle, UserCheck,
  CheckCircle2, RefreshCw, Eye, Search, Filter, ChevronDown,
  Zap, Target, TrendingUp,
} from 'lucide-react';
import {
  getBroadcasts, createBroadcast, getBroadcastRecipientsPreview,
  sendBroadcastAll, retryBroadcastFailed, getBroadcastResults,
  sendBroadcastIndividual, getContacts,
} from '@/lib/api-client';
import type {
  Broadcast, BroadcastRecipientPreview, BroadcastSendSummary, Contact,
} from '@/lib/api-client';

// ── Status config ─────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  sent:      { color: '#059669', bg: 'rgba(5,150,105,0.10)',   label: 'Sent' },
  scheduled: { color: '#2563eb', bg: 'rgba(37,99,235,0.10)',   label: 'Scheduled' },
  draft:     { color: '#6b7280', bg: 'rgba(107,114,128,0.10)', label: 'Draft' },
  failed:    { color: '#dc2626', bg: 'rgba(220,38,38,0.10)',   label: 'Failed' },
  sending:   { color: '#d97706', bg: 'rgba(217,119,6,0.10)',   label: 'Sending' },
};

const PLATFORM_CONFIG: Record<string, { color: string; label: string }> = {
  whatsapp:  { color: '#16a34a', label: 'WhatsApp' },
  instagram: { color: '#db2777', label: 'Instagram' },
  facebook:  { color: '#2563eb', label: 'Facebook' },
  email:     { color: '#7c3aed', label: 'Email' },
};

function PlatformIcon({ platform, size = 14 }: { platform: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    whatsapp:  <Smartphone size={size} />,
    instagram: <AtSign size={size} />,
    facebook:  <MessageSquare size={size} />,
    email:     <Mail size={size} />,
  };
  return <>{icons[platform] ?? <Rss size={size} />}</>;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const icons: Record<string, React.ReactNode> = {
    sent: <CheckCheck size={11} />, scheduled: <Clock size={11} />,
    draft: <Rss size={11} />, failed: <XCircle size={11} />, sending: <Send size={11} />,
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color: cfg.color, background: cfg.bg }}>
      {icons[status]}{cfg.label}
    </span>
  );
}

const inputCss: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid rgba(130,145,190,0.28)', background: 'rgba(255,255,255,0.80)',
  fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none',
};

function KpiCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(130,145,190,0.16)', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 8px rgba(75,85,130,0.06)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--crm-text)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── New Broadcast Modal ───────────────────────────────────────
function NewBroadcastModal({ onClose, onCreated }: { onClose: () => void; onCreated: (b: Broadcast) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('whatsapp');
  const [message, setMessage] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'draft' | 'later'>('draft');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const charLimit = platform === 'whatsapp' ? 4096 : platform === 'instagram' ? 2200 : 63206;
  const pm = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.whatsapp;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Broadcast name is required.'); return; }
    if (!message.trim()) { setError('Message content is required.'); return; }
    if (message.length > charLimit) { setError(`Message exceeds ${charLimit} character limit for ${pm.label}.`); return; }
    if (scheduleMode === 'later' && !scheduleDate) { setError('Schedule date is required.'); return; }
    setSaving(true); setError('');
    try {
      const scheduledAt = scheduleMode === 'later' ? `${scheduleDate}T${scheduleTime}:00` : null;
      const b = await createBroadcast({ name: name.trim(), platform, message: message.trim(), scheduled_at: scheduledAt ?? undefined });
      onCreated(b as Broadcast);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create broadcast.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 520, borderRadius: 18, padding: 26, boxShadow: '0 20px 50px rgba(0,0,0,0.20)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--crm-text)' }}>New Broadcast</div>
            <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>Create a bulk message for your audience</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={16} /></button>
        </div>

        {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626', fontSize: 12, marginBottom: 14 }}><AlertCircle size={13} />{error}</div>}

        <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 5 }}>Broadcast Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Diwali Sale Announcement" style={inputCss} autoFocus />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Channel *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {Object.entries(PLATFORM_CONFIG).map(([key, meta]) => (
                <button key={key} type="button" onClick={() => setPlatform(key)} style={{ padding: '10px 6px', borderRadius: 9, border: `1.5px solid ${platform === key ? meta.color : 'rgba(130,145,190,0.20)'}`, background: platform === key ? `${meta.color}12` : 'rgba(255,255,255,0.55)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ color: meta.color }}><PlatformIcon platform={key} size={16} /></div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: platform === key ? meta.color : 'var(--crm-text-secondary)' }}>{meta.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 5 }}>
              Message *{' '}
              <span style={{ fontWeight: 400, color: message.length > charLimit ? '#dc2626' : 'var(--crm-text-muted)' }}>({message.length}/{charLimit})</span>
            </label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={`Write your ${pm.label} message…`} rows={4} style={{ ...inputCss, resize: 'vertical', borderColor: message.length > charLimit ? '#dc2626' : undefined }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Dispatch Timing</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['draft', 'later'] as const).map(m => (
                <button key={m} type="button" onClick={() => setScheduleMode(m)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: scheduleMode === m ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: scheduleMode === m ? 'white' : 'var(--crm-text-secondary)' }}>
                  {m === 'draft' ? 'Save as Draft' : 'Schedule for Later'}
                </button>
              ))}
            </div>
            {scheduleMode === 'later' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={inputCss} />
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={inputCss} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.28)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving || message.length > charLimit} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              <Rss size={13} />{saving ? 'Saving…' : 'Create Broadcast'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Send All Confirm Modal ────────────────────────────────────
function SendAllConfirmModal({ broadcast, onClose, onComplete }: { broadcast: Broadcast; onClose: () => void; onComplete: (s: BroadcastSendSummary) => void }) {
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [preview, setPreview] = useState<BroadcastRecipientPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [batchSize, setBatchSize] = useState(20);
  const [delayMs, setDelayMs] = useState(50);
  const pm = PLATFORM_CONFIG[broadcast.platform ?? 'whatsapp'] ?? PLATFORM_CONFIG.whatsapp;

  useEffect(() => {
    let active = true;
    getBroadcastRecipientsPreview(broadcast.id)
      .then(data => { if (active) { setPreview(data); setSelectedIds(new Set((data.eligible || []).map(e => e.contact_id))); } })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not fetch recipients.'); })
      .finally(() => { if (active) setLoadingPreview(false); });
    return () => { active = false; };
  }, [broadcast.id]);

  const toggleContact = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleSend = async () => {
    if (selectedIds.size === 0) { setError('Select at least 1 contact.'); return; }
    setSending(true); setError('');
    try {
      const opts: { batch_size: number; delay_ms: number; selected_contact_ids?: string[] } = { batch_size: batchSize, delay_ms: delayMs };
      if (selectedIds.size < (preview?.eligible_count ?? 0)) opts.selected_contact_ids = Array.from(selectedIds);
      const summary = await sendBroadcastAll(broadcast.id, opts);
      onComplete(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.'); setSending(false);
    }
  };

  const filteredEligible = (preview?.eligible ?? []).filter(c => {
    if (!contactSearch.trim()) return true;
    const q = contactSearch.toLowerCase();
    return (c.name ?? '').toLowerCase().includes(q) || (c.destination ?? '').toLowerCase().includes(q);
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,0.50)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 620, borderRadius: 18, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color }}><PlatformIcon platform={broadcast.platform ?? 'whatsapp'} size={16} /></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Send All — {pm.label}</div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>{broadcast.name}</div>
            </div>
          </div>
          {!sending && <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={16} /></button>}
        </div>

        {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626', fontSize: 12, marginBottom: 14 }}><AlertCircle size={13} />{error}</div>}

        {loadingPreview ? (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--crm-text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <RefreshCw size={22} className="animate-spin" style={{ color: pm.color }} />
            <span style={{ fontSize: 13 }}>Analyzing contacts, opt-outs, and destinations…</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Audience summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              <div style={{ padding: '10px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.22)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{preview?.eligible_count ?? 0}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#059669', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><UserCheck size={11} />Eligible</div>
              </div>
              <div style={{ padding: '10px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>{preview?.skipped_opt_out_count ?? 0}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><ShieldCheck size={11} />Opted Out</div>
              </div>
              <div style={{ padding: '10px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.22)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706' }}>{preview?.skipped_no_address_count ?? 0}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#d97706', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><AlertTriangle size={11} />No Address</div>
              </div>
            </div>

            {/* Contact selection */}
            <div style={{ border: '1px solid rgba(130,145,190,0.22)', borderRadius: 10, background: 'rgba(255,255,255,0.55)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={13} style={{ color: pm.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>Recipients</span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(79,109,245,0.10)', color: '#4f6df5', padding: '1px 6px', borderRadius: 5 }}>{selectedIds.size} of {preview?.eligible_count ?? 0}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setSelectedIds(new Set((preview?.eligible ?? []).map(e => e.contact_id)))} style={{ background: 'none', border: 'none', color: '#4f6df5', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Select All</button>
                  <button type="button" onClick={() => setSelectedIds(new Set())} style={{ background: 'none', border: 'none', color: 'var(--crm-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                </div>
              </div>
              <input type="text" placeholder="Search by name or destination…" value={contactSearch} onChange={e => setContactSearch(e.target.value)} style={{ ...inputCss, padding: '7px 10px', fontSize: 12, marginBottom: 8 }} />
              <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid rgba(130,145,190,0.14)', borderRadius: 7, background: 'rgba(255,255,255,0.40)' }}>
                {filteredEligible.length === 0 ? (
                  <div style={{ padding: '14px', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
                    {(preview?.eligible_count ?? 0) === 0 ? 'No eligible contacts for this channel.' : 'No contacts match search.'}
                  </div>
                ) : filteredEligible.map(c => {
                  const isSel = selectedIds.has(c.contact_id);
                  return (
                    <label key={c.contact_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderBottom: '1px solid rgba(130,145,190,0.08)', cursor: 'pointer', background: isSel ? 'rgba(79,109,245,0.05)' : 'transparent' }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleContact(c.contact_id)} style={{ cursor: 'pointer' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>{c.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginLeft: 8, fontFamily: 'monospace' }}>{c.destination}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.10)', padding: '1px 5px', borderRadius: 4 }}>Eligible</span>
                    </label>
                  );
                })}
              </div>
              {((preview?.skipped_opt_out_count ?? 0) + (preview?.skipped_no_address_count ?? 0)) > 0 && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" onClick={() => setShowExcluded(!showExcluded)} style={{ background: 'none', border: 'none', color: 'var(--crm-text-secondary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                    <ChevronDown size={11} style={{ transform: showExcluded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    {showExcluded ? 'Hide' : 'Show'} {(preview?.skipped_opt_out_count ?? 0) + (preview?.skipped_no_address_count ?? 0)} excluded contacts
                  </button>
                  {showExcluded && (
                    <div style={{ marginTop: 6, maxHeight: 100, overflowY: 'auto', border: '1px solid rgba(220,38,38,0.14)', borderRadius: 7, background: 'rgba(255,255,255,0.30)' }}>
                      {(preview?.skipped_opt_out ?? []).map(s => (
                        <div key={s.contact_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', fontSize: 11, borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                          <span style={{ color: 'var(--crm-text)' }}>{s.name}</span>
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>Opted Out</span>
                        </div>
                      ))}
                      {(preview?.skipped_no_address ?? []).map(s => (
                        <div key={s.contact_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', fontSize: 11, borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                          <span style={{ color: 'var(--crm-text)' }}>{s.name}</span>
                          <span style={{ color: '#d97706', fontWeight: 600 }}>{s.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message preview */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Message Preview</label>
              <div style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(130,145,190,0.18)', fontSize: 12, color: 'var(--crm-text)', lineHeight: 1.5, maxHeight: 72, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {broadcast.message ?? '<No message>'}
              </div>
            </div>

            {/* Batch controls */}
            <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(79,109,245,0.05)', border: '1px solid rgba(79,109,245,0.16)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>Batch & Rate Limiting</span>
                <span style={{ fontSize: 11, color: '#4f6df5', fontWeight: 600 }}>Idempotent lock active</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Batch Size</label>
                  <select value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} style={{ ...inputCss, padding: '5px 8px', fontSize: 11, marginTop: 2 }}>
                    <option value={10}>10 contacts / batch</option>
                    <option value={20}>20 contacts / batch (Recommended)</option>
                    <option value={50}>50 contacts / batch</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Delay Between Batches</label>
                  <select value={delayMs} onChange={e => setDelayMs(Number(e.target.value))} style={{ ...inputCss, padding: '5px 8px', fontSize: 11, marginTop: 2 }}>
                    <option value={20}>20 ms (Fast)</option>
                    <option value={50}>50 ms (Safe)</option>
                    <option value={200}>200 ms (Strict)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Compliance notice */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: 'var(--crm-text-muted)', lineHeight: 1.4 }}>
              <ShieldCheck size={13} style={{ color: '#059669', flexShrink: 0, marginTop: 1 }} />
              <span>Contacts with <strong>opt_out = true</strong> are permanently excluded from all bulk transmissions.</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} disabled={sending} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.28)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button type="button" onClick={() => void handleSend()} disabled={sending || selectedIds.size === 0} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 20px', borderRadius: 8, border: 'none', background: selectedIds.size === 0 ? '#9ca3af' : 'linear-gradient(135deg,#059669,#047857)', color: 'white', fontSize: 13, fontWeight: 700, cursor: sending || selectedIds.size === 0 ? 'not-allowed' : 'pointer', boxShadow: selectedIds.size === 0 ? 'none' : '0 4px 12px rgba(5,150,105,0.30)' }}>
                {sending ? <><RefreshCw size={13} className="animate-spin" />Dispatching to {selectedIds.size}…</> : <><Send size={13} />Confirm & Send ({selectedIds.size})</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Broadcast Results Modal ───────────────────────────────────
function BroadcastResultsModal({ broadcastId, initialSummary, onClose, onUpdated }: { broadcastId: string; initialSummary?: BroadcastSendSummary | null; onClose: () => void; onUpdated: () => void }) {
  const [summary, setSummary] = useState<BroadcastSendSummary | null>(initialSummary ?? null);
  const [loading, setLoading] = useState(!initialSummary);
  const [retrying, setRetrying] = useState(false);
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed' | 'skipped'>('all');
  const [statusMsg, setStatusMsg] = useState('');

  const loadResults = useCallback(async () => {
    setLoading(true);
    try { setSummary(await getBroadcastResults(broadcastId)); }
    catch (err) { setStatusMsg(err instanceof Error ? err.message : 'Could not load results.'); }
    finally { setLoading(false); }
  }, [broadcastId]);

  useEffect(() => { if (!initialSummary) void loadResults(); }, [initialSummary, loadResults]);

  const handleRetry = async () => {
    setRetrying(true); setStatusMsg('');
    try {
      const res = await retryBroadcastFailed(broadcastId, { batch_size: 20, delay_ms: 50 });
      setStatusMsg(res.message);
      if (res.summary) setSummary(res.summary); else await loadResults();
      onUpdated();
    } catch (err) { setStatusMsg(err instanceof Error ? err.message : 'Retry failed.'); }
    finally { setRetrying(false); }
  };

  const results = summary?.results ?? [];
  const filtered = results.filter(r => filter === 'all' || r.status === filter);
  const failedCount = summary?.failed_count ?? 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,0.50)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 700, borderRadius: 18, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Broadcast Audit & Results</div>
            <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>
              {summary?.completed_at ? new Date(summary.completed_at).toLocaleString() : 'In progress'} · {summary?.platform}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={16} /></button>
        </div>

        {statusMsg && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(79,109,245,0.08)', border: '1px solid rgba(79,109,245,0.18)', color: '#4f6df5', fontSize: 12, marginBottom: 12 }}>{statusMsg}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Targeted', value: summary?.total_recipients ?? 0, color: 'var(--crm-text)' },
            { label: 'Submitted', value: summary?.sent_count ?? 0, color: '#059669' },
            { label: 'Failed', value: failedCount, color: failedCount > 0 ? '#dc2626' : 'var(--crm-text-muted)' },
            { label: 'Skipped', value: summary?.skipped_count ?? 0, color: '#6b7280' },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px', background: 'rgba(255,255,255,0.60)', borderRadius: 9, textAlign: 'center', border: '1px solid rgba(130,145,190,0.18)' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['all', 'sent', 'failed', 'skipped'] as const).map(tab => (
              <button key={tab} onClick={() => setFilter(tab)} style={{ padding: '5px 11px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: filter === tab ? 'var(--crm-primary)' : 'rgba(255,255,255,0.60)', color: filter === tab ? 'white' : 'var(--crm-text-secondary)', textTransform: 'capitalize' }}>{tab}</button>
            ))}
          </div>
          {failedCount > 0 && (
            <button onClick={() => void handleRetry()} disabled={retrying} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: 'white', fontSize: 12, fontWeight: 700, cursor: retrying ? 'not-allowed' : 'pointer' }}>
              <RotateCcw size={11} className={retrying ? 'animate-spin' : ''} />{retrying ? 'Retrying…' : `Retry Failed (${failedCount})`}
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(130,145,190,0.18)', borderRadius: 10, background: 'rgba(255,255,255,0.40)' }}>
          {loading ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading results…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 13 }}>No recipients matching &quot;{filter}&quot;</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.70)', borderBottom: '1px solid rgba(130,145,190,0.14)', textAlign: 'left', color: 'var(--crm-text-secondary)' }}>
                  <th style={{ padding: '8px 12px' }}>Recipient</th>
                  <th style={{ padding: '8px 12px' }}>Destination</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const isSent = item.status === 'sent';
                  const isFailed = item.status === 'failed';
                  const badgeColor = isSent ? '#059669' : isFailed ? '#dc2626' : '#6b7280';
                  return (
                    <tr key={`${item.contact_id}-${idx}`} style={{ borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--crm-text)' }}>{item.name ?? 'Contact'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--crm-text-secondary)', fontFamily: 'monospace', fontSize: 11 }}>{item.destination ?? '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 700, color: badgeColor, background: `${badgeColor}12` }}>
                          {isSent ? <CheckCircle2 size={10} /> : isFailed ? <XCircle size={10} /> : <ShieldCheck size={10} />}{item.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--crm-text-muted)', fontSize: 11 }}>
                        {item.provider_message_id && <span>ID: {item.provider_message_id}</span>}
                        {item.error && <span style={{ color: '#dc2626' }}>{item.error}</span>}
                        {item.reason && <span>{item.reason}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.70)', color: 'var(--crm-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Send Individual Modal ─────────────────────────────────────
function SendIndividualModal({ broadcast, onClose, onSent }: { broadcast: Broadcast; onClose: () => void; onSent: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [message, setMessage] = useState(broadcast.message ?? '');
  const [subject, setSubject] = useState(broadcast.name ?? '');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const pm = PLATFORM_CONFIG[broadcast.platform ?? 'whatsapp'] ?? PLATFORM_CONFIG.whatsapp;

  useEffect(() => {
    let active = true;
    getContacts({ limit: '100' })
      .then(res => { if (active) setContacts(res.data ?? []); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingContacts(false); });
    return () => { active = false; };
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId) { setFeedback({ type: 'error', text: 'Select a recipient.' }); return; }
    if (!message.trim()) { setFeedback({ type: 'error', text: 'Message cannot be empty.' }); return; }
    setSending(true); setFeedback(null);
    try {
      const res = await sendBroadcastIndividual({ broadcast_id: broadcast.id, contact_id: selectedContactId, platform: broadcast.platform ?? 'whatsapp', message: message.trim(), subject: subject.trim() });
      if (res.success) { setFeedback({ type: 'success', text: `Sent to ${res.destination}. Provider ID: ${res.provider_message_id ?? 'OK'}` }); onSent(); }
      else { setFeedback({ type: 'error', text: res.error ?? 'Send failed.' }); }
    } catch (err) { setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Send failed.' }); }
    finally { setSending(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,0.50)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 500, borderRadius: 18, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color }}><PlatformIcon platform={broadcast.platform ?? 'whatsapp'} size={15} /></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>Send 1-to-1</div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>{pm.label} · {broadcast.name}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)', padding: 4 }}><X size={16} /></button>
        </div>

        {feedback && (
          <div style={{ padding: '9px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14, background: feedback.type === 'success' ? 'rgba(5,150,105,0.10)' : 'rgba(220,38,38,0.08)', border: `1px solid ${feedback.type === 'success' ? 'rgba(5,150,105,0.28)' : 'rgba(220,38,38,0.25)'}`, color: feedback.type === 'success' ? '#059669' : '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
            {feedback.type === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}{feedback.text}
          </div>
        )}

        <form onSubmit={e => void handleSend(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Recipient *</label>
            {loadingContacts ? <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>Loading contacts…</div> : (
              <select value={selectedContactId} onChange={e => setSelectedContactId(e.target.value)} style={inputCss} required>
                <option value="">— Choose a contact —</option>
                {contacts.map(c => {
                  const isOptOut = c.opt_out === true;
                  const isEmail = broadcast.platform === 'email';
                  const noAddr = (broadcast.platform === 'whatsapp' && !c.phone) || (isEmail && !c.email);
                  const disabled = isOptOut || noAddr;
                  const note = isOptOut ? ' [Opted Out]' : noAddr ? ' [No Address]' : '';
                  const dest = isEmail ? (c.email ?? 'No email') : (c.phone ?? 'No phone');
                  return <option key={c.id} value={c.id} disabled={disabled}>{c.name ?? 'Unnamed'} ({dest}){note}</option>;
                })}
              </select>
            )}
          </div>
          {broadcast.platform === 'email' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Subject *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={inputCss} />
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Message *</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} style={{ ...inputCss, resize: 'vertical' }} required />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.28)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={sending || !selectedContactId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: sending || !selectedContactId ? 'not-allowed' : 'pointer', opacity: sending || !selectedContactId ? 0.7 : 1 }}>
              <Send size={13} />{sending ? 'Sending…' : 'Send Message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [sendAllTarget, setSendAllTarget] = useState<Broadcast | null>(null);
  const [individualTarget, setIndividualTarget] = useState<Broadcast | null>(null);
  const [resultsTarget, setResultsTarget] = useState<{ id: string; summary?: BroadcastSendSummary | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await getBroadcasts(); setBroadcasts(res.data as Broadcast[]); }
    catch { /* api-client handles 401 */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = broadcasts.filter(b => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (platformFilter !== 'all' && b.platform !== platformFilter) return false;
    if (search.trim() && !b.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalCount = broadcasts.length;
  const scheduledCount = broadcasts.filter(b => b.status === 'scheduled').length;
  const sentCount = broadcasts.filter(b => b.status === 'sent').length;
  const failedCount = broadcasts.filter(b => b.status === 'failed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showNew && <NewBroadcastModal onClose={() => setShowNew(false)} onCreated={b => { setBroadcasts(prev => [b, ...prev]); setShowNew(false); }} />}
      {sendAllTarget && <SendAllConfirmModal broadcast={sendAllTarget} onClose={() => setSendAllTarget(null)} onComplete={summary => { setSendAllTarget(null); setResultsTarget({ id: summary.broadcast_id, summary }); void load(); }} />}
      {individualTarget && <SendIndividualModal broadcast={individualTarget} onClose={() => setIndividualTarget(null)} onSent={() => void load()} />}
      {resultsTarget && <BroadcastResultsModal broadcastId={resultsTarget.id} initialSummary={resultsTarget.summary} onClose={() => setResultsTarget(null)} onUpdated={() => void load()} />}

      {/* Header */}
      <div className="crm-page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Broadcasts</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>Bulk multi-channel messaging with opt-out compliance, batching, and retry isolation.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.70)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={13} />Refresh
          </button>
          <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,109,245,0.25)' }}>
            <Plus size={13} />New Broadcast
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        <KpiCard label="Total Broadcasts" value={totalCount} icon={<Rss size={16} />} color="#4f6df5" />
        <KpiCard label="Scheduled" value={scheduledCount} icon={<Clock size={16} />} color="#2563eb" />
        <KpiCard label="Sent / Accepted" value={sentCount} icon={<CheckCheck size={16} />} color="#059669" />
        <KpiCard label="Failed" value={failedCount} icon={<XCircle size={16} />} color="#dc2626" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(130,145,190,0.22)', borderRadius: 9, padding: '7px 12px', minWidth: 220, flex: 1, maxWidth: 320 }}>
          <Search size={13} color="var(--crm-text-muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search broadcasts…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={12} color="var(--crm-text-muted)" /></button>}
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.70)', fontSize: 12, color: 'var(--crm-text)', outline: 'none', cursor: 'pointer' }}>
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.70)', fontSize: 12, color: 'var(--crm-text)', outline: 'none', cursor: 'pointer' }}>
          <option value="all">All Channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="email">Email</option>
        </select>
        {(search || statusFilter !== 'all' || platformFilter !== 'all') && (
          <button onClick={() => { setSearch(''); setStatusFilter('all'); setPlatformFilter('all'); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 12, cursor: 'pointer' }}><X size={11} />Clear</button>
        )}
      </div>

      {/* Broadcast list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 110, borderRadius: 12, background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(130,145,190,0.14)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))
        ) : filtered.length === 0 ? (
          <div className="crm-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <Rss size={32} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
              {search || statusFilter !== 'all' || platformFilter !== 'all' ? 'No broadcasts match your filters' : 'No broadcasts yet'}
            </p>
            {!search && statusFilter === 'all' && platformFilter === 'all' && (
              <button onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={13} />Create First Broadcast
              </button>
            )}
          </div>
        ) : filtered.map(b => {
          const pm = PLATFORM_CONFIG[b.platform ?? 'whatsapp'] ?? PLATFORM_CONFIG.whatsapp;
          const deliveryRate = b.total_recipients ? Math.round(((b.delivered_count ?? 0) / b.total_recipients) * 100) : 0;
          const hasFailures = (b.failed_count ?? 0) > 0;
          const isSending = b.status === 'sending';

          return (
            <div key={b.id} className="crm-glass-soft" style={{ padding: '16px 20px', borderRadius: 12 }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color, flexShrink: 0 }}>
                    <PlatformIcon platform={b.platform ?? 'whatsapp'} size={16} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text)' }}>{b.name}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 2 }}>
                      {pm.label} · Created {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {b.scheduled_at && ` · Scheduled: ${new Date(b.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                      {b.sent_at && ` · Sent: ${new Date(b.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" onClick={() => setIndividualTarget(b)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 7, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.70)', color: 'var(--crm-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <Users size={11} />1-to-1
                  </button>
                  <button type="button" onClick={() => setResultsTarget({ id: b.id })} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 7, border: '1px solid rgba(130,145,190,0.22)', background: 'rgba(255,255,255,0.70)', color: 'var(--crm-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <Eye size={11} />Audit
                  </button>
                  {hasFailures && (
                    <button type="button" onClick={() => setResultsTarget({ id: b.id })} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 7, border: 'none', background: 'rgba(220,38,38,0.10)', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <RotateCcw size={11} />Retry ({b.failed_count})
                    </button>
                  )}
                  <button type="button" onClick={() => setSendAllTarget(b)} disabled={isSending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: isSending ? 'rgba(217,119,6,0.20)' : 'linear-gradient(135deg,#059669,#047857)', color: isSending ? '#d97706' : 'white', fontSize: 12, fontWeight: 700, cursor: isSending ? 'not-allowed' : 'pointer', boxShadow: isSending ? 'none' : '0 3px 10px rgba(5,150,105,0.28)' }}>
                    {isSending ? <><RefreshCw size={11} className="animate-spin" />Sending…</> : <><Send size={11} />Send All</>}
                  </button>
                </div>
              </div>

              {/* Message preview */}
              {b.message && (
                <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', padding: '7px 10px', background: 'rgba(255,255,255,0.45)', borderRadius: 7, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.message}
                </div>
              )}

              {/* Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                {[
                  { label: 'Targeted', value: (b.total_recipients ?? 0).toLocaleString(), color: 'var(--crm-text)' },
                  { label: 'Submitted', value: (b.sent_count ?? 0).toLocaleString(), color: '#059669' },
                  { label: 'Failed', value: (b.failed_count ?? 0).toLocaleString(), color: (b.failed_count ?? 0) > 0 ? '#dc2626' : 'var(--crm-text-muted)' },
                  { label: 'Delivered', value: `${deliveryRate}%`, color: 'var(--crm-text)' },
                  { label: 'Read Rate', value: b.delivered_count ? `${Math.round(((b.read_count ?? 0) / b.delivered_count) * 100)}%` : '—', color: 'var(--crm-text)' },
                ].map(stat => (
                  <div key={stat.label} style={{ textAlign: 'center', padding: '7px 5px', background: 'rgba(255,255,255,0.40)', borderRadius: 7 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 1 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
