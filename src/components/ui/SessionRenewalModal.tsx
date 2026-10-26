'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import { signInWithGoogle } from '@/lib/firebase';
import { clearAllTokens } from '@/lib/auth-client';

interface SessionRenewalModalProps {
  onRenewed: () => void;
}

export function SessionRenewalModal({ onRenewed }: SessionRenewalModalProps) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [email, setEmail]       = useState('');
  const [isGoogle, setIsGoogle] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isNetworkError, setIsNetworkError] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('crm_user') ?? '{}') as { email?: string; auth_provider?: string };
      setEmail(u.email ?? '');
      setIsGoogle(u.auth_provider === 'google');
    } catch { /* */ }
  }, []);

  const handleGoogle = useCallback(async () => {
    setLoading(true);
    setError('');
    setIsNetworkError(false);
    try {
      const idToken = await signInWithGoogle();
      const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
      const res = await fetch(`${BACKEND}/api/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json() as Record<string, string>;
      if (!res.ok || !data.access_token) {
        setError(data.detail ?? 'Google sign-in failed. Try again.');
        setLoading(false);
        setRetryCount(prev => prev + 1);
        return;
      }
      localStorage.setItem('crm_token', data.access_token);
      // Update crm_user so next expiry shows correct email/provider
      try {
        const prev = JSON.parse(localStorage.getItem('crm_user') ?? '{}') as Record<string, string>;
        localStorage.setItem('crm_user', JSON.stringify({
          ...prev,
          email:         data.email      ?? prev.email ?? '',
          full_name:     data.full_name  ?? prev.full_name ?? '',
          avatar_url:    data.avatar_url ?? prev.avatar_url ?? '',
          auth_provider: 'google',
        }));
      } catch { /* */ }
      setRetryCount(0);
      onRenewed();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('popup-closed')) { setLoading(false); return; }
      setError('Network error. Check your connection and try again.');
      setIsNetworkError(true);
      setLoading(false);
      setRetryCount(prev => prev + 1);
    }
  }, [onRenewed]);

  const handlePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    setIsNetworkError(false);
    try {
      const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
      const res = await fetch(`${BACKEND}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as Record<string, string>;
      if (!res.ok || !data.access_token) {
        const detail = data.detail ?? 'Incorrect password';
        setError(detail);
        setLoading(false);
        setRetryCount(prev => prev + 1);
        return;
      }
      localStorage.setItem('crm_token', data.access_token);
      // Update crm_user so next expiry shows correct email/provider
      try {
        const prev = JSON.parse(localStorage.getItem('crm_user') ?? '{}') as Record<string, string>;
        localStorage.setItem('crm_user', JSON.stringify({
          ...prev,
          email:         data.email      ?? prev.email ?? email,
          full_name:     data.full_name  ?? prev.full_name ?? '',
          avatar_url:    data.avatar_url ?? prev.avatar_url ?? '',
          auth_provider: 'email',
        }));
      } catch { /* */ }
      setPassword('');
      setRetryCount(0);
      onRenewed();
    } catch {
      setError('Network error. Check your connection and try again.');
      setIsNetworkError(true);
      setLoading(false);
      setRetryCount(prev => prev + 1);
    }
  }, [email, password, onRenewed]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
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
            <div style={{ fontSize: 16, fontWeight: 750, color: '#0f1117', marginBottom: 4 }}>Session Expired</div>
            <div style={{ fontSize: 13, color: '#8790aa', lineHeight: 1.5 }}>
              Your session timed out. Sign in again to continue — your work is safe.
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
          <div>
            <div style={{
              padding: '9px 13px', borderRadius: 10,
              background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)',
              fontSize: 13, color: '#f46b72', marginBottom: 8,
            }}>
              ⚠️ {error}
            </div>
            {isNetworkError && (
              <button
                onClick={() => isGoogle ? void handleGoogle() : void handlePassword(new Event('submit') as unknown as React.FormEvent)}
                disabled={loading}
                style={{
                  width: '100%', padding: '8px', borderRadius: 8,
                  border: '1px solid rgba(244,107,114,0.25)', background: 'white',
                  fontSize: 12, fontWeight: 600, color: '#f46b72',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: 12,
                }}
              >
                🔄 Retry Connection
              </button>
            )}
            {!isNetworkError && retryCount >= 2 && !isGoogle && (
              <a
                href="/forgot-password"
                style={{
                  display: 'block', textAlign: 'center',
                  fontSize: 12, color: '#4f6df5', fontWeight: 600,
                  textDecoration: 'none', marginBottom: 12,
                }}
              >
                Forgot your password?
              </a>
            )}
          </div>
        )}

        {/* FIX-007: If crm_user is missing/corrupted (no email), show safe fallback instead of
            a broken password form (Google users have no password and would be stuck). */}
        {!email ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#8790aa', textAlign: 'center', lineHeight: 1.6 }}>
              Unable to detect your sign-in method. Please sign out and sign in again.
            </div>
            <button
              onClick={() => { clearAllTokens(); window.location.replace('/login'); }}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
                color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Sign In Again
            </button>
          </div>
        ) : isGoogle ? (
          /* Google button for Google users */
          <button
            onClick={() => void handleGoogle()}
            disabled={loading}
            style={{
              width: '100%', padding: '13px', borderRadius: 12,
              border: '1.5px solid rgba(130,145,190,0.30)', background: 'white',
              fontSize: 14, fontWeight: 600, color: '#1a1a2e',
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              opacity: loading ? 0.75 : 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            {loading ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
            )}
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>
        ) : (
          /* Password form for email/password users */
          <form onSubmit={e => void handlePassword(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334e68', marginBottom: 5 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus required
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
            <button type="submit" disabled={loading || !password.trim()}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
                color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: (loading || !password.trim()) ? 0.7 : 1,
              }}>
              {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Renewing…</> : '🔓 Continue Working'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', fontSize: 12, color: '#8790aa' }}>
          Not you?{' '}
          <button
            onClick={() => { clearAllTokens(); window.location.replace('/login'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f46b72', fontSize: 12, fontWeight: 600, padding: 0 }}>
            Sign out
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
