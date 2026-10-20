'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, Loader2, CheckCircle, AlertCircle, Send } from 'lucide-react';
import Link from 'next/link';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const getH = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('crm_token') ?? '' : ''}`,
});

interface SmtpForm {
  smtp_host: string; smtp_port: number; smtp_user: string; smtp_password: string;
  from_name: string; from_address: string; imap_host: string; imap_port: number;
}

const DEFAULT: SmtpForm = {
  smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: '', smtp_password: '',
  from_name: 'CRM', from_address: '', imap_host: 'imap.gmail.com', imap_port: 993,
};

export default function EmailSettingsPage() {
  const [form, setForm]       = useState<SmtpForm>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/v1/email/smtp-settings`, { headers: getH() })
      .then(r => r.json())
      .then((d: Partial<SmtpForm>) => setForm(f => ({ ...f, ...d })))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof SmtpForm, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setStatus(null);
    try {
      const r = await fetch(`${BASE}/api/v1/email/smtp-settings`, {
        method: 'POST', headers: getH(), body: JSON.stringify(form),
      });
      const d = await r.json() as { status?: string; detail?: string };
      if (!r.ok) throw new Error(d.detail ?? 'Save failed');
      setStatus({ type: 'success', msg: 'SMTP settings saved successfully!' });
    } catch (e: unknown) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Save failed' });
    }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true); setStatus(null);
    try {
      const r = await fetch(`${BASE}/api/v1/email/test-smtp`, { method: 'POST', headers: getH() });
      const d = await r.json() as { message?: string; detail?: string };
      if (!r.ok) throw new Error(d.detail ?? 'Test failed');
      setStatus({ type: 'success', msg: d.message ?? 'Test email sent!' });
    } catch (e: unknown) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Test failed' });
    }
    setTesting(false);
  };

  const inp = (label: string, k: keyof SmtpForm, type = 'text', ph = '') => (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      <input
        type={type} placeholder={ph}
        value={String(form[k])}
        onChange={e => set(k, type === 'number' ? Number(e.target.value) : e.target.value)}
        style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text)', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' }}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--crm-text-muted)', textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Back to Settings
      </Link>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Email / SMTP Settings</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-muted)' }}>Configure outbound email (SMTP) and inbox sync (IMAP)</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--crm-text-muted)', fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading settings...
        </div>
      ) : (
        <>
          {/* SMTP */}
          <div className="crm-glass" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', borderBottom: '1px solid rgba(130,145,190,0.12)', paddingBottom: 10 }}>
              📤 Outbound (SMTP)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
              {inp('SMTP Host', 'smtp_host', 'text', 'smtp.gmail.com')}
              {inp('Port', 'smtp_port', 'number', '587')}
            </div>
            {inp('Email Address (Username)', 'smtp_user', 'email', 'you@gmail.com')}
            {inp('App Password', 'smtp_password', 'password', '••••••••••••••••')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {inp('From Name', 'from_name', 'text', 'TZMICHA CRM')}
              {inp('From Address', 'from_address', 'email', 'you@gmail.com')}
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)', fontSize: 12, color: 'var(--crm-text-muted)' }}>
              💡 For Gmail: use an <strong>App Password</strong> (not your regular password). Go to Google Account → Security → 2-Step Verification → App passwords.
            </div>
          </div>

          {/* IMAP */}
          <div className="crm-glass" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)', borderBottom: '1px solid rgba(130,145,190,0.12)', paddingBottom: 10 }}>
              📥 Inbox Sync (IMAP)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
              {inp('IMAP Host', 'imap_host', 'text', 'imap.gmail.com')}
              {inp('Port', 'imap_port', 'number', '993')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>Uses the same email/password as SMTP above.</div>
          </div>

          {/* Status */}
          {status && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, background: status.type === 'success' ? 'rgba(40,201,154,0.08)' : 'rgba(244,107,114,0.08)', border: `1px solid ${status.type === 'success' ? 'rgba(40,201,154,0.25)' : 'rgba(244,107,114,0.25)'}`, color: status.type === 'success' ? '#28c99a' : '#f46b72', fontSize: 13, fontWeight: 600 }}>
              {status.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
              {status.msg}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => void save()} disabled={saving}
              style={{ padding: '11px 24px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: saving ? 0.75 : 1 }}>
              {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : '💾 Save Settings'}
            </button>
            <button onClick={() => void test()} disabled={testing || saving}
              style={{ padding: '11px 20px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', color: 'var(--crm-text)', fontSize: 14, fontWeight: 600, cursor: testing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: testing ? 0.75 : 1 }}>
              {testing ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Testing…</> : <><Send size={14} /> Send Test Email</>}
            </button>
          </div>
        </>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
