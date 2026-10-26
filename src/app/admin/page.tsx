'use client';
import { useEffect, useState } from 'react';
import { Building2, Users, UserCheck, RefreshCw } from 'lucide-react';

interface Stats { total_tenants: number; total_users: number; total_employees: number; }

export default function AdminPage() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = () => {
    setLoading(true); setError('');
    const token = localStorage.getItem('crm_token') ?? '';
    const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
    fetch(`${BACKEND}/api/v1/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<Stats>; })
      .then(setStats).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const cards = stats ? [
    { label:'Total Tenants',   value: stats.total_tenants,   icon:<Building2 size={20}/>,  color:'#4f6df5' },
    { label:'Total Users',     value: stats.total_users,     icon:<Users size={20}/>,      color:'#28c99a' },
    { label:'Total Employees', value: stats.total_employees, icon:<UserCheck size={20}/>,  color:'#8b5cf6' },
  ] : [];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ margin:0, fontSize:24, fontWeight:750, color:'white' }}>Admin Overview</h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'#8790aa' }}>Platform-wide statistics</p>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:9, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', color:'#8790aa', fontSize:12, cursor:'pointer' }}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      {error && <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(244,107,114,0.10)', border:'1px solid rgba(244,107,114,0.25)', color:'#f46b72', fontSize:13 }}>Error: {error} — backend may require super admin flag set in DB.</div>}

      {loading ? (
        <div style={{ color:'#8790aa', fontSize:13 }}>Loading…</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
          {cards.map(c => (
            <div key={c.label} style={{ background:'#161b27', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'24px 20px', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ width:48, height:48, borderRadius:14, background:`${c.color}18`, display:'flex', alignItems:'center', justifyContent:'center', color:c.color }}>{c.icon}</div>
              <div>
                <div style={{ fontSize:28, fontWeight:800, color:'white' }}>{c.value.toLocaleString()}</div>
                <div style={{ fontSize:12, color:'#8790aa', marginTop:2 }}>{c.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background:'#161b27', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'20px 24px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'white', marginBottom:12 }}>Quick Links</div>
        <div style={{ display:'flex', gap:10 }}>
          {[{href:'/admin/tenants',label:'Manage Tenants',color:'#4f6df5'},{href:'/admin/users',label:'Manage Users',color:'#28c99a'}].map(l => (
            <a key={l.href} href={l.href} style={{ padding:'8px 16px', borderRadius:9, background:`${l.color}15`, border:`1px solid ${l.color}30`, color:l.color, fontSize:13, fontWeight:600, textDecoration:'none' }}>{l.label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
