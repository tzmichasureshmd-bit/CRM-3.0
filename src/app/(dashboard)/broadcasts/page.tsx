'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Rss,
  Plus,
  Send,
  Clock,
  CheckCheck,
  XCircle,
  X,
  AlertCircle,
  Smartphone,
  AtSign,
  Mail,
  MessageSquare,
  Users,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  RefreshCw,
  Eye,
} from 'lucide-react';
import {
  getBroadcasts,
  createBroadcast,
  getBroadcastRecipientsPreview,
  sendBroadcastAll,
  retryBroadcastFailed,
  getBroadcastResults,
  sendBroadcastIndividual,
  getContacts,
} from '@/lib/api-client';
import type {
  Broadcast,
  BroadcastRecipientPreview,
  BroadcastSendSummary,
  Contact,
} from '@/lib/api-client';

const STATUS_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  sent:      { color: '#28c99a', icon: <CheckCheck size={12} />, label: 'Sent' },
  scheduled: { color: '#4d7cff', icon: <Clock size={12} />,     label: 'Scheduled' },
  draft:     { color: '#8790aa', icon: <Rss size={12} />,       label: 'Draft' },
  failed:    { color: '#f46b72', icon: <XCircle size={12} />,   label: 'Failed' },
  sending:   { color: '#f4c95d', icon: <Send size={12} />,      label: 'Sending...' },
};

const PLATFORM_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  whatsapp:  { color: '#25D366', icon: <Smartphone size={14} />, label: 'WhatsApp' },
  instagram: { color: '#E1306C', icon: <AtSign size={14} />,     label: 'Instagram' },
  facebook:  { color: '#1877F2', icon: <MessageSquare size={14} />, label: 'Facebook' },
  email:     { color: '#8b5cf6', icon: <Mail size={14} />,        label: 'Email' },
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)',
  background: 'rgba(255,255,255,0.80)',
  fontSize: 13,
  color: 'var(--crm-text)',
  boxSizing: 'border-box',
  outline: 'none',
};

// ── New Broadcast Modal ───────────────────────────────────────
function NewBroadcastModal({
  onClose,
  onCreated,
}: {
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
      const b = await createBroadcast({
        name: name.trim(),
        platform,
        message: message.trim(),
        scheduled_at: scheduledAt ?? undefined,
      });
      onCreated(b as Broadcast);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create broadcast');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 540, borderRadius: 18, padding: 26, boxShadow: '0 20px 50px rgba(0,0,0,0.20)', maxHeight: '90vh', overflowY: 'auto' }}>
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Channel Platform *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {Object.entries(PLATFORM_META).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPlatform(key)}
                  style={{
                    padding: '10px 6px',
                    borderRadius: 10,
                    border: `1.5px solid ${platform === key ? meta.color : 'rgba(130,145,190,0.20)'}`,
                    background: platform === key ? `${meta.color}15` : 'rgba(255,255,255,0.55)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <div style={{ color: meta.color }}>{meta.icon}</div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: platform === key ? meta.color : 'var(--crm-text-secondary)' }}>{meta.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>
              Message Content * <span style={{ fontWeight: 400, color: message.length > charLimit ? '#f46b72' : 'var(--crm-text-muted)' }}>({message.length}/{charLimit})</span>
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={`Write your ${PLATFORM_META[platform]?.label ?? 'broadcast'} message here...`}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', borderColor: message.length > charLimit ? '#f46b72' : undefined }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Dispatch Timing</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['now', 'later'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setScheduleMode(m)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    background: scheduleMode === m ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)',
                    color: scheduleMode === m ? 'white' : 'var(--crm-text-secondary)',
                  }}
                >
                  {m === 'now' ? '📤 Save as Draft (Ready to Send)' : '⏰ Schedule for Later'}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 18px',
                borderRadius: 10,
                border: '1px solid rgba(130,145,190,0.25)',
                background: 'rgba(255,255,255,0.60)',
                color: 'var(--crm-text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || message.length > charLimit}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 22px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              <Rss size={14} />{saving ? 'Saving...' : 'Create Broadcast'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Send All Confirmation Modal with Contact Selection ──────────
function SendAllConfirmModal({
  broadcast,
  onClose,
  onComplete,
}: {
  broadcast: Broadcast;
  onClose: () => void;
  onComplete: (summary: BroadcastSendSummary) => void;
}) {
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [preview, setPreview] = useState<BroadcastRecipientPreview | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<'all' | 'custom'>('all');
  const [contactSearch, setContactSearch] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [batchSize, setBatchSize] = useState(20);
  const [delayMs, setDelayMs] = useState(50);

  const pm = PLATFORM_META[broadcast.platform ?? 'whatsapp'] ?? PLATFORM_META.whatsapp;

  useEffect(() => {
    let active = true;
    const fetchPreview = async () => {
      try {
        setLoadingPreview(true);
        const data = await getBroadcastRecipientsPreview(broadcast.id);
        if (active) {
          setPreview(data);
          // Default: Select all eligible recipients
          const eligibleIds = new Set((data.eligible || []).map(e => e.contact_id));
          setSelectedContactIds(eligibleIds);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not fetch recipients preview');
      } finally {
        if (active) setLoadingPreview(false);
      }
    };
    void fetchPreview();
    return () => { active = false; };
  }, [broadcast.id]);

  const toggleContact = (contactId: string) => {
    setSelectionMode('custom');
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const selectAllEligible = () => {
    if (!preview) return;
    setSelectedContactIds(new Set(preview.eligible.map(e => e.contact_id)));
  };

  const deselectAll = () => {
    setSelectionMode('custom');
    setSelectedContactIds(new Set());
  };

  const handleSendAll = async () => {
    if (selectedContactIds.size === 0) {
      setError('Please select at least 1 contact to send to');
      return;
    }
    setSending(true);
    setError('');
    try {
      const payloadOptions: { batch_size: number; delay_ms: number; selected_contact_ids?: string[] } = {
        batch_size: batchSize,
        delay_ms: delayMs,
      };
      // If user customized selection or deselected some, pass explicit contact IDs
      if (selectionMode === 'custom' || selectedContactIds.size < (preview?.eligible_count ?? 0)) {
        payloadOptions.selected_contact_ids = Array.from(selectedContactIds);
      }

      const summary = await sendBroadcastAll(broadcast.id, payloadOptions);
      onComplete(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send All execution failed');
      setSending(false);
    }
  };

  const filteredEligible = (preview?.eligible || []).filter(c => {
    if (!contactSearch.trim()) return true;
    const q = contactSearch.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.destination || '').toLowerCase().includes(q);
  });

  const selectedCount = selectedContactIds.size;
  const totalEligible = preview?.eligible_count ?? 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 640, borderRadius: 20, padding: 26, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${pm.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color }}>
              {pm.icon}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>Send All — {pm.label}</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--crm-text-muted)' }}>{broadcast.name}</p>
            </div>
          </div>
          {!sending && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
          )}
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(244,107,114,0.12)', border: '1px solid rgba(244,107,114,0.3)', color: '#f46b72', fontSize: 12, marginBottom: 16 }}>
            <AlertCircle size={14} />{error}
          </div>
        )}

        {loadingPreview ? (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--crm-text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <RefreshCw size={24} className="spin" style={{ color: pm.color }} />
            <span style={{ fontSize: 13 }}>Analyzing tenant contacts, opt-outs, and destination syntax...</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Recipient Audience Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div style={{ padding: '10px', background: 'rgba(40,201,154,0.10)', border: '1px solid rgba(40,201,154,0.25)', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#28c99a' }}>{preview?.eligible_count ?? 0}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#28c99a', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <UserCheck size={12} /> Eligible to Send
                </div>
              </div>
              <div style={{ padding: '10px', background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#f46b72' }}>{preview?.skipped_opt_out_count ?? 0}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#f46b72', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <ShieldCheck size={12} /> Opt-Out Skipped
                </div>
              </div>
              <div style={{ padding: '10px', background: 'rgba(244,201,93,0.10)', border: '1px solid rgba(244,201,93,0.25)', borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#d99815' }}>{preview?.skipped_no_address_count ?? 0}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#d99815', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <AlertTriangle size={12} /> Missing / Invalid
                </div>
              </div>
            </div>

            {/* CONTACTS SELECTION OPTION */}
            <div style={{ border: '1px solid rgba(130,145,190,0.25)', borderRadius: 12, background: 'rgba(255,255,255,0.60)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={14} style={{ color: pm.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>Recipient Contacts Selection</span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(79,109,245,0.12)', color: '#4f6df5', padding: '1px 7px', borderRadius: 6 }}>
                    {selectedCount} of {totalEligible} selected
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={selectAllEligible}
                    style={{ background: 'none', border: 'none', color: '#4f6df5', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '2px 4px' }}
                  >
                    Select All
                  </button>
                  <span style={{ color: 'var(--crm-text-muted)', fontSize: 11 }}>·</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    style={{ background: 'none', border: 'none', color: 'var(--crm-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '2px 4px' }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Search contacts filter */}
              <input
                type="text"
                placeholder="Search recipient by name or destination address..."
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                style={{ ...inputStyle, padding: '7px 10px', fontSize: 12, marginBottom: 8, background: 'rgba(255,255,255,0.90)' }}
              />

              {/* Scrollable list of selectable contacts */}
              <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid rgba(130,145,190,0.15)', borderRadius: 8, background: 'rgba(255,255,255,0.45)' }}>
                {filteredEligible.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 12 }}>
                    {totalEligible === 0 ? 'No contacts configured with valid addresses for this channel.' : 'No contacts matching search filter.'}
                  </div>
                ) : (
                  filteredEligible.map(c => {
                    const isSelected = selectedContactIds.has(c.contact_id);
                    return (
                      <label
                        key={c.contact_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '7px 10px',
                          borderBottom: '1px solid rgba(130,145,190,0.10)',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(79,109,245,0.06)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleContact(c.contact_id)}
                          style={{ cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>{c.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginLeft: 8, fontFamily: 'monospace' }}>
                            {c.destination}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#28c99a', background: 'rgba(40,201,154,0.12)', padding: '1px 6px', borderRadius: 4 }}>
                          Eligible
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Excluded contacts review toggle */}
              {((preview?.skipped_opt_out_count ?? 0) > 0 || (preview?.skipped_no_address_count ?? 0) > 0) && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowExcluded(!showExcluded)}
                    style={{ background: 'none', border: 'none', color: 'var(--crm-text-secondary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
                  >
                    <span>{showExcluded ? '▼ Hide' : '▶ Show'} {(preview?.skipped_opt_out_count ?? 0) + (preview?.skipped_no_address_count ?? 0)} Excluded Contacts (Opt-Out / Invalid)</span>
                  </button>

                  {showExcluded && (
                    <div style={{ marginTop: 6, maxHeight: 110, overflowY: 'auto', border: '1px solid rgba(244,107,114,0.15)', borderRadius: 8, background: 'rgba(255,255,255,0.30)', padding: 4 }}>
                      {(preview?.skipped_opt_out || []).map(s => (
                        <div key={s.contact_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', fontSize: 11, borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                          <span style={{ color: 'var(--crm-text)' }}>{s.name}</span>
                          <span style={{ color: '#f46b72', fontWeight: 600 }}>Opted Out</span>
                        </div>
                      ))}
                      {(preview?.skipped_no_address || []).map(s => (
                        <div key={s.contact_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', fontSize: 11, borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                          <span style={{ color: 'var(--crm-text)' }}>{s.name}</span>
                          <span style={{ color: '#d99815', fontWeight: 600 }}>{s.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message Preview */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Message Preview</label>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,145,190,0.20)', fontSize: 12, color: 'var(--crm-text)', lineHeight: 1.5, maxHeight: 80, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {broadcast.message || '<No message configured>'}
              </div>
            </div>

            {/* Batch & Rate Limiting Controls */}
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.18)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>Batch Processing & Rate Limiting</span>
                <span style={{ fontSize: 11, color: '#4f6df5', fontWeight: 600 }}>Idempotent Lock Active</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Batch Size (Contacts / Chunk)</label>
                  <select value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} style={{ ...inputStyle, padding: '5px 8px', fontSize: 11, marginTop: 2 }}>
                    <option value={10}>10 contacts / batch</option>
                    <option value={20}>20 contacts / batch (Recommended)</option>
                    <option value={50}>50 contacts / batch</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Delay Between Batches</label>
                  <select value={delayMs} onChange={e => setDelayMs(Number(e.target.value))} style={{ ...inputStyle, padding: '5px 8px', fontSize: 11, marginTop: 2 }}>
                    <option value={20}>20 ms (Fast)</option>
                    <option value={50}>50 ms (Safe Rate Limit)</option>
                    <option value={200}>200 ms (Strict Compliance)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Safeguard Notice */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: 'var(--crm-text-muted)', lineHeight: 1.4 }}>
              <ShieldCheck size={14} style={{ color: '#28c99a', flexShrink: 0, marginTop: 1 }} />
              <span>
                Compliance Guarantee: Contacts with <strong>opt_out = true</strong> are permanently excluded from bulk transmissions.
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                style={{
                  padding: '8px 18px',
                  borderRadius: 10,
                  border: '1px solid rgba(130,145,190,0.25)',
                  background: 'rgba(255,255,255,0.60)',
                  color: 'var(--crm-text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: sending ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSendAll()}
                disabled={sending || selectedCount === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 22px',
                  borderRadius: 10,
                  border: 'none',
                  background: selectedCount === 0 ? '#8790aa' : 'linear-gradient(135deg,#28c99a,#00a86b)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: sending || selectedCount === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: selectedCount === 0 ? 'none' : '0 4px 14px rgba(40,201,154,0.35)',
                }}
              >
                {sending ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    Dispatching to {selectedCount} contacts...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Confirm & Send ({selectedCount})
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Results & Audit Modal ─────────────────────────────────────
function BroadcastResultsModal({
  broadcastId,
  initialSummary,
  onClose,
  onUpdated,
}: {
  broadcastId: string;
  initialSummary?: BroadcastSendSummary | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [summary, setSummary] = useState<BroadcastSendSummary | null>(initialSummary ?? null);
  const [loading, setLoading] = useState(!initialSummary);
  const [retrying, setRetrying] = useState(false);
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed' | 'skipped'>('all');
  const [statusMsg, setStatusMsg] = useState('');

  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getBroadcastResults(broadcastId);
      setSummary(data);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not load results');
    } finally {
      setLoading(false);
    }
  }, [broadcastId]);

  useEffect(() => {
    if (!initialSummary) {
      void loadResults();
    }
  }, [initialSummary, loadResults]);

  const handleRetryFailed = async () => {
    setRetrying(true);
    setStatusMsg('');
    try {
      const res = await retryBroadcastFailed(broadcastId, { batch_size: 20, delay_ms: 50 });
      setStatusMsg(res.message);
      if (res.summary) {
        setSummary(res.summary);
      } else {
        await loadResults();
      }
      onUpdated();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  const results = summary?.results ?? [];
  const filteredResults = results.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const failedCount = summary?.failed_count ?? 0;
  const sentCount = summary?.sent_count ?? 0;
  const skippedCount = summary?.skipped_count ?? 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 720, borderRadius: 20, padding: 26, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>Broadcast Audit & Delivery Results</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--crm-text-muted)' }}>
              Completed: {summary?.completed_at ? new Date(summary.completed_at).toLocaleString() : 'Just now'} · Platform: {summary?.platform}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
        </div>

        {statusMsg && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(79,109,245,0.08)', border: '1px solid rgba(79,109,245,0.20)', color: '#4f6df5', fontSize: 12, marginBottom: 12 }}>
            {statusMsg}
          </div>
        )}

        {/* Aggregate Metrics Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: '10px', background: 'rgba(255,255,255,0.60)', borderRadius: 10, textAlign: 'center', border: '1px solid rgba(130,145,190,0.20)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--crm-text)' }}>{summary?.total_recipients ?? 0}</div>
            <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>Total Targeted</div>
          </div>
          <div style={{ padding: '10px', background: 'rgba(40,201,154,0.10)', borderRadius: 10, textAlign: 'center', border: '1px solid rgba(40,201,154,0.25)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#28c99a' }}>{sentCount}</div>
            <div style={{ fontSize: 10, color: '#28c99a', marginTop: 2 }}>Sent Successfully</div>
          </div>
          <div style={{ padding: '10px', background: 'rgba(244,107,114,0.10)', borderRadius: 10, textAlign: 'center', border: '1px solid rgba(244,107,114,0.25)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f46b72' }}>{failedCount}</div>
            <div style={{ fontSize: 10, color: '#f46b72', marginTop: 2 }}>Failed</div>
          </div>
          <div style={{ padding: '10px', background: 'rgba(135,144,170,0.10)', borderRadius: 10, textAlign: 'center', border: '1px solid rgba(135,144,170,0.25)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#8790aa' }}>{skippedCount}</div>
            <div style={{ fontSize: 10, color: '#8790aa', marginTop: 2 }}>Skipped (Opt-out/Syntax)</div>
          </div>
        </div>

        {/* Filter Toolbar & Retry Button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'sent', 'failed', 'skipped'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filter === tab ? 'var(--crm-primary, #4f6df5)' : 'rgba(255,255,255,0.60)',
                  color: filter === tab ? 'white' : 'var(--crm-text-secondary)',
                  textTransform: 'capitalize',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {failedCount > 0 && (
            <button
              onClick={() => void handleRetryFailed()}
              disabled={retrying}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #f46b72, #e63946)',
                color: 'white',
                fontSize: 12,
                fontWeight: 700,
                cursor: retrying ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(244,107,114,0.30)',
              }}
            >
              <RotateCcw size={12} className={retrying ? 'spin' : ''} />
              {retrying ? 'Retrying Failed...' : `Retry Failed Only (${failedCount})`}
            </button>
          )}
        </div>

        {/* Detailed Recipient Table */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 12, background: 'rgba(255,255,255,0.40)' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading recipient breakdown...</div>
          ) : filteredResults.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--crm-text-muted)', fontSize: 13 }}>
              No recipients matching filter &quot;{filter}&quot;
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.70)', borderBottom: '1px solid rgba(130,145,190,0.15)', textAlign: 'left', color: 'var(--crm-text-secondary)' }}>
                  <th style={{ padding: '8px 12px' }}>Recipient</th>
                  <th style={{ padding: '8px 12px' }}>Destination</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>Details / Provider Info</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((item, idx) => {
                  const isSent = item.status === 'sent';
                  const isFailed = item.status === 'failed';
                  const badgeColor = isSent ? '#28c99a' : isFailed ? '#f46b72' : '#8790aa';
                  return (
                    <tr key={`${item.contact_id}-${idx}`} style={{ borderBottom: '1px solid rgba(130,145,190,0.10)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--crm-text)' }}>{item.name || 'Contact'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--crm-text-secondary)', fontFamily: 'monospace' }}>{item.destination || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: badgeColor, background: `${badgeColor}15` }}>
                          {isSent ? <CheckCircle2 size={11} /> : isFailed ? <XCircle size={11} /> : <ShieldCheck size={11} />}
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--crm-text-muted)', fontSize: 11 }}>
                        {item.provider_message_id && `ID: ${item.provider_message_id}`}
                        {item.error && <span style={{ color: '#f46b72' }}>{item.error}</span>}
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
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: 10,
              border: '1px solid rgba(130,145,190,0.25)',
              background: 'rgba(255,255,255,0.70)',
              color: 'var(--crm-text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Send 1-to-1 Individual Modal ──────────────────────────────
function SendIndividualModal({
  broadcast,
  onClose,
  onSent,
}: {
  broadcast: Broadcast;
  onClose: () => void;
  onSent: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [message, setMessage] = useState(broadcast.message || '');
  const [subject, setSubject] = useState(broadcast.name || '');
  const [sending, setSending] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const pm = PLATFORM_META[broadcast.platform ?? 'whatsapp'] ?? PLATFORM_META.whatsapp;

  useEffect(() => {
    let active = true;
    const fetchContacts = async () => {
      try {
        setLoadingContacts(true);
        const res = await getContacts({ limit: '100' });
        if (active) setContacts(res.data || []);
      } catch {
        // Ignore fallback
      } finally {
        if (active) setLoadingContacts(false);
      }
    };
    void fetchContacts();
    return () => { active = false; };
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId) {
      setStatusFeedback({ type: 'error', text: 'Please select a recipient contact' });
      return;
    }
    if (!message.trim()) {
      setStatusFeedback({ type: 'error', text: 'Message cannot be empty' });
      return;
    }

    setSending(true);
    setStatusFeedback(null);
    try {
      const res = await sendBroadcastIndividual({
        broadcast_id: broadcast.id,
        contact_id: selectedContactId,
        platform: broadcast.platform || 'whatsapp',
        message: message.trim(),
        subject: subject.trim(),
      });

      if (res.success) {
        setStatusFeedback({
          type: 'success',
          text: `Message successfully dispatched to ${res.destination}! Provider ID: ${res.provider_message_id || 'OK'}`,
        });
        onSent();
      } else {
        setStatusFeedback({
          type: 'error',
          text: res.error || 'Failed to dispatch message',
        });
      }
    } catch (err) {
      setStatusFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Individual message failed',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 520, borderRadius: 20, padding: 26, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${pm.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pm.color }}>
              {pm.icon}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>Send 1-to-1 Message</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--crm-text-muted)' }}>Channel: {pm.label} · Broadcast: {broadcast.name}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
        </div>

        {statusFeedback && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 12,
              marginBottom: 14,
              background: statusFeedback.type === 'success' ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.12)',
              border: `1px solid ${statusFeedback.type === 'success' ? 'rgba(40,201,154,0.30)' : 'rgba(244,107,114,0.30)'}`,
              color: statusFeedback.type === 'success' ? '#28c99a' : '#f46b72',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {statusFeedback.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {statusFeedback.text}
          </div>
        )}

        <form onSubmit={e => void handleSend(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Select Recipient Contact *</label>
            {loadingContacts ? (
              <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>Loading contacts...</div>
            ) : (
              <select
                value={selectedContactId}
                onChange={e => setSelectedContactId(e.target.value)}
                style={inputStyle}
                required
              >
                <option value="">-- Choose a contact --</option>
                {contacts.map(c => {
                  const isOptOut = c.opt_out === true;
                  const isWhatsApp = (broadcast.platform || 'whatsapp') === 'whatsapp';
                  const isEmail = broadcast.platform === 'email';
                  const noAddress = (isWhatsApp && !c.phone) || (isEmail && !c.email);
                  const disabled = isOptOut || noAddress;
                  const note = isOptOut ? ' [Opted Out]' : noAddress ? ' [No Address]' : '';
                  const dest = isEmail ? (c.email || 'No email') : (c.phone || 'No phone');
                  return (
                    <option key={c.id} value={c.id} disabled={disabled}>
                      {c.name || 'Unnamed'} ({dest}){note}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {broadcast.platform === 'email' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Email Subject *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Message *</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 18px',
                borderRadius: 10,
                border: '1px solid rgba(130,145,190,0.25)',
                background: 'rgba(255,255,255,0.60)',
                color: 'var(--crm-text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !selectedContactId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 22px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
                cursor: sending || !selectedContactId ? 'not-allowed' : 'pointer',
                opacity: sending || !selectedContactId ? 0.7 : 1,
              }}
            >
              <Send size={13} />{sending ? 'Sending...' : 'Send Message'}
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

  // Modal States
  const [sendAllTarget, setSendAllTarget] = useState<Broadcast | null>(null);
  const [individualTarget, setIndividualTarget] = useState<Broadcast | null>(null);
  const [resultsTarget, setResultsTarget] = useState<{ id: string; summary?: BroadcastSendSummary | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBroadcasts();
      setBroadcasts(res.data as Broadcast[]);
    } catch {
      /* api-client handles 401 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreated = (b: Broadcast) => {
    setBroadcasts(prev => [b, ...prev]);
    setShowNew(false);
  };

  const handleSendAllComplete = (summary: BroadcastSendSummary) => {
    setSendAllTarget(null);
    setResultsTarget({ id: summary.broadcast_id, summary });
    void load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showNew && <NewBroadcastModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}

      {sendAllTarget && (
        <SendAllConfirmModal
          broadcast={sendAllTarget}
          onClose={() => setSendAllTarget(null)}
          onComplete={handleSendAllComplete}
        />
      )}

      {individualTarget && (
        <SendIndividualModal
          broadcast={individualTarget}
          onClose={() => setIndividualTarget(null)}
          onSent={() => void load()}
        />
      )}

      {resultsTarget && (
        <BroadcastResultsModal
          broadcastId={resultsTarget.id}
          initialSummary={resultsTarget.summary}
          onClose={() => setResultsTarget(null)}
          onUpdated={() => void load()}
        />
      )}

      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Broadcasts</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
            Bulk multi-channel messaging with &quot;Send All&quot;, opt-out compliance, and retry isolation
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
            border: 'none',
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(79,109,245,0.25)',
          }}
        >
          <Plus size={14} /> New Broadcast
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            Loading broadcasts...
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="crm-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <Rss size={36} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>No broadcasts yet</p>
            <button
              onClick={() => setShowNew(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
                border: 'none',
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={13} /> Create First Broadcast
            </button>
          </div>
        ) : (
          broadcasts.map(b => {
            const sm = STATUS_META[b.status] ?? STATUS_META.draft;
            const pm = PLATFORM_META[b.platform ?? 'whatsapp'] ?? PLATFORM_META.whatsapp;
            const deliveryRate = b.total_recipients ? Math.round(((b.delivered_count ?? 0) / b.total_recipients) * 100) : 0;
            const readRate = b.delivered_count ? Math.round(((b.read_count ?? 0) / b.delivered_count) * 100) : 0;
            const hasFailures = (b.failed_count ?? 0) > 0;
            const isSending = b.status === 'sending';

            return (
              <div key={b.id} className="crm-glass-soft" style={{ padding: '18px 22px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        background: `${pm.color}18`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: pm.color,
                        flexShrink: 0,
                      }}
                    >
                      {pm.icon}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--crm-text)' }}>{b.name}</span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            color: sm.color,
                            background: `${sm.color}15`,
                            borderRadius: 6,
                            padding: '2px 8px',
                          }}
                        >
                          {sm.icon}
                          {sm.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>
                        {pm.label} · Created {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {b.scheduled_at && ` · Scheduled: ${new Date(b.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                        {b.sent_at && ` · Dispatched: ${new Date(b.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    </div>
                  </div>

                  {/* Actions Toolbar on the right */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Individual send button */}
                    <button
                      type="button"
                      onClick={() => setIndividualTarget(b)}
                      title="Send 1-to-1 message"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(130,145,190,0.25)',
                        background: 'rgba(255,255,255,0.70)',
                        color: 'var(--crm-text-secondary)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Users size={12} /> Send 1-to-1
                    </button>

                    {/* View Results / Audit button */}
                    <button
                      type="button"
                      onClick={() => setResultsTarget({ id: b.id })}
                      title="View audit breakdown and per-recipient status"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(130,145,190,0.25)',
                        background: 'rgba(255,255,255,0.70)',
                        color: 'var(--crm-text-secondary)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Eye size={12} /> Audit Log
                    </button>

                    {/* Retry Failed button (if failed_count > 0) */}
                    {hasFailures && (
                      <button
                        type="button"
                        onClick={() => setResultsTarget({ id: b.id })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 14px',
                          borderRadius: 8,
                          border: 'none',
                          background: 'rgba(244,107,114,0.15)',
                          color: '#f46b72',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <RotateCcw size={12} /> Retry ({b.failed_count})
                      </button>
                    )}

                    {/* PRIMARY SEND ALL BUTTON */}
                    <button
                      type="button"
                      onClick={() => setSendAllTarget(b)}
                      disabled={isSending}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 16px',
                        borderRadius: 9,
                        border: 'none',
                        background: isSending
                          ? 'rgba(244,201,93,0.30)'
                          : 'linear-gradient(135deg, #28c99a, #00a86b)',
                        color: isSending ? '#d99815' : 'white',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: isSending ? 'not-allowed' : 'pointer',
                        boxShadow: isSending ? 'none' : '0 3px 10px rgba(40,201,154,0.30)',
                      }}
                    >
                      {isSending ? (
                        <>
                          <RefreshCw size={12} className="spin" /> Sending...
                        </>
                      ) : (
                        <>
                          <Send size={12} /> Send All
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Message preview */}
                {b.message && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--crm-text-secondary)',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.45)',
                      borderRadius: 8,
                      marginBottom: 12,
                      lineHeight: 1.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.message}
                  </div>
                )}

                {/* Metrics row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {[
                    { label: 'Total Targeted', value: (b.total_recipients ?? 0).toLocaleString(), color: 'var(--crm-text)' },
                    { label: 'Sent', value: (b.sent_count ?? 0).toLocaleString(), color: '#28c99a' },
                    { label: 'Failed', value: (b.failed_count ?? 0).toLocaleString(), color: (b.failed_count ?? 0) > 0 ? '#f46b72' : 'var(--crm-text-muted)' },
                    { label: 'Delivered', value: `${deliveryRate}%`, color: 'var(--crm-text)' },
                    { label: 'Read Rate', value: `${readRate}%`, color: 'var(--crm-text)' },
                  ].map(stat => (
                    <div key={stat.label} style={{ textAlign: 'center', padding: '8px 6px', background: 'rgba(255,255,255,0.40)', borderRadius: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 750, color: stat.color }}>{stat.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--crm-text-muted)', marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
