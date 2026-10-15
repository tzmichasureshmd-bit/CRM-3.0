'use client';

import { useState, useEffect } from 'react';
import { Zap, Loader2, Brain, MessageSquare, TrendingUp, Users, Bot, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { signInWithGoogle } from '@/lib/firebase';

const FEATURES = [
  { icon: <Brain size={18} />,         title: 'AI Lead Scoring',      desc: 'Explainable 0–100 scores with intent detection' },
  { icon: <MessageSquare size={18} />, title: 'Unified Inbox',        desc: 'WhatsApp, Instagram, Facebook, Email in one place' },
  { icon: <TrendingUp size={18} />,    title: 'Revenue Intelligence', desc: 'Content → Lead → Deal attribution tracking' },
  { icon: <Bot size={18} />,           title: 'AI Agents',            desc: 'Autonomous agents with human approval gates' },
  { icon: <Users size={18} />,         title: 'Customer 360',         desc: 'Full timeline, deals, and AI insights per contact' },
];

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

export default function RegisterPage() {
  const [fullName, setFullName]           = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActiveFeature(i => (i + 1) % FEATURES.length), 3000);
    return () => clearInterval(id);
  }, []);

  const saveAndRedirect = (data: Record<string, string>) => {
    localStorage.setItem('crm_token', data.access_token);
    localStorage.setItem('crm_user', JSON.stringify({
      user_id: data.user_id ?? '', account_id: data.account_id ?? '',
      role: data.role ?? 'owner', email: data.email ?? email.trim(),
      full_name: data.full_name ?? fullName.trim(), avatar_url: data.avatar_url ?? '',
    }));
    window.location.replace('/dashboard');
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, full_name: fullName.trim(), account_name: fullName.trim() }),
      });
      const data = await res.json() as Record<string, string>;
      if (!res.ok || !data.access_token) { setError(data.detail ?? 'Registration failed'); setLoading(false); return; }
      saveAndRedirect(data);
    } catch {
      setError('Cannot connect to server.');
      setLoading(false);
    }
  };

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
      const data = await res.json() as Record<string, string>;
      if (!res.ok || !data.access_token) { setError(data.detail ?? 'Google sign-in failed'); setLoading(false); return; }
      saveAndRedirect(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('popup-closed')) { setLoading(false); return; }
      setError('Cannot connect to server.');
      setLoading(false);
    }
  };

  const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const pwColor    = ['transparent', '#f46b72', '#f4c95d', '#28c99a'][pwStrength];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0f1117' }}>
      {/* Left Panel */}
      <div style={{ width: '45%', flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '48px 52px', background: 'linear-gradient(145deg,#0f1117 0%,#1a1f2e 50%,#0f1117 100%)', borderRight: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, left: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(79,109,245,0.15) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 64, position: 'relative' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(79,109,245,0.40)' }}>
            <Zap size={18} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 750, color: 'white' }}>TZMICHA CRM</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Intelligent Growth OS</div>
          </div>
        </div>

        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: 'white', margin: '0 0 12px', lineHeight: 1.2, letterSpacing: '-0.03em' }}>
            Turn every customer<br />
            <span style={{ background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>into growth.</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.50)', margin: 0, lineHeight: 1.6 }}>The AI-powered CRM built for modern sales teams.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FEATURES.map((f, i) => (
            <div key={i} onClick={() => setActiveFeature(i)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 300ms ease', background: activeFeature === i ? 'rgba(79,109,245,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${activeFeature === i ? 'rgba(79,109,245,0.40)' : 'rgba(255,255,255,0.06)'}`, transform: activeFeature === i ? 'translateX(4px)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: activeFeature === i ? 'linear-gradient(135deg,#4f6df5,#8b5cf6)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: activeFeature === i ? 'white' : 'rgba(255,255,255,0.40)', flexShrink: 0, transition: 'all 300ms' }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: activeFeature === i ? 'white' : 'rgba(255,255,255,0.60)', marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 40, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex' }}>
            {['#f46b72','#f4c95d','#28c99a','#4f6df5'].map((c, i) => (
              <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: '2px solid #0f1117', marginLeft: i > 0 ? -8 : 0 }} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>Join <strong style={{ color: 'rgba(255,255,255,0.70)' }}>500+</strong> businesses growing with TZMICHA</div>
        </div>
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 48px', background: '#f8f9ff', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f1117', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Create your account</h1>
          <p style={{ fontSize: 14, color: '#8790aa', margin: '0 0 24px' }}>Start your free CRM in seconds</p>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, marginBottom: 16 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={e => void handleEmailRegister(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 5 }}>Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" required autoFocus
                style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 5 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required
                style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 5 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" required minLength={6}
                  style={{ width: '100%', padding: '11px 42px 11px 14px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.25)', background: 'white', fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box' }} />
                <button type="button" onClick={() => setShowPassword(p => !p)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8790aa', display: 'flex' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {pwStrength > 0 && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                  {[1,2,3].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: pwStrength >= i ? pwColor : 'rgba(130,145,190,0.15)' }} />)}
                </div>
              )}
            </div>
            <button type="submit" disabled={loading || !fullName.trim() || !email.trim() || password.length < 6}
              style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.75 : 1, marginTop: 4 }}>
              {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : 'Create Account'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(130,145,190,0.20)' }} />
            <span style={{ fontSize: 12, color: '#8790aa' }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(130,145,190,0.20)' }} />
          </div>

          {/* Email OTP + Google */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => window.location.href = '/login?otp=1'} disabled={loading}
              style={{ width: '100%', padding: '11px 20px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.30)', background: 'white', fontSize: 14, fontWeight: 600, color: '#0f1117', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4f6df5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              Sign up with Email OTP
            </button>
            <button onClick={() => void handleGoogle()} disabled={loading}
              style={{ width: '100%', padding: '11px 20px', borderRadius: 12, border: '1.5px solid rgba(130,145,190,0.30)', background: 'white', fontSize: 14, fontWeight: 600, color: '#1a1a2e', cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: loading ? 0.75 : 1 }}>
              <GoogleIcon /> Continue with Google
            </button>
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#8790aa', marginTop: 20 }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#4f6df5', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
