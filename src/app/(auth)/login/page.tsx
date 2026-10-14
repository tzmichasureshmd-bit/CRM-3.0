'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, Zap } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json() as {
        access_token?: string;
        account_id?: string;
        role?: string;
        user_id?: string;
        detail?: string;
      };
      if (!res.ok || !data.access_token) {
        setError(data.detail ?? 'Invalid email or password');
        setLoading(false);
        return;
      }
      localStorage.setItem('crm_token', data.access_token);
      localStorage.setItem('crm_user', JSON.stringify({
        user_id: data.user_id ?? '',
        account_id: data.account_id ?? '',
        role: data.role ?? 'agent',
        email: email.trim(),
        full_name: email.split('@')[0],
      }));
      window.location.replace('/dashboard');
    } catch {
      setError('Cannot connect to server. Make sure backend is running.');
      setLoading(false);
    }
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

        <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 6px' }}>Welcome back</h1>
        <p style={{ fontSize: 13, color: 'var(--crm-text-muted)', margin: '0 0 28px' }}>Sign in to your CRM dashboard</p>

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
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                style={{ width: '100%', padding: '11px 42px 11px 14px', borderRadius: 12, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 14, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--crm-text-muted)', padding: 0, display: 'flex', cursor: 'pointer' }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading || !email.trim() || !password.trim()} className="crm-btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: 14, marginTop: 4, opacity: loading ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…</> : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--crm-text-muted)', marginTop: 20 }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: '#4f6df5', fontWeight: 600, textDecoration: 'none' }}>Create one free</Link>
        </p>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
