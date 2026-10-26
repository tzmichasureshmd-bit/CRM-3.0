'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, CreditCard, Check, AlertCircle } from 'lucide-react';

interface Company {
  id: string; name: string; plan: string; status: string; created_at: string;
}

const PLANS = ['free', 'starter', 'growth', 'scale', 'enterprise'] as const;
type Plan = typeof PLANS[number];

const PLAN_COLOR: Record<string, string> = {
  free: '#8790aa', starter: '#28c99a', growth: '#4f6df5',
  scale: '#f4c95d', enterprise: '#f46b72',
};

export default function SuperAdminBilling() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const token = () => localStorage.getItem('crm_token') ?? '';

  const load = () => {
    setLoading(true);
    fetch('/api/v3/super-admin/companies?limit=200', {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() as Promise<Company[]> : [])
      .then(setCompanies).catch(() => setCompanies([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const changePlan = async (companyId: string, newPlan: Plan) => {
    setUpdating(companyId);
    try {
      const r = await fetch('/api/v3/billing', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: newPlan, target_account_id: companyId }),
      });
      if (r.ok) {
        setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, plan: newPlan } : c));
        showToast(`Plan updated to ${newPlan}`, true);
      } else {
        const err = await r.json().catch(() => ({}));
        showToast((err as { detail?: string }).detail ?? 'Update failed', false);
      }
    } catch {
      showToast('Network error', false);
    } finally {
      setUpdating(null);
    }
  };

  const byPlan = companies.reduce<Record<string, Company[]>>((acc, c) => {
    const p = c.plan || 'free';
    if (!acc[p]) acc[p] = [];
    acc[p].push(c);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: toast.ok ? 'rgba(40,201,154,0.15)' : 'rgba(244,107,114,0.15)',
          border: `1px solid ${toast.ok ? 'rgba(40,201,154,0.3)' : 'rgba(244,107,114,0.3)'}`,
          color: toast.ok ? '#28c99a' : '#f46b72',
        }}>
          {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'white' }}>Billing Overview</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8790aa' }}>
            Manage subscription plans across all companies
          </p>
        </div>
        <button
          onClick={load}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#8790aa', fontSize: 12, cursor: 'pointer' }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Plan summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {PLANS.map(p => {
          const count = (byPlan[p] || []).length;
          return (
            <div key={p} style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: PLAN_COLOR[p], textTransform: 'capitalize', marginBottom: 4 }}>{p}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{count}</div>
              <div style={{ fontSize: 11, color: '#8790aa' }}>{count === 1 ? 'company' : 'companies'}</div>
            </div>
          );
        })}
      </div>

      <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 20px' }}>
        <p style={{ fontSize: 12, color: '#8790aa', margin: 0, lineHeight: 1.6 }}>
          Plan changes take effect immediately. No payment is processed here — billing is managed via WhatsApp consultant.
          Do not assign paid plans without confirmed payment.
        </p>
      </div>

      {loading ? (
        <div style={{ color: '#8790aa', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Company', 'Status', 'Current Plan', 'Change Plan', 'Since'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8790aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < companies.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <td style={{ padding: '10px 20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: '#8790aa', fontFamily: 'monospace' }}>{c.id.slice(0, 8)}…</div>
                  </td>
                  <td style={{ padding: '10px 20px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: c.status === 'active' ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.12)',
                      color: c.status === 'active' ? '#28c99a' : '#f46b72',
                      textTransform: 'capitalize',
                    }}>{c.status || 'active'}</span>
                  </td>
                  <td style={{ padding: '10px 20px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: PLAN_COLOR[c.plan] || '#8790aa', textTransform: 'capitalize' }}>
                      <CreditCard size={13} />{c.plan || 'free'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 20px' }}>
                    <select
                      value={c.plan || 'free'}
                      disabled={updating === c.id}
                      onChange={e => changePlan(c.id, e.target.value as Plan)}
                      style={{
                        background: '#1a1f35', border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 7, color: 'white', fontSize: 12, padding: '5px 10px',
                        cursor: updating === c.id ? 'not-allowed' : 'pointer',
                        opacity: updating === c.id ? 0.5 : 1,
                      }}
                    >
                      {PLANS.map(p => (
                        <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '10px 20px', fontSize: 11, color: '#8790aa' }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
