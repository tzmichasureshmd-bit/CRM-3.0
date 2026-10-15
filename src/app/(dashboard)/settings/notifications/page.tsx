'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, ChevronLeft, CheckCircle2, AlertCircle, X, Mail, Smartphone, MessageSquare, TrendingUp, CalendarDays, Bot } from 'lucide-react';
import Link from 'next/link';

function Banner({ type, text, onClose }: { type: 'success' | 'error'; text: string; onClose: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: '10px 14px', borderRadius: 12,
      background: type === 'success' ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.12)',
      border: `1px solid ${type === 'success' ? 'rgba(40,201,154,0.30)' : 'rgba(244,107,114,0.30)'}`,
      color: type === 'success' ? '#10b981' : '#f46b72', fontSize: 13, fontWeight: 600,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
        {text}
      </span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
        <X size={14} />
      </button>
    </div>
  );
}

interface NotifPrefs {
  email_new_lead: boolean;
  email_overdue_followup: boolean;
  email_deal_won: boolean;
  email_agent_approval: boolean;
  push_new_message: boolean;
  push_hot_lead: boolean;
  push_overdue_followup: boolean;
  inapp_new_message: boolean;
  inapp_lead_score_change: boolean;
  inapp_appointment_reminder: boolean;
  inapp_agent_run_complete: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  email_new_lead: true,
  email_overdue_followup: true,
  email_deal_won: true,
  email_agent_approval: true,
  push_new_message: true,
  push_hot_lead: true,
  push_overdue_followup: false,
  inapp_new_message: true,
  inapp_lead_score_change: true,
  inapp_appointment_reminder: true,
  inapp_agent_run_complete: true,
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: value ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(130,145,190,0.25)',
        position: 'relative', transition: 'background 200ms', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: 'white',
        transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.20)',
      }} />
    </button>
  );
}

function NotifRow({ icon, label, desc, value, onChange }: {
  icon: React.ReactNode; label: string; desc: string;
  value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(130,145,190,0.08)' }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(79,109,245,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f6df5', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 1 }}>{desc}</div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

export default function NotificationsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [userId, setUserId] = useState('');

  const set = (key: keyof NotifPrefs) => (v: boolean) =>
    setPrefs(prev => ({ ...prev, [key]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const { data: profile } = await supabase
      .from('profiles').select('notification_prefs')
      .eq('user_id', user.id).maybeSingle();
    if (profile?.notification_prefs) {
      setPrefs({ ...DEFAULT_PREFS, ...(profile.notification_prefs as Partial<NotifPrefs>) });
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true); setBanner(null);
    try {
      const { error } = await supabase.from('profiles')
        .update({ notification_prefs: prefs })
        .eq('user_id', userId);
      if (error) setBanner({ type: 'error', text: error.message });
      else setBanner({ type: 'success', text: 'Notification preferences saved.' });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' });
    } finally { setSaving(false); }
  };

  const sections = [
    {
      title: 'Email Notifications',
      icon: <Mail size={14} />,
      color: '#8b5cf6',
      rows: [
        { key: 'email_new_lead' as const, icon: <TrendingUp size={15} />, label: 'New Lead', desc: 'When a new lead is created or qualified' },
        { key: 'email_overdue_followup' as const, icon: <CalendarDays size={15} />, label: 'Overdue Follow-up', desc: 'Daily digest of overdue follow-ups' },
        { key: 'email_deal_won' as const, icon: <CheckCircle2 size={15} />, label: 'Deal Won', desc: 'When a deal is marked as won' },
        { key: 'email_agent_approval' as const, icon: <Bot size={15} />, label: 'Agent Approval Required', desc: 'When an AI agent needs your approval' },
      ],
    },
    {
      title: 'Push Notifications',
      icon: <Smartphone size={14} />,
      color: '#28c99a',
      rows: [
        { key: 'push_new_message' as const, icon: <MessageSquare size={15} />, label: 'New Message', desc: 'When a customer sends a new message' },
        { key: 'push_hot_lead' as const, icon: <TrendingUp size={15} />, label: 'Hot Lead Alert', desc: 'When a lead score crosses 70+' },
        { key: 'push_overdue_followup' as const, icon: <CalendarDays size={15} />, label: 'Overdue Follow-up', desc: 'Real-time alert when a follow-up is overdue' },
      ],
    },
    {
      title: 'In-App Notifications',
      icon: <Bell size={14} />,
      color: '#4f6df5',
      rows: [
        { key: 'inapp_new_message' as const, icon: <MessageSquare size={15} />, label: 'New Message', desc: 'Show badge on inbox icon' },
        { key: 'inapp_lead_score_change' as const, icon: <TrendingUp size={15} />, label: 'Lead Score Change', desc: 'Alert when a lead score changes significantly' },
        { key: 'inapp_appointment_reminder' as const, icon: <CalendarDays size={15} />, label: 'Appointment Reminder', desc: '15 minutes before a scheduled appointment' },
        { key: 'inapp_agent_run_complete' as const, icon: <Bot size={15} />, label: 'Agent Run Complete', desc: 'When an AI agent finishes a task' },
      ],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none', fontWeight: 500, width: 'fit-content' }}>
        <ChevronLeft size={16} /> Settings
      </Link>

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Notifications</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>Control how and when you get notified</p>
      </div>

      {banner && <Banner type={banner.type} text={banner.text} onClose={() => setBanner(null)} />}

      {loading ? (
        <div className="crm-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--crm-text-muted)' }}>Loading preferences...</div>
      ) : (
        <>
          {sections.map(section => (
            <div key={section.title}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                <span style={{ color: section.color }}>{section.icon}</span>
                {section.title}
              </div>
              <div className="crm-glass" style={{ padding: '0 20px', borderRadius: 14 }}>
                {section.rows.map(row => (
                  <NotifRow
                    key={row.key}
                    icon={row.icon}
                    label={row.label}
                    desc={row.desc}
                    value={prefs[row.key]}
                    onChange={set(row.key)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              <Bell size={14} /> {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
