'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Lock, Eye, EyeOff, X } from 'lucide-react';

interface SessionRenewalModalProps {
  onRenewed: () => void;
}

export function SessionRenewalModal({ onRenewed }: SessionRenewalModalProps) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [email, setEmail]       = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    // Get email from stored user
    try {
      const u = JSON.parse(localStorage.getItem('crm_user') ?? '{}') as { email?: string };
      setEmail(u.email ?? '');
    } catch { /* */ }
  }, []);

  const handleRenew = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
      const res = await fetch(`${BACKEND}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as Record<string, string>;
      if (!res.ok || !data.access_token) {
        setError(data.detail ?? 'Incorrect password. Try again.');
        setLoading(false);
        return;
      }
      // Save new token
      localStorage.setItem('crm_token', data.access_token);
      // Update stored user if new data returned
      if (data.user_id) {
        const existing = JSON.parse(localStorage.getItem('crm_user') ?? '{}') as Record<string, string>;
        localStorage.setItem('crm_user', JSON.stringify({ ...existing, ...data }));
      }
      setPassword('');
      onRenewed();
    } catch {
      setError('Cannot connect to server. Check your connection.');
      setLoading(false);
    }
  }, [email, password, onRenewed]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(10,14,30,0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.97),rgba(248,249,255,0.95))',
        borderRadius: 20, padding: '32px 28px',
        boxShadow: '0 24px 70px rgba(10,14,30,0.35), 0 0 0 1px rgba(255,255,255,0.85)',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(79,109,245,0.35)',
          }}>
            <Lock size={20} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 750, color: '#0f1117', marginBottom: 4 }}>
              Session Expired
            </div>
            <div style={{ fontSize: 13, color: '#8790aa', lineHeight: 1.5 }}>
              Your session timed out. Re-enter your password to continue — your work is safe.
            </div>
          </div>
        </div>

        {/* Email display */}
        {email && (
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)',
            fontSize: 13, color: '#4f6df5', fontWeight: 600,
          }}>
            {email}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '9px 13px', borderRadius: 10,
            background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)',
            fontSize: 13, color: '#f46b72',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Password form */}
        <form onSubmit={e => void handleRenew(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 5 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
                required
                style={{
                  width: '100%', padding: '11px 42px 11px 14px', borderRadius: 12,
                  border: '1.5px solid rgba(130,145,190,0.28)', background: 'white',
                  fontSize: 14, color: '#0f1117', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button type="button" onClick={() => setShowPw(p => !p)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8790aa', display: 'flex' }}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            style={{
              width: '100%', padding: '12px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
              color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: (loading || !password.trim()) ? 0.7 : 1,
              boxShadow: '0 8px 20px rgba(79,109,245,0.30)',
            }}
          >
            {loading
              ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Renewing session…</>
              : '🔓 Continue Working'}
          </button>
        </form>

        {/* Sign out option */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#8790aa' }}>
          Not you?{' '}
          <button
            onClick={() => {
              localStorage.removeItem('crm_token');
              localStorage.removeItem('crm_user');
              window.location.replace('/login');
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f46b72', fontSize: 12, fontWeight: 600, padding: 0 }}
          >
            Sign out
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
