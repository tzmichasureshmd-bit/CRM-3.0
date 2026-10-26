'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Users, Crown, CreditCard, ClipboardList } from 'lucide-react';
import { use } from 'react';

interface CompanyDetail {
  id: string; name: string; plan: string; status: string; created_at: string;
  email?: string; phone?: string; website?: string; industry?: string;
  owner: { full_name?: string; email?: string };
  employees: { id: string; name: string; email: string; role: string; is_active: boolean }[];
  billing: { plan?: string; plan_started_at?: string };
  recent_audit: { id: string; action: string; actor_name: string; result: string; created_at: string }[];
}

const STATUS_COLOR: Record<string,string> = { active:'#28c99a', suspended:'#f46b72', trial:'#f4c95d' };
const RESULT_COLOR: Record<string,string>  = { success:'#28c99a', failure:'#f46b72', denied:'#f4c95d' };

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = () => {
    setLoading(true); setError('');
    const token = localStorage.getItem('crm_token') ?? '';
    fetch(`/api/v3/super-admin/companies/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<CompanyDetail>; })
      .then(setCompany).catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div style={{ color: '#8790aa', fontSize: 13, padding: 32 }}>Loading…</div>;
  if (error)   return <div style={{ color: '#f46b72', fontSize: 13, padding: 32 }}>Error: {error}</div>;
  if (!company) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/super-admin/companies" style={{ color: '#8790aa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <ChevronLeft size={14} /> Companies
          </Link>
          <span style={{ color: '#8790aa' }}>/</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'white' }}>{company.name}</h1>
          <span style={{ padding: '3px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: `${STATUS_COLOR[company.status] || '#8790aa'}18`, color: STATUS_COLOR[company.status] || '#8790aa', textTransform: 'capitalize' }}>{company.status}</span>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#8790aa', fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Company Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8790aa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Company Details</div>
          {[
            { label: 'Company ID', value: company.id, mono: true },
            { label: 'Plan', value: company.plan },
            { label: 'Industry', value: company.industry || '—' },
            { label: 'Email', value: company.email || '—' },
            { label: 'Created', value: new Date(company.created_at).toLocaleDateString() },
          ].map(d => (
            <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: '#8790aa' }}>{d.label}</span>
              <span style={{ fontSize: 12, color: 'white', fontFamily: d.mono ? 'monospace' : undefined, maxWidth: 200, textAlign: 'right', wordBreak: 'break-all' }}>{d.value}</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8790aa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Crown size={12} /> Owner
          </div>
          {company.owner?.full_name || company.owner?.email ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 4 }}>{company.owner.full_name || '—'}</div>
              <div style={{ fontSize: 12, color: '#8790aa' }}>{company.owner.email}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#8790aa' }}>No owner found</div>
          )}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8790aa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CreditCard size={12} /> Billing
            </div>
            <div style={{ fontSize: 13, color: 'white' }}>Plan: <strong>{company.billing?.plan || company.plan}</strong></div>
            {company.billing?.plan_started_at && (
              <div style={{ fontSize: 12, color: '#8790aa', marginTop: 4 }}>Since: {new Date(company.billing.plan_started_at).toLocaleDateString()}</div>
            )}
          </div>
        </div>
      </div>

      {/* Employees */}
      <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={14} color="#8790aa" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Employees ({company.employees.length})</span>
        </div>
        {company.employees.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8790aa', fontSize: 13 }}>No employees.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Name','Email','Role','Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8790aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {company.employees.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: i < company.employees.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: 'white' }}>{e.name}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#8790aa' }}>{e.email}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(79,109,245,0.12)', color: '#4f6df5', textTransform: 'capitalize' }}>{e.role}</span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: e.is_active ? 'rgba(40,201,154,0.12)' : 'rgba(135,144,170,0.12)', color: e.is_active ? '#28c99a' : '#8790aa' }}>
                      {e.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Audit */}
      <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardList size={14} color="#8790aa" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Recent Activity</span>
        </div>
        {company.recent_audit.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8790aa', fontSize: 13 }}>No audit events.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Action','Actor','Result','Time'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8790aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {company.recent_audit.map((a, i) => (
                <tr key={a.id} style={{ borderBottom: i < company.recent_audit.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'white', fontFamily: 'monospace' }}>{a.action}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#8790aa' }}>{a.actor_name || '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${RESULT_COLOR[a.result] || '#8790aa'}15`, color: RESULT_COLOR[a.result] || '#8790aa' }}>{a.result}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 11, color: '#8790aa' }}>{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
