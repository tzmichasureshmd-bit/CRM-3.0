'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search, Edit2, Check, X, ChevronRight } from 'lucide-react';

interface Company {
  id: string; name: string; plan: string; status: string;
  created_at: string; employee_count: number;
  email?: string; industry?: string;
}

const PLANS    = ['free','starter','growth','pro','scale','enterprise'];
const STATUSES = ['active','suspended','trial'];
const PLAN_COLOR: Record<string,string>   = { free:'#8790aa', starter:'#28c99a', growth:'#4f6df5', pro:'#8b5cf6', scale:'#f4c95d', enterprise:'#f46b72' };
const STATUS_COLOR: Record<string,string> = { active:'#28c99a', suspended:'#f46b72', trial:'#f4c95d' };

export default function SuperAdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editId, setEditId]       = useState<string|null>(null);
  const [editData, setEditData]   = useState<{plan:string;status:string}>({plan:'',status:''});
  const [saving, setSaving]       = useState(false);

  const token = () => localStorage.getItem('crm_token') ?? '';

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (statusFilter) qs.set('status', statusFilter);
    fetch(`/api/v3/super-admin/companies?${qs}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() as Promise<Company[]> : [])
      .then(setCompanies).catch(() => setCompanies([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  const save = async (id: string) => {
    setSaving(true);
    await fetch(`/api/v3/super-admin/companies/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(editData),
    });
    setSaving(false); setEditId(null); load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'white' }}>Companies</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8790aa' }}>{companies.length} companies registered</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#8790aa', fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: '#111520', border: '1px solid rgba(255,255,255,0.08)', flex: 1, minWidth: 200 }}>
          <Search size={13} color="#8790aa" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies…"
            style={{ background: 'none', border: 'none', outline: 'none', color: 'white', fontSize: 13, flex: 1 }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: 10, background: '#111520', border: '1px solid rgba(255,255,255,0.08)', color: '#8790aa', fontSize: 13 }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ background: '#111520', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#8790aa', fontSize: 13 }}>Loading…</div>
        ) : companies.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8790aa', fontSize: 13 }}>No companies found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Company','Plan','Status','Employees','Created','Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8790aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < companies.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: '#8790aa', fontFamily: 'monospace' }}>{c.id.slice(0, 8)}…</div>
                    {c.industry && <div style={{ fontSize: 11, color: '#8790aa' }}>{c.industry}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {editId === c.id ? (
                      <select value={editData.plan} onChange={e => setEditData(d => ({ ...d, plan: e.target.value }))}
                        style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: '#0a0d14', color: 'white', fontSize: 12 }}>
                        {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${PLAN_COLOR[c.plan] || '#8790aa'}18`, color: PLAN_COLOR[c.plan] || '#8790aa', textTransform: 'capitalize' }}>{c.plan}</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {editId === c.id ? (
                      <select value={editData.status} onChange={e => setEditData(d => ({ ...d, status: e.target.value }))}
                        style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: '#0a0d14', color: 'white', fontSize: 12 }}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${STATUS_COLOR[c.status] || '#8790aa'}18`, color: STATUS_COLOR[c.status] || '#8790aa', textTransform: 'capitalize' }}>{c.status || 'active'}</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#8790aa' }}>{c.employee_count}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#8790aa' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {editId === c.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => save(c.id)} disabled={saving}
                          style={{ background: '#28c99a', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', color: 'white', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={11} /> Save
                        </button>
                        <button onClick={() => setEditId(null)}
                          style={{ background: 'rgba(244,107,114,0.15)', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', color: '#f46b72', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <X size={11} /> Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditId(c.id); setEditData({ plan: c.plan || 'free', status: c.status || 'active' }); }}
                          style={{ background: 'rgba(79,109,245,0.12)', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', color: '#4f6df5', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Edit2 size={11} /> Edit
                        </button>
                        <Link href={`/super-admin/companies/${c.id}`}
                          style={{ background: 'rgba(139,92,246,0.12)', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', color: '#8b5cf6', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                          <ChevronRight size={11} /> View
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
