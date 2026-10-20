'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Clock, CheckCircle, AlertCircle, Plus, RefreshCw, X, Search } from 'lucide-react';
import { getFollowUps, createFollowUp, updateFollowUp } from '@/lib/api-client';
import type { FollowUp } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client'; // only for contact search dropdown

interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
}

function timeStatus(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const hours = diff / 3_600_000;
  if (hours < 0) return { label: `${Math.abs(Math.floor(hours))}h overdue`, color: '#f46b72', overdue: true };
  if (hours < 2) return { label: 'Due soon', color: '#f4c95d', overdue: false };
  if (hours < 24) return { label: `${Math.floor(hours)}h left`, color: '#4d7cff', overdue: false };
  return { label: `${Math.floor(hours / 24)}d left`, color: '#28c99a', overdue: false };
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f46b72', high: '#f4c95d', normal: '#4d7cff', low: '#8790aa',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)',
  fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none',
};

// ── Add Follow-up Modal ───────────────────────────────────────
function AddFollowUpModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (f: FollowUp) => void;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('10:00');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactList, setShowContactList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  // Set default due date to tomorrow
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDueDate(tomorrow.toISOString().split('T')[0]);
  }, []);

  // Search contacts
  useEffect(() => {
    if (!contactSearch.trim()) { setContacts([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`)
        .limit(8);
      setContacts((data as Contact[]) ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    if (!dueDate) { setError('Due date is required'); return; }
    setSaving(true);
    setError('');
    try {
      const scheduledAt = `${dueDate}T${dueTime}:00`;
      const f = await createFollowUp({
        title: title.trim(),
        due_date: scheduledAt,
        contact_id: selectedContact?.id ?? null,
        notes: notes.trim() || null,
        priority,
      });
      onCreated(f as FollowUp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create follow-up');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 480, borderRadius: 18, padding: 26, boxShadow: '0 20px 50px rgba(0,0,0,0.20)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>Add Follow-up</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={18} /></button>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={13} />{error}
          </div>
        )}

        <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Call back about pricing" style={inputStyle} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Due Date *</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Time</label>
              <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Priority</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['urgent', 'high', 'normal', 'low'] as const).map(p => (
                <button key={p} type="button" onClick={() => setPriority(p)} style={{ flex: 1, padding: '6px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'capitalize', background: priority === p ? `${PRIORITY_COLORS[p]}20` : 'rgba(255,255,255,0.55)', color: priority === p ? PRIORITY_COLORS[p] : 'var(--crm-text-secondary)', outline: priority === p ? `1.5px solid ${PRIORITY_COLORS[p]}` : 'none' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Contact search */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Contact <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(optional)</span></label>
            {selectedContact ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(79,109,245,0.08)', border: '1px solid rgba(79,109,245,0.20)' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {(selectedContact.name ?? '?')[0].toUpperCase()}
                </div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{selectedContact.name ?? selectedContact.phone}</span>
                <button type="button" onClick={() => { setSelectedContact(null); setContactSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-text-muted)' }}><X size={13} /></button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.80)', border: '1px solid rgba(130,145,190,0.25)', borderRadius: 10, padding: '8px 12px' }}>
                  <Search size={13} color="var(--crm-text-muted)" />
                  <input value={contactSearch} onChange={e => { setContactSearch(e.target.value); setShowContactList(true); }} onFocus={() => setShowContactList(true)} placeholder="Search contacts..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--crm-text)' }} />
                </div>
                {showContactList && contacts.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'white', borderRadius: 10, border: '1px solid rgba(130,145,190,0.20)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', overflow: 'hidden', marginTop: 4 }}>
                    {contacts.map(c => (
                      <button key={c.id} type="button" onClick={() => { setSelectedContact(c); setContactSearch(''); setShowContactList(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {(c.name ?? '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{c.name ?? 'Unknown'}</div>
                          {c.phone && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>{c.phone}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Notes <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional context..." rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              <Plus size={14} />{saving ? 'Adding...' : 'Add Follow-up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function FollowUpsPage() {
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFollowUps({ status: 'pending' });
      setFollowups(res.data as FollowUp[]);
    } catch { /* api-client handles 401 */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const now = Date.now();
  const filtered = followups.filter(f => {
    const due = new Date(f.due_date).getTime();
    if (filter === 'overdue') return due < now;
    if (filter === 'today') return due >= now && due < now + 86_400_000;
    if (filter === 'upcoming') return due >= now + 86_400_000;
    return true;
  });

  const overdue = followups.filter(f => new Date(f.due_date).getTime() < now).length;
  const today = followups.filter(f => { const d = new Date(f.due_date).getTime(); return d >= now && d < now + 86_400_000; }).length;

  async function markDone(id: string) {
    try {
      await updateFollowUp(id, { status: 'completed' });
      setFollowups(prev => prev.filter(f => f.id !== id));
    } catch { /* ignore */ }
  }

  const handleCreated = (f: FollowUp) => {
    setFollowups(prev => [...prev, f].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()));
    setShowAdd(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showAdd && <AddFollowUpModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}

      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Follow-ups</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>
            {overdue > 0 ? `⚠️ ${overdue} overdue · ` : ''}{today} due today
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.75)', color: 'var(--crm-text-secondary)', fontSize: 13, cursor: 'pointer' }}>
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Add Follow-up
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['all', 'overdue', 'today', 'upcoming'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            background: filter === f ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)',
            color: filter === f ? 'white' : 'var(--crm-text-secondary)',
          }}>
            {f}{f === 'overdue' && overdue > 0 ? ` (${overdue})` : f === 'today' && today > 0 ? ` (${today})` : ''}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <CalendarDays size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
            <p style={{ margin: '0 0 12px' }}>No follow-ups in this category</p>
            <button onClick={() => setShowAdd(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> Add Follow-up
            </button>
          </div>
        ) : filtered.map(f => {
          const ts = timeStatus(f.due_date);
          const priorityColor = PRIORITY_COLORS[f.priority ?? 'normal'] ?? '#4d7cff';
          return (
            <div key={f.id} className="crm-glass-soft" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: `3px solid ${ts.color}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: `${ts.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {ts.overdue ? <AlertCircle size={18} color={ts.color} /> : <Clock size={18} color={ts.color} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)' }}>{f.title}</div>
                  {f.priority && f.priority !== 'normal' && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: priorityColor, background: `${priorityColor}15`, borderRadius: 5, padding: '1px 6px', textTransform: 'uppercase' }}>{f.priority}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
                  {f.contacts?.name ?? 'No contact'} · {new Date(f.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                {f.notes && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 4 }}>{f.notes}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: ts.color, background: `${ts.color}15`, borderRadius: 8, padding: '3px 8px' }}>{ts.label}</span>
                <button onClick={() => void markDone(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 10, background: 'rgba(40,201,154,0.10)', border: '1px solid rgba(40,201,154,0.25)', color: '#28c99a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <CheckCircle size={12} /> Done
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
