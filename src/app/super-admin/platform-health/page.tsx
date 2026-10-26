'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle, XCircle, Activity } from 'lucide-react';

interface HealthData {
  status: string;
  checks: Record<string, string | number>;
}

export default function SuperAdminPlatformHealth() {
  const [health, setHealth]   = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const token = () => localStorage.getItem('crm_token') ?? '';

  const load = () => {
    setLoading(true); setError('');
    const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
    fetch(`${BACKEND}/api/v1/super-admin/platform-health`, {
      headers: { Authorization: `Bearer ${token()}` },
    }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<HealthData>; })
      .then(setHealth).catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'white' }}>Platform Health</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8790aa' }}>System status and diagnostics</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#8790aa', fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#8790aa', fontSize: 13 }}>Checking platform health…</div>
      ) : health && (
        <>
          {/* Overall status */}
          <div style={{ padding: '16px 20px', borderRadius: 14, background: health.status === 'ok' ? 'rgba(40,201,154,0.08)' : 'rgba(244,107,114,0.08)', border: `1px solid ${health.status === 'ok' ? 'rgba(40,201,154,0.25)' : 'rgba(244,107,114,0.25)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            {health.status === 'ok'
              ? <CheckCircle size={20} color="#28c99a" />
              : <XCircle size={20} color="#f46b72" />}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: health.status === 'ok' ? '#28c99a' : '#f46b72' }}>
                Platform {health.status === 'ok' ? 'Operational' : 'Degraded'}
              </div>
              <div style={{ fontSize: 12, color: '#8790aa', marginTop: 2 }}>All checks completed</div>
            </div>
          </div>

          {/* Checks */}
          <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} color="#8790aa" />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>System Checks</span>
            </div>
            {Object.entries(health.checks).map(([key, value], i, arr) => (
              <div key={key} style={{ padding: '14px 20px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#8790aa', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: value === 'ok' ? '#28c99a' : typeof value === 'number' ? '#f4c95d' : '#f46b72' }}>
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
