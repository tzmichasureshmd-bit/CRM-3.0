'use client';

/**
 * Forgot Password — 3-step recovery
 *
 * Step 1  Enter email  →  POST /api/v1/auth/otp/send   (FastAPI stores hashed OTP in DB)
 * Step 2  Enter 5-digit OTP  →  POST /api/v1/auth/otp/verify  (returns CRM JWT on success)
 * Step 3  Set new password  →  PATCH /api/v1/auth/password  (authenticated with the JWT)
 *
 * All calls go to the FastAPI backend — same auth system as login/register.
 * No Supabase OTP, no localStorage during the reset flow itself.
 */

import { useState, useRef, useEffect } from 'react';
import { Loader2, Mail, ShieldCheck, CheckCircle2, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type Step = 'email' | 'otp' | 'newpass' | 'done';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const OTP_LEN = 6;

const iStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 12,
  border: '1.5px solid rgba(130,145,190,0.25)', background: 'white',
  fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box',
};

async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T & { detail?: string };
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `HTTP ${res.status}`);
  return data;
}

export default function ForgotPasswordPage() {
  const [step, setStep]           = useState<Step>('email');
  const [email, setEmail]         = useState('');
  const [otp, setOtp]             = useState<string[]>(Array(OTP_LEN).fill(''));
  const [resetToken, setResetToken] = useState('');   // CRM JWT returned after OTP verify
  const [password, setPassword]   = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [cooldown, setCooldown]   = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const otpStr     = otp.join('');
  const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const pwColor    = ['transparent', '#f46b72', '#f4c95d', '#28c99a'][pwStrength];
  const pwLabel    = ['', 'Weak', 'Fair', 'Strong'][pwStrength];

  // ── Step 1: send OTP via FastAPI ─────────────────────────────
  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiFetch('/auth/otp/send', { email: email.trim() });
      setStep('otp');
      setCooldown(60);
      // Focus first OTP box after render
      setTimeout(() => refs.current[0]?.focus(), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code.');
    }
    setLoading(false);
  };

  // ── Step 2: verify OTP via FastAPI ───────────────────────────
  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpStr.length < OTP_LEN) { setError(`Enter all ${OTP_LEN} digits.`); return; }
    setLoading(true);
    setError('');
    try {
      // otp/verify returns a full TokenResponse — we use the JWT to auth the password update
      const data = await apiFetch<{ access_token: string }>('/auth/otp/verify', {
        email: email.trim(),
        code: otpStr,
      });
      setResetToken(data.access_token);
      setStep('newpass');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code.');
    }
    setLoading(false);
  };

  // ── Step 3: set new password via FastAPI ─────────────────────
  const setNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPw) { setError('Passwords do not match.'); return; }
    if (pwStrength < 2) { setError('Password too weak — use at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND}/api/v1/auth/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resetToken}`,
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json() as { detail?: string };
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    }
    setLoading(false);
  };

  // ── OTP box handlers ─────────────────────────────────────────
  const onOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp]; next[i] = digit; setOtp(next);
    if (digit && i < OTP_LEN - 1) refs.current[i + 1]?.focus();
  };
  const onOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };
  const onOtpPaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LEN);
    if (digits.length === OTP_LEN) { setOtp(digits.split('')); refs.current[OTP_LEN - 1]?.focus(); }
  };

  const STEPS = ['Email', 'Verify', 'Password'];
  const stepIdx = ['email', 'otp', 'newpass'].indexOf(step);
  const bg = 'radial-gradient(circle at 10% 10%, rgba(106,125,255,0.20), transparent 32%), radial-gradient(circle at 88% 8%, rgba(255,177,153,0.24), transparent 30%), #eef2ff';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, padding: 20 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 420, padding: '40px 36px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden' }}>
            <img src="/logo.png" alt="Tzmicha" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--crm-text)', letterSpacing: '-0.02em' }}>TZMICHA CRM</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Intelligent Growth OS · v3.0</div>
          </div>
        </div>

        {/* Step progress */}
        {step !== 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
            {STEPS.map((label, i) => {
              const done = i < stepIdx, active = i === stepIdx;
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'unset' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'all 0.3s', background: done ? '#28c99a' : active ? '#4f6df5' : 'rgba(130,145,190,0.20)', color: done || active ? 'white' : '#8790aa' }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#4f6df5' : done ? '#28c99a' : '#8790aa', whiteSpace: 'nowrap' }}>{label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 2, margin: '0 6px', marginBottom: 16, background: done ? '#28c99a' : 'rgba(130,145,190,0.20)', transition: 'background 0.3s' }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, marginBottom: 20 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── STEP 1: Email ── */}
        {step === 'email' && (
          <>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(79,109,245,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <Mail size={26} color="#4f6df5" />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f1117', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Reset your password</h1>
            <p style={{ fontSize: 13, color: '#8790aa', margin: '0 0 24px', lineHeight: 1.6 }}>
              Enter your account email. We&apos;ll send a 6-digit code that expires in 10 minutes.
            </p>
            <form onSubmit={e => void sendOtp(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 5 }}>Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus style={iStyle} />
              </div>
              <button type="submit" disabled={loading || !email.trim()}
                style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.75 : 1 }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</> : 'Send Verification Code'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4f6df5', fontWeight: 600, textDecoration: 'none' }}>
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </div>
          </>
        )}

        {/* ── STEP 2: OTP ── */}
        {step === 'otp' && (
          <>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(79,109,245,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <ShieldCheck size={26} color="#4f6df5" />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f1117', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Check your inbox</h1>
            <p style={{ fontSize: 13, color: '#8790aa', margin: '0 0 4px', lineHeight: 1.6 }}>We sent a 6-digit code to</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', margin: '0 0 24px' }}>{email}</p>

            <form onSubmit={e => void verifyOtp(e)} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }} onPaste={onOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { refs.current[i] = el; }}
                    type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => onOtpChange(i, e.target.value)}
                    onKeyDown={e => onOtpKey(i, e)}
                    style={{
                      width: 56, height: 64, textAlign: 'center', fontSize: 26, fontWeight: 800,
                      borderRadius: 14, border: `2.5px solid ${digit ? '#4f6df5' : 'rgba(130,145,190,0.25)'}`,
                      background: digit ? 'rgba(79,109,245,0.06)' : 'white', color: '#0f1117',
                      outline: 'none', transition: 'all 0.15s',
                      boxShadow: digit ? '0 0 0 3px rgba(79,109,245,0.12)' : 'none',
                    }}
                  />
                ))}
              </div>
              <button type="submit" disabled={loading || otpStr.length < OTP_LEN}
                style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading || otpStr.length < OTP_LEN ? 0.65 : 1 }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</> : 'Verify Code'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <span style={{ fontSize: 13, color: '#8790aa' }}>Didn&apos;t receive it? </span>
              <button onClick={() => void sendOtp()} disabled={cooldown > 0}
                style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: cooldown > 0 ? '#8790aa' : '#4f6df5', cursor: cooldown > 0 ? 'default' : 'pointer', padding: 0 }}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button onClick={() => { setStep('email'); setOtp(Array(OTP_LEN).fill('')); setError(''); }}
                style={{ background: 'none', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4f6df5', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                <ArrowLeft size={14} /> Change email
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: New Password ── */}
        {step === 'newpass' && (
          <>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(40,201,154,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <ShieldCheck size={26} color="#28c99a" />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f1117', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Set new password</h1>
            <p style={{ fontSize: 13, color: '#8790aa', margin: '0 0 24px', lineHeight: 1.6 }}>
              Identity verified ✓ — choose a strong new password.
            </p>
            <form onSubmit={e => void setNewPassword(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 5 }}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" required autoFocus style={{ ...iStyle, paddingRight: 42 }} />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8790aa', display: 'flex' }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {pwStrength > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1,2,3].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: pwStrength >= i ? pwColor : 'rgba(130,145,190,0.15)' }} />)}
                    </div>
                    <div style={{ fontSize: 11, color: pwColor, marginTop: 4, fontWeight: 600 }}>{pwLabel} password</div>
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 5 }}>Confirm Password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat your password" required
                  style={{ ...iStyle, borderColor: confirmPw && confirmPw !== password ? '#f46b72' : confirmPw && confirmPw === password ? '#28c99a' : undefined }} />
                {confirmPw && confirmPw === password && (
                  <div style={{ fontSize: 11, color: '#28c99a', marginTop: 4, fontWeight: 600 }}>✓ Passwords match</div>
                )}
              </div>
              <button type="submit" disabled={loading || pwStrength < 2 || password !== confirmPw}
                style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.75 : 1, marginTop: 4 }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Updating…</> : 'Update Password'}
              </button>
            </form>
          </>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(40,201,154,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle2 size={36} color="#28c99a" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f1117', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Password updated!</h2>
            <p style={{ fontSize: 14, color: '#8790aa', margin: '0 0 28px', lineHeight: 1.6 }}>
              Your password has been changed successfully.<br />Sign in with your new password now.
            </p>
            <Link href="/login"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '12px 36px', borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 14px rgba(79,109,245,0.30)' }}>
              Sign In Now →
            </Link>
          </div>
        )}

      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
