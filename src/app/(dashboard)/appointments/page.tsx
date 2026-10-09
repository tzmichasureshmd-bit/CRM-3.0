'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus, Clock, CheckCircle, XCircle, Video } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Appointment {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
  contact_id: string | null;
  notes: string | null;
  contacts?: { name: string | null } | null;
}

const STATUS_META: Record<string, { color: string; icon: React.ReactNode }> = {
  scheduled:  { color: '#4d7cff', icon: <Clock size={12} /> },
  completed:  { color: '#28c99a', icon: <CheckCircle size={12} /> },
  cancelled:  { color: '#f46b72', icon: <XCircle size={12} /> },
  no_show:    { color: '#8790aa', icon: <XCircle size={12} /> },
};

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('appointments').select('*, contacts(name)').order('scheduled_at', { ascending: true }).limit(50);
    setAppointments((data as Appointment[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const upcoming = appointments.filter(a => new Date(a.scheduled_at) > new Date() && a.status === 'scheduled');
  const today = upcoming.filter(a => {
    const d = new Date(a.scheduled_at);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crm-page-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Appointments</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>{today.length} today · {upcoming.length} upcoming</p>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Schedule
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading appointments...</div>
        ) : appointments.length === 0 ? (
          <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>
            <CalendarDays size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
            <p style={{ margin: 0 }}>No appointments scheduled</p>
          </div>
        ) : appointments.map(a => {
          const sm = STATUS_META[a.status] ?? STATUS_META.scheduled;
          const dt = new Date(a.scheduled_at);
          return (
            <div key={a.id} className="crm-glass-soft" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(79,109,245,0.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 750, color: '#4f6df5', lineHeight: 1 }}>{dt.getDate()}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--crm-text-muted)', textTransform: 'uppercase' }}>{dt.toLocaleDateString('en-US', { month: 'short' })}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)', marginBottom: 2 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
                  {a.contacts?.name ?? 'Unknown'} · {dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: sm.color, background: `${sm.color}15`, borderRadius: 8, padding: '3px 8px' }}>
                  {sm.icon}{a.status}
                </span>
                {a.status === 'scheduled' && (
                  <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 10, background: 'rgba(79,109,245,0.10)', border: '1px solid rgba(79,109,245,0.25)', color: '#4f6df5', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <Video size={11} />Join
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
