'use client';

import { useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { signInWithGoogle } from '@/lib/firebase';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleGoogle = async () => {
    setLoading(true);
    setError('');
    try {
      const idToken = await signInWithGoogle();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json() as { access_token?: string; user_id?: string; account_id?: string; role?: string; full_name?: string; email?: string; avatar_url?: string; detail?: string; };
      if (!res.ok || !data.access_token) { setError(data.detail ?? 'Failed'); setLoading(false); return; }
      localStorage.setItem('crm_token', data.access_token);
      localStorage.setItem('crm_user', JSON.stringify({ user_id: data.user_id ?? '', account_id: data.account_id ?? '', role: data.role ?? 'owner', email: data.email ?? '', full_name: data.full_name ?? '', avatar_url: data.avatar_url ?? '' }));
      window.location.replace('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('popup-closed')) { setLoading(false); return; }
      setError('Cannot connect to server.');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 10% 10%, rgba(106,125,255,0.20), transparent 32%), radial-gradient(circle at 88% 8%, rgba(255,177,153,0.24), transparent 30%), #eef2ff', padding: 20 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 420, padding: '40px 36px', textAlign: 'center' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36, justifyContent: 'center' }}>
          <div className="crm-brand-icon" style={{ background: 'none', padding: 0, overflow: 'hidden' }}><img src="/logo.png" alt="Tzmicha" style={{ width: 36, height: 36, objectFit: 'contain' }} /></div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 18, fontWeight: 750, color: 'var(--crm-text)', letterSpacing: '-0.02em' }}>TZMICHA CRM</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Intelligent Growth OS · v3.0</div>
          </div>
        </div>

        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(79,109,245,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4f6df5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 10px' }}>No password needed</h1>
        <p style={{ fontSize: 14, color: 'var(--crm-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
          This CRM uses <strong>Google Sign-In</strong> — there&apos;s no password to reset.<br />
          Just sign in with your Google account below.
        </p>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        <button onClick={() => void handleGoogle()} disabled={loading}
          style={{ width: '100%', padding: '13px 20px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.30)', background: 'white', fontSize: 15, fontWeight: 600, color: '#1a1a2e', cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: loading ? 0.75 : 1, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 20 }}>
          {loading ? (
            <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Signing you in…</>
          ) : (
            <><GoogleIcon /> Sign in with Google</>
          )}
        </button>

        <Link href="/login" style={{ fontSize: 13, color: '#4f6df5', fontWeight: 600, textDecoration: 'none' }}>
          ← Back to Sign In
        </Link>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
