'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, Check, X, Loader2 } from 'lucide-react';

interface InviteInfo {
  id: string; email: string; role: string; status: string;
  expires_at: string; company_name: string; account_id: string;
}

function InviteContent() {
  const params = useSearchParams();
  const token  = params.get('token') ?? '';

  const [info, setInfo]       = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [accepting, setAccepting] = useState(false);
  const [done, setDone]       = useState<'accepted' | 'declined' | null>(null);

  useEffect(() => {
    if (!token) { setError('No invitation token provided.'); setLoading(false); return; }
    fetch(`/api/v3/employees/invitations/by-token?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : r.json().then((d: { error?: string }) => Promise.reject(d.error || 'Not found')))
      .then((d: InviteInfo) => {
        if (d.status !== 'pending') { setError(`This invitation is ${d.status}.`); }
        else if (new Date(d.expires_at) < new Date()) { setError('This invitation has expired.'); }
        else setInfo(d);
      })
      .catch((e: unknown) => setError(typeof e === 'string' ? e : 'Invitation not found or already used.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const r = await fetch('/api/v3/employees/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (r.ok) setDone('accepted');
      else {
        const d = await r.json() as { detail?: string };
        setError(d.detail ?? 'Failed to accept invitation.');
      }
    } finally { setAccepting(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--crm-text-muted)', fontSize: 14 }}>
      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Verifying invitation…
    </div>
  );

  if (done === 'accepted') return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(40,201,154,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Check size={28} color="#28c99a" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 8px' }}>Invitation Accepted!</h2>
      <p style={{ fontSize: 14, color: 'var(--crm-text-muted)', margin: '0 0 24px' }}>
        You've joined <strong>{info?.company_name}</strong> as <strong>{info?.role}</strong>.
      </p>
      <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 12, background: '#4f6df5', color: 'white', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
        Sign in to your workspace →
      </Link>
    </div>
  );

  if (done === 'declined') return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(244,107,114,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <X size={28} color="#f46b72" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 8px' }}>Invitation Declined</h2>
      <p style={{ fontSize: 14, color: 'var(--crm-text-muted)', margin: 0 }}>You've declined the invitation. You can close this page.</p>
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(244,107,114,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <X size={28} color="#f46b72" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 8px' }}>Invalid Invitation</h2>
      <p style={{ fontSize: 14, color: 'var(--crm-text-muted)', margin: 0 }}>{error}</p>
    </div>
  );

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(79,109,245,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Building2 size={28} color="#4f6df5" />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 750, color: 'var(--crm-text)', margin: '0 0 8px' }}>You're invited!</h2>
      <p style={{ fontSize: 14, color: 'var(--crm-text-muted)', margin: '0 0 24px' }}>
        <strong>{info?.company_name}</strong> has invited you to join as <strong style={{ textTransform: 'capitalize' }}>{info?.role}</strong>.
      </p>
      <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(79,109,245,0.06)', border: '1px solid rgba(79,109,245,0.15)', marginBottom: 24, textAlign: 'left' }}>
        <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginBottom: 4 }}>Invitation for</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)' }}>{info?.email}</div>
        <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', marginTop: 6 }}>
          Expires {info?.expires_at ? new Date(info.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button onClick={handleAccept} disabled={accepting}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 28px', borderRadius: 12, background: '#4f6df5', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: accepting ? 0.7 : 1 }}>
          {accepting ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />}
          {accepting ? 'Accepting…' : 'Accept Invitation'}
        </button>
        <button onClick={() => setDone('declined')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 12, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          <X size={15} /> Decline
        </button>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--crm-bg, #f8f9ff)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, padding: '40px 36px', borderRadius: 20, background: 'white', boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <img src="/logo.png" alt="Tzmicha" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117' }}>TZMICHA CRM</div>
        </div>
        <Suspense fallback={<div style={{ color: '#8790aa', fontSize: 14 }}>Loading…</div>}>
          <InviteContent />
        </Suspense>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
