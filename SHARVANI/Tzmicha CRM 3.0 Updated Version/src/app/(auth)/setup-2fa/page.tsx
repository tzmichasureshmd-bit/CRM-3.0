'use client';

import { useState, useEffect } from 'react';
import { Loader2, Zap, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Setup2FAPage() {
  const router = useRouter();
  const [qrUrl, setQrUrl]       = useState('');
  const [secret, setSecret]     = useState('');
  const [code, setCode]         = useState('');
  const [loading, setLoading]   = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (!token) { router.replace('/login'); return; }

    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/totp/setup`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: { qr_url?: string; secret?: string }) => {
        setQrUrl(d.qr_url ?? '');
        setSecret(d.secret ?? '');
        setLoading(false);
      })
      .catch(() => { setError('Failed to load QR code.'); setLoading(false); });
  }, [router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError('');
    const token = localStorage.getItem('crm_token');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/totp/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json() as { detail?: string };
      if (!res.ok) { setError(data.detail ?? 'Invalid code'); setVerifying(false); return; }
      setDone(true);
    } catch {
      setError('Cannot connect to server.');
      setVerifying(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 10% 10%, rgba(106,125,255,0.20), transparent 32%), radial-gradient(circle at 88% 8%, rgba(255,177,153,0.24), transparent 30%), #eef2ff', padding: 20 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 440, padding: '40px 36px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div className="crm-brand-icon" style={{ background: 'none', padding: 0, overflow: 'hidden' }}><img src="/logo.png" alt="Tzmicha" style={{ width: 36, height: 36, objectFit: 'contain' }} /></div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 750, color: 'var(--crm-text)', letterSpacing: '-0.02em' }}>TZMICHA CRM</div>
            <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Intelligent Growth OS · v3.0</div>
          </div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(40,201,154,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle2 size={30} color="#28c99a" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 10px' }}>2FA Enabled!</h2>
            <p style={{ fontSize: 14, color: 'var(--crm-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
              Google Authenticator is now active on your account. You&apos;ll need your app code on every login.
            </p>
            <button onClick={() => router.replace('/dashboard')} className="crm-btn-primary"
              style={{ padding: '11px 32px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
              Go to Dashboard
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <ShieldCheck size={20} color="#4f6df5" />
              <h1 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Set up Google Authenticator</h1>
            </div>
            <p style={{ fontSize: 13, color: 'var(--crm-text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
              Scan the QR code with your <strong>Google Authenticator</strong> app, then enter the 6-digit code to confirm.
            </p>

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(244,107,114,0.08)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13, marginBottom: 20 }}>
                {error}
              </div>
            )}

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <Loader2 size={28} color="#4f6df5" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : (
              <>
                {/* Steps */}
                {[
                  'Install Google Authenticator on your phone',
                  'Tap "+" → "Scan a QR code"',
                  'Scan the code below',
                  'Enter the 6-digit code to confirm',
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                    <span style={{ fontSize: 13, color: 'var(--crm-text)', lineHeight: 1.5 }}>{s}</span>
                  </div>
                ))}

                {/* QR Code */}
                <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 16px' }}>
                  {qrUrl ? (
                    <img src={qrUrl} alt="TOTP QR Code" width={180} height={180} style={{ borderRadius: 12, border: '4px solid white', boxShadow: '0 4px 20px rgba(0,0,0,0.10)' }} />
                  ) : (
                    <div style={{ width: 180, height: 180, borderRadius: 12, background: 'rgba(130,145,190,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--crm-text-muted)' }}>QR unavailable</div>
                  )}
                </div>

                {/* Manual secret */}
                {secret && (
                  <div style={{ background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.20)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginBottom: 4 }}>Can&apos;t scan? Enter this key manually:</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4f6df5', letterSpacing: '0.12em', fontFamily: 'monospace' }}>{secret}</div>
                  </div>
                )}

                {/* Verify form */}
                <form onSubmit={e => void handleVerify(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    type="text" inputMode="numeric" maxLength={6} value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" autoFocus
                    style={{ width: '100%', padding: '14px', borderRadius: 12, border: '1px solid rgba(130,145,190,0.25)', background: 'rgba(255,255,255,0.60)', fontSize: 28, fontWeight: 700, color: 'var(--crm-text)', outline: 'none', boxSizing: 'border-box', textAlign: 'center', letterSpacing: '0.3em' }}
                  />
                  <button type="submit" disabled={verifying || code.length !== 6} className="crm-btn-primary"
                    style={{ width: '100%', padding: '12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: verifying || code.length !== 6 ? 0.75 : 1 }}>
                    {verifying ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</> : 'Activate Google Authenticator'}
                  </button>
                </form>

                <button onClick={() => router.replace('/dashboard')}
                  style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: 'var(--crm-text-muted)', fontSize: 13, cursor: 'pointer', padding: '8px' }}>
                  Skip for now
                </button>
              </>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
