'use client';

import { useState } from 'react';
import { Loader2, Zap, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) { setError(err.message); setLoading(false); return; }
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 10% 10%, rgba(106,125,255,0.20), transparent 32%), radial-gradient(circle at 88% 8%, rgba(255,177,153,0.24), transparent 30%), #eef2ff', padding: 20 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 420, padding: '40px 36px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div className="crm-brand-icon"><Zap size={18} color="white" /></div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 750, color: 'var(--crm-text)', letterSpacing: '-0.02em' }}>TZMICHA CRM</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Intelligent Growth OS · v3.0</div>
          </div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(40,201,154,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle2 size={28} color="#28c99a" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 10px' }}>Check your email</h2>
            <p style={{ fontSize: 14, color: 'var(--crm-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
              We sent a password reset link to <strong>{email}</strong>. Check your inbox and follow the link.
            </p>
            <Link href="/login" style={{ color: '#4f6df5', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={14} /> Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 6px' }}>Forgot password?</h1>
            <p style={{ fontSize: 13, color: 'var(--crm-text-muted)', margin: '0 0 28px' }}>Enter your email and we'll send you a reset link.</p>

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, marginBottom: 18 }}>
                {error}
              </div>
            )}

            <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 14, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button type="submit" disabled={loading || !email.trim()} className="crm-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, marginTop: 4, opacity: loading ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</> : 'Send Reset Link'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--crm-text-muted)', marginTop: 20 }}>
              <Link href="/login" style={{ color: '#4f6df5', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <ArrowLeft size={13} /> Back to Sign In
              </Link>
            </p>
          </>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
