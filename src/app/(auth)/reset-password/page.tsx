'use client';

import { useState } from 'react';
import { Loader2, Zap, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [done, setDone]                   = useState(false);
  const [error, setError]                 = useState('');

  const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const pwColor    = ['transparent', '#f46b72', '#f4c95d', '#28c99a'][pwStrength];
  const pwLabel    = ['', 'Weak', 'Fair', 'Strong'][pwStrength];
  const valid      = pwStrength >= 2 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError('');
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); setLoading(false); return; }
      setDone(true);
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

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(40,201,154,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle2 size={28} color="#28c99a" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 10px' }}>Password updated!</h2>
            <p style={{ fontSize: 14, color: 'var(--crm-text-muted)', margin: '0 0 28px' }}>Your password has been changed successfully.</p>
            <Link href="/login" className="crm-btn-primary" style={{ display: 'inline-block', padding: '11px 28px', borderRadius: 12, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Sign In
            </Link>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 6px' }}>Set new password</h1>
            <p style={{ fontSize: 13, color: 'var(--crm-text-muted)', margin: '0 0 28px' }}>Choose a strong password for your account.</p>

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, marginBottom: 18 }}>
                {error}
              </div>
            )}

            <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" required autoFocus
                    style={{ width: '100%', padding: '11px 42px 11px 14px', borderRadius: 12, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 14, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--crm-text-muted)', padding: 0, display: 'flex', cursor: 'pointer' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat your password" required
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${confirmPassword && confirmPassword !== password ? '#f46b72' : confirmPassword && confirmPassword === password ? '#28c99a' : 'rgba(130,145,190,0.25)'}`, background: 'rgba(255,255,255,0.60)', fontSize: 14, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button type="submit" disabled={loading || !valid} className="crm-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, marginTop: 4, opacity: loading || !valid ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Updating…</> : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
