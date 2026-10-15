'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, Zap, Mail } from 'lucide-react';
import Link from 'next/link';
import { signInWithGoogle } from '@/lib/firebase';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

type Screen = 'login' | 'otp-enter' | 'otp-code' | 'totp';

export default function LoginPage() {
  const [screen, setScreen]           = useState<Screen>('login');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpEmail, setOtpEmail]       = useState('');
  const [otpCode, setOtpCode]         = useState('');
  const [totpCode, setTotpCode]       = useState('');
  const [partialToken, setPartialToken] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const saveAndRedirect = (data: Record<string, string>) => {
    localStorage.setItem('crm_token', data.access_token);
    localStorage.setItem('crm_user', JSON.stringify({
      user_id: data.user_id ?? '', account_id: data.account_id ?? '',
      role: data.role ?? 'owner', email: data.email ?? '',
      full_name: data.full_name ?? '', avatar_url: data.avatar_url ?? '',
    }));
    window.location.replace('/dashboard');
  };

  // ── Email / Password ──────────────────────────────────────────
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res  = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json() as Record<string, string>;
      if (!res.ok) { setError(data.detail ?? 'Invalid email or password'); setLoading(false); return; }
      if (data.totp_required) { setPartialToken(data.partial_token); setScreen('totp'); setLoading(false); return; }
      saveAndRedirect(data);
    } catch { setError('Cannot connect to server.'); setLoading(false); }
  };

  // ── Email OTP ─────────────────────────────────────────────────
  const handleOtpSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/otp/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail.trim() }),
      });
      if (!res.ok) { const d = await res.json() as Record<string,string>; setError(d.detail ?? 'Failed to send code'); setLoading(false); return; }
      setScreen('otp-code');
    } catch { setError('Cannot connect to server.'); }
    setLoading(false);
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res  = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpEmail.trim(), code: otpCode }),
      });
      const data = await res.json() as Record<string, string>;
      if (!res.ok) { setError(data.detail ?? 'Invalid code'); setLoading(false); return; }
      saveAndRedirect(data);
    } catch { setError('Cannot connect to server.'); setLoading(false); }
  };

  // ── TOTP 2FA ──────────────────────────────────────────────────
  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res  = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/totp/verify-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partial_token: partialToken, code: totpCode }),
      });
      const data = await res.json() as Record<string, string>;
      if (!res.ok) { setError(data.detail ?? 'Invalid code'); setLoading(false); return; }
      saveAndRedirect(data);
    } catch { setError('Cannot connect to server.'); setLoading(false); }
  };

  // ── Google ────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setLoading(true); setError('');
    try {
      const idToken = await signInWithGoogle();
      const res  = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/google`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json() as Record<string, string>;
      if (!res.ok || !data.access_token) { setError(data.detail ?? 'Google sign-in failed'); setLoading(false); return; }
      saveAndRedirect(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('popup-closed')) { setLoading(false); return; }
      setError('Cannot connect to server.'); setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 14, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 10% 10%, rgba(106,125,255,0.20), transparent 32%), radial-gradient(circle at 88% 8%, rgba(255,177,153,0.24), transparent 30%), #eef2ff', padding: 20 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 420, padding: '40px 36px' }}>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div className="crm-brand-icon"><Zap size={18} color="white" /></div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 750, color: 'var(--crm-text)', letterSpacing: '-0.02em' }}>TZMICHA CRM</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Intelligent Growth OS · v3.0</div>
          </div>
        </div>

        {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        {/* ── TOTP screen ── */}
        {screen === 'totp' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(79,109,245,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f6df5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 6px' }}>2-Step Verification</h1>
              <p style={{ fontSize: 13, color: 'var(--crm-text-muted)', margin: 0 }}>Enter the 6-digit code from your Google Authenticator app</p>
            </div>
            <form onSubmit={e => void handleTotpVerify(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" inputMode="numeric" maxLength={6} value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus
                style={{ ...inputStyle, fontSize: 28, fontWeight: 700, textAlign: 'center', letterSpacing: '0.3em', padding: '14px' }} />
              <button type="submit" disabled={loading || totpCode.length !== 6} className="crm-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading || totpCode.length !== 6 ? 0.75 : 1 }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</> : 'Verify Code'}
              </button>
              <button type="button" onClick={() => { setScreen('login'); setError(''); setTotpCode(''); }} style={{ background: 'none', border: 'none', color: '#4f6df5', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Back</button>
            </form>
          </>
        )}

        {/* ── OTP: enter email ── */}
        {screen === 'otp-enter' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(79,109,245,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Mail size={22} color="#4f6df5" />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 6px' }}>Sign in with Email OTP</h1>
              <p style={{ fontSize: 13, color: 'var(--crm-text-muted)', margin: 0 }}>We&apos;ll send a 6-digit code to your inbox</p>
            </div>
            <form onSubmit={e => void handleOtpSend(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="email" value={otpEmail} onChange={e => setOtpEmail(e.target.value)} placeholder="you@company.com" required autoFocus style={inputStyle} />
              <button type="submit" disabled={loading || !otpEmail.trim()} className="crm-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.75 : 1 }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</> : 'Send Code'}
              </button>
              <button type="button" onClick={() => { setScreen('login'); setError(''); }} style={{ background: 'none', border: 'none', color: '#4f6df5', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Back</button>
            </form>
          </>
        )}

        {/* ── OTP: enter code ── */}
        {screen === 'otp-code' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(40,201,154,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Mail size={22} color="#28c99a" />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 6px' }}>Check your inbox</h1>
              <p style={{ fontSize: 13, color: 'var(--crm-text-muted)', margin: 0 }}>We sent a code to <strong>{otpEmail}</strong></p>
            </div>
            <form onSubmit={e => void handleOtpVerify(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" inputMode="numeric" maxLength={6} value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus
                style={{ ...inputStyle, fontSize: 28, fontWeight: 700, textAlign: 'center', letterSpacing: '0.3em', padding: '14px' }} />
              <button type="submit" disabled={loading || otpCode.length !== 6} className="crm-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading || otpCode.length !== 6 ? 0.75 : 1 }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</> : 'Verify Code'}
              </button>
              <button type="button" onClick={() => void handleOtpSend({ preventDefault: () => {} } as React.FormEvent)}
                style={{ background: 'none', border: 'none', color: '#4f6df5', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Resend code
              </button>
              <button type="button" onClick={() => { setScreen('login'); setError(''); setOtpCode(''); }} style={{ background: 'none', border: 'none', color: 'var(--crm-text-muted)', fontSize: 13, cursor: 'pointer' }}>← Back to login</button>
            </form>
          </>
        )}

        {/* ── Main login screen ── */}
        {screen === 'login' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 6px' }}>Welcome back</h1>
            <p style={{ fontSize: 13, color: 'var(--crm-text-muted)', margin: '0 0 24px' }}>Sign in to your CRM dashboard</p>

            {/* Email + Password */}
            <form onSubmit={e => void handleEmailLogin(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus style={inputStyle} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
                  <Link href="/forgot-password" style={{ fontSize: 12, color: '#4f6df5', fontWeight: 600, textDecoration: 'none' }}>Forgot password?</Link>
                </div>
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                    style={{ ...inputStyle, padding: '11px 42px 11px 14px' }} />
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--crm-text-muted)', padding: 0, display: 'flex', cursor: 'pointer' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading || !email.trim() || !password} className="crm-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.75 : 1 }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…</> : 'Sign In'}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(130,145,190,0.20)' }} />
              <span style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>or continue with</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(130,145,190,0.20)' }} />
            </div>

            {/* Email OTP + Google */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => { setScreen('otp-enter'); setError(''); }} disabled={loading}
                style={{ width: '100%', padding: '11px 20px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.80)', fontSize: 14, fontWeight: 600, color: 'var(--crm-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <Mail size={17} color="#4f6df5" /> Sign in with Email OTP
              </button>
              <button onClick={() => void handleGoogle()} disabled={loading}
                style={{ width: '100%', padding: '11px 20px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.30)', background: 'rgba(255,255,255,0.80)', fontSize: 14, fontWeight: 600, color: 'var(--crm-text)', cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: loading ? 0.75 : 1 }}>
                <GoogleIcon /> Continue with Google
              </button>
            </div>

            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--crm-text-muted)', marginTop: 20 }}>
              Don&apos;t have an account?{' '}
              <Link href="/register" style={{ color: '#4f6df5', fontWeight: 600, textDecoration: 'none' }}>Create one free</Link>
            </p>
          </>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
