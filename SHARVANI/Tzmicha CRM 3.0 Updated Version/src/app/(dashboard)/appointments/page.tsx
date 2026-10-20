'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus, Clock, CheckCircle, XCircle, Video, X, AlertCircle, Search, ExternalLink } from 'lucide-react';
import { getAppointments, createAppointment, updateAppointment } from '@/lib/api-client';
import type { Appointment } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client'; // only for contact search

interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
}

const STATUS_META: Record<string, { color: string; icon: React.ReactNode }> = {
  scheduled:  { color: '#4d7cff', icon: <Clock size={12} /> },
  completed:  { color: '#28c99a', icon: <CheckCircle size={12} /> },
  cancelled:  { color: '#f46b72', icon: <XCircle size={12} /> },
  no_show:    { color: '#8790aa', icon: <XCircle size={12} /> },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.80)',
  fontSize: 13, color: 'var(--crm-text)', boxSizing: 'border-box', outline: 'none',
};

// ── Schedule Appointment Modal ────────────────────────────────
function ScheduleModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (a: Appointment) => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactList, setShowContactList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  // Default date = tomorrow
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(tomorrow.toISOString().split('T')[0]);
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
    if (!date) { setError('Date is required'); return; }
    setSaving(true);
    setError('');
    try {
      const scheduledAt = `${date}T${time}:00`;
      const a = await createAppointment({
        title: title.trim(),
        scheduled_at: scheduledAt,
        duration_minutes: duration,
        contact_id: selectedContact?.id ?? null,
        notes: notes.trim() || null,
        meeting_url: meetingUrl.trim() || null,
      });
      onCreated(a as Appointment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule appointment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass" style={{ width: '100%', maxWidth: 500, borderRadius: 18, padding: 26, boxShadow: '0 20px 50px rgba(0,0,0,0.20)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>Schedule Appointment</h3>
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
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Product Demo Call" style={inputStyle} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 6 }}>Duration</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[15, 30, 45, 60, 90].map(d => (
                <button key={d} type="button" onClick={() => setDuration(d)} style={{ flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: duration === d ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: duration === d ? 'white' : 'var(--crm-text-secondary)' }}>
                  {d}m
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Meeting URL <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(Zoom, Meet, Teams...)</span></label>
            <input value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/..." style={inputStyle} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--crm-text-secondary)', marginBottom: 4 }}>Notes <span style={{ fontWeight: 400, color: 'var(--crm-text-muted)' }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Agenda, preparation notes..." rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              <CalendarDays size={14} />{saving ? 'Scheduling...' : 'Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'today' | 'completed'>('all');
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAppointments();
      setAppointments(res.data as Appointment[]);
    } catch { /* api-client handles 401 */ }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const now = new Date();
  const upcoming = appointments.filter(a => new Date(a.scheduled_at) > now && a.status === 'scheduled');
  const today = upcoming.filter(a => {
    const d = new Date(a.scheduled_at);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
  });

  const filtered = appointments.filter(a => {
    if (filter === 'upcoming') return new Date(a.scheduled_at) > now && a.status === 'scheduled';
    if (filter === 'today') {
      const d = new Date(a.scheduled_at);
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
    }
    if (filter === 'completed') return a.status === 'completed';
    return true;
  });

  const handleCreated = (a: Appointment) => {
    setAppointments(prev => [...prev, a].sort((x, y) => new Date(x.scheduled_at).getTime() - new Date(y.scheduled_at).getTime()));
    setShowSchedule(false);
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateAppointment(id, { status });
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } catch { /* ignore */ }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showSchedule && <ScheduleModal onClose={() => setShowSchedule(false)} onCreated={handleCreated} />}

      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Appointments</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>{today.length} today · {upcoming.length} upcoming</p>
        </div>
        <button onClick={() => setShowSchedule(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Schedule
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['all', 'today', 'upcoming', 'completed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', textTransform: 'capitalize', background: filter === f ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.55)', color: filter === f ? 'white' : 'var(--crm-text-secondary)' }}>
            {f}{f === 'today' && today.length > 0 ? ` (${today.length})` : f === 'upcoming' && upcoming.length > 0 ? ` (${upcoming.length})` : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading appointments...</div>
        ) : filtered.length === 0 ? (
          <div className="crm-glass" style={{ padding: 48, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <CalendarDays size={36} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>No appointments found</p>
            <button onClick={() => setShowSchedule(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> Schedule First Appointment
            </button>
          </div>
        ) : filtered.map(a => {
          const sm = STATUS_META[a.status] ?? STATUS_META.scheduled;
          const dt = new Date(a.scheduled_at);
          const isPast = dt < now;
          return (
            <div key={a.id} className="crm-glass-soft" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: isPast ? 'rgba(130,145,190,0.10)' : 'rgba(79,109,245,0.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 750, color: isPast ? '#8790aa' : '#4f6df5', lineHeight: 1 }}>{dt.getDate()}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>{dt.toLocaleDateString('en-US', { month: 'short' })}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)', marginBottom: 2 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
                  {a.contacts?.name ?? 'No contact'} · {dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}
                </div>
                {a.notes && <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 3 }}>{a.notes}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: sm.color, background: `${sm.color}15`, borderRadius: 8, padding: '3px 8px' }}>
                  {sm.icon}{a.status}
                </span>
                {a.status === 'scheduled' && a.meeting_url && (
                  <a href={a.meeting_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 10, background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.25)', color: '#4f6df5', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                    <Video size={11} />Join <ExternalLink size={10} />
                  </a>
                )}
                {a.status === 'scheduled' && !a.meeting_url && (
                  <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 10, background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.25)', color: '#4f6df5', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => void handleStatusChange(a.id, 'completed')}>
                    <CheckCircle size={11} />Mark Done
                  </button>
                )}
                {a.status === 'scheduled' && (
                  <button onClick={() => void handleStatusChange(a.id, 'cancelled')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 10, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.20)', color: '#f46b72', fontSize: 11, cursor: 'pointer' }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
