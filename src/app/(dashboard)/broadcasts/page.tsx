'use client';

import { useState, useEffect, useCallback } from 'react';
import { Rss, Plus, Send, Clock, CheckCheck, XCircle, X, AlertCircle, Smartphone, AtSign, Mail, MessageSquare } from 'lucide-react';
import { getBroadcasts, createBroadcast } from '@/lib/api-client';
import type { Broadcast } from '@/lib/api-client';

// local interface removed — using Broadcast from api-client

const STATUS_META: Record<string, { color: string; icon: React.ReactNode }> = {
  sent:      { color: '#28c99a', icon: <CheckCheck size={12} /> },
  scheduled: { color: '#4d7cff', icon: <Clock size={12} /> },
  draft:     { color: '#8790aa', icon: <Rss size={12} /> },
  failed:    { color: '#f46b72', icon: <XCircle size={12} /> },
  sending:   { color: '#f4c95d', icon: <Send size={12} /> },
};

const PLATFORM_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  whatsapp:  { color: '#25D366', icon: <Smartphone size={14} />, label: 'WhatsApp' },
  instagram: { color: '#E1306C', icon: <AtSign size={14} />,     label: 'Instagram' },
  facebook:  { color: '#1877F2', icon: <MessageSquare size={14} />, label: 'Facebook' },
  email:     { color: '#8b5cf6', icon: <Mail size={14} />,        label: 'Email' },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)',
  fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none',
};

// ── New Broadcast Modal ───────────────────────────────────────
function NewBroadcastModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (b: Broadcast) => void;
}) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('whatsapp');
  const [message, setMessage] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const charLimit = platform === 'whatsapp' ? 4096 : platform === 'instagram' ? 2200 : 63206;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Broadcast name is required'); return; }
    if (!message.trim()) { setError('Message is required'); return; }
    if (scheduleMode === 'later' && !scheduleDate) { setError('Schedule date is required'); return; }
    setSaving(true);
    setError('');
    try {
      const scheduledAt = scheduleMode === 'later' ? `${scheduleDate}T${scheduleTime}:00` : null;
      const b = await createBroadcast({ name: name.trim(), platform, message: message.trim(), scheduled_at: scheduledAt ?? undefined });
      onCreated(b as Broadcast);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create broadcast');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 520, borderRadius: 18, padding: 26, boxShadow: '0 20px 50px rgba(0,0,0,0.20)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>New Broadcast</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={13} />{error}
          </div>
        )}

        <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Broadcast Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Diwali Sale Announcement" style={inputStyle} autoFocus />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Platform *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {Object.entries(PLATFORM_META).map(([key, meta]) => (
                <button key={key} type="button" onClick={() => setPlatform(key)} style={{ padding: '10px 6px', borderRadius: 10, border: `1.5px solid ${platform === key ? meta.color : 'rgba(130,145,190,0.20)'}`, background: platform === key ? `${meta.color}12` : 'rgba(255,255,255,0.55)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ color: meta.color }}>{meta.icon}</div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: platform === key ? meta.color : 'var(--crm-text-secondary)' }}>{meta.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
              Message * <span style={{ fontWeight: 400, color: message.length > charLimit ? '#f46b72' : 'var(--crm-text-muted)' }}>({message.length}/{charLimit})</span>
            </label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={`Write your ${PLATFORM_META[platform]?.label ?? 'broadcast'} message here...`} rows={5} style={{ ...inputStyle, resize: 'vertical', borderColor: message.length > charLimit ? '#f46b72' : undefined }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Send Time</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['now', 'later'] as const).map(m => (
                <button key={m} type="button" onClick={() => setScheduleMode(m)} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: scheduleMode === m ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: scheduleMode === m ? 'white' : 'var(--crm-text-secondary)' }}>
                  {m === 'now' ? '📤 Send as Draft' : '⏰ Schedule'}
                </button>
              ))}
            </div>
            {scheduleMode === 'later' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={inputStyle} />
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={inputStyle} />
              </div>
            )}
          </div>

          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)', fontSize: 12, color: 'var(--crm-text-secondary)' }}>
            💡 Broadcasts are saved as <strong>draft</strong> or <strong>scheduled</strong>. Actual sending requires channel credentials configured in Settings → Integrations.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || message.length > charLimit} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              <Rss size={14} />{saving ? 'Creating...' : scheduleMode === 'later' ? 'Schedule Broadcast' : 'Save Broadcast'}
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
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBroadcasts();
      setBroadcasts(res.data as Broadcast[]);
    } catch { /* api-client handles 401 */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreated = (b: Broadcast) => {
    setBroadcasts(prev => [b, ...prev]);
    setShowNew(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showNew && <NewBroadcastModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}

      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Broadcasts</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>Send bulk messages across all channels</p>
        </div>
        <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> New Broadcast
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading broadcasts...</div>
        ) : broadcasts.length === 0 ? (
          <div className="crm-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <Rss size={36} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>No broadcasts yet</p>
            <button onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> Create First Broadcast
            </button>
          </div>
        ) : broadcasts.map(b => {
          const sm = STATUS_META[b.status] ?? STATUS_META.draft;
          const pm = PLATFORM_META[b.platform ?? 'whatsapp'] ?? PLATFORM_META.whatsapp;
          const deliveryRate = b.total_recipients ? Math.round(((b.delivered_count ?? 0) / b.total_recipients) * 100) : 0;
          const readRate = b.delivered_count ? Math.round(((b.read_count ?? 0) / b.delivered_count) * 100) : 0;
          return (
            <div key={b.id} className="crm-glass-soft" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: b.message ? 10 : 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color, flexShrink: 0 }}>
                  {pm.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)' }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
                    {pm.label} · {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {b.scheduled_at && ` · Scheduled: ${new Date(b.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: sm.color, background: `${sm.color}15`, borderRadius: 8, padding: '3px 8px' }}>
                  {sm.icon}{b.status}
                </span>
              </div>
              {b.message && (
                <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', padding: '8px 12px', background: 'rgba(255,255,255,0.40)', borderRadius: 8, marginBottom: 12, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.message}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                  { label: 'Recipients', value: (b.total_recipients ?? 0).toLocaleString() },
                  { label: 'Sent', value: (b.sent_count ?? 0).toLocaleString() },
                  { label: 'Delivered', value: `${deliveryRate}%` },
                  { label: 'Read Rate', value: `${readRate}%` },
                ].map(stat => (
                  <div key={stat.label} style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.40)', borderRadius: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{stat.label}</div>
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
