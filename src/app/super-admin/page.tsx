'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Users, UserCheck, RefreshCw, TrendingUp, AlertCircle, Activity } from 'lucide-react';

interface Stats {
  total_companies: number; active_companies: number; suspended_companies: number;
  trial_companies: number; total_users: number; super_admins: number;
  total_employees: number; active_employees: number;
  plan_distribution: Record<string, number>;
}

const PLAN_COLOR: Record<string, string> = {
  free: '#8790aa', starter: '#28c99a', growth: '#4f6df5',
  pro: '#8b5cf6', scale: '#f4c95d', enterprise: '#f46b72',
};

export default function SuperAdminDashboard() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = () => {
    setLoading(true); setError('');
    const token = localStorage.getItem('crm_token') ?? '';
    fetch('/api/v3/super-admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<Stats>; })
      .then(setStats).catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const kpis = stats ? [
    { label: 'Total Companies',    value: stats.total_companies,    icon: <Building2 size={18} />,  color: '#4f6df5', href: '/super-admin/companies' },
    { label: 'Active Companies',   value: stats.active_companies,   icon: <TrendingUp size={18} />, color: '#28c99a', href: '/super-admin/companies?status=active' },
    { label: 'Suspended',          value: stats.suspended_companies, icon: <AlertCircle size={18} />, color: '#f46b72', href: '/super-admin/companies?status=suspended' },
    { label: 'Total Users',        value: stats.total_users,        icon: <Users size={18} />,      color: '#8b5cf6', href: '/super-admin/users' },
    { label: 'Active Employees',   value: stats.active_employees,   icon: <UserCheck size={18} />,  color: '#f4c95d', href: '/super-admin/users' },
    { label: 'Super Admins',       value: stats.super_admins,       icon: <Activity size={18} />,   color: '#f46b72', href: '/super-admin/users' },
  ] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'white' }}>Platform Overview</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8790aa' }}>Real-time platform statistics across all companies</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#8790aa', fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(244,107,114,0.10)', border: '1px solid rgba(244,107,114,0.25)', color: '#f46b72', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#8790aa', fontSize: 13 }}>Loading platform statistics…</div>
      ) : (
        <>
          {/* KPI Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {kpis.map(k => (
              <Link key={k.label} href={k.href} style={{ textDecoration: 'none', background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.15s' }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: `${k.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color, flexShrink: 0 }}>{k.icon}</div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'white', lineHeight: 1 }}>{k.value.toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: '#8790aa', marginTop: 4 }}>{k.label}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* Plan Distribution */}
          {stats && Object.keys(stats.plan_distribution).length > 0 && (
            <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 16 }}>Plan Distribution</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(stats.plan_distribution).map(([plan, count]) => (
                  <div key={plan} style={{ padding: '8px 16px', borderRadius: 10, background: `${PLAN_COLOR[plan] || '#8790aa'}15`, border: `1px solid ${PLAN_COLOR[plan] || '#8790aa'}30` }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: PLAN_COLOR[plan] || '#8790aa' }}>{count}</div>
                    <div style={{ fontSize: 11, color: '#8790aa', textTransform: 'capitalize' }}>{plan}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>Quick Actions</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { href: '/super-admin/companies', label: 'Manage Companies', color: '#4f6df5' },
                { href: '/super-admin/users', label: 'Manage Users', color: '#28c99a' },
                { href: '/super-admin/audit-logs', label: 'View Audit Logs', color: '#8b5cf6' },
                { href: '/super-admin/billing', label: 'Billing Overview', color: '#f4c95d' },
                { href: '/super-admin/platform-health', label: 'Platform Health', color: '#f46b72' },
              ].map(a => (
                <Link key={a.href} href={a.href} style={{ padding: '9px 18px', borderRadius: 10, background: `${a.color}15`, border: `1px solid ${a.color}30`, color: a.color, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
