'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, Edit2, Check, X } from 'lucide-react';

interface Tenant { id:string; name:string; plan:string; status:string; created_at:string; }

const PLANS   = ['free','starter','pro','enterprise'];
const STATUSES = ['active','suspended'];
const PLAN_COLOR: Record<string,string> = { free:'#8790aa', starter:'#28c99a', pro:'#4f6df5', enterprise:'#f4c95d' };

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId]   = useState<string|null>(null);
  const [editData, setEditData] = useState<{plan:string;status:string}>({plan:'',status:''});

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
  const token   = () => localStorage.getItem('crm_token') ?? '';
  const headers = () => ({ Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' });

  const load = () => {
    setLoading(true);
    fetch(`${BACKEND}/api/v1/admin/tenants`, { headers: headers() })
      .then(r => r.ok ? r.json() as Promise<Tenant[]> : [])
      .then(setTenants).catch(() => setTenants([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const save = async (id: string) => {
    await fetch(`${BACKEND}/api/v1/admin/tenants/${id}`, {
      method:'PATCH', headers: headers(), body: JSON.stringify(editData)
    });
    setEditId(null); load();
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ margin:0, fontSize:24, fontWeight:750, color:'white' }}>Tenants</h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'#8790aa' }}>{tenants.length} companies registered</p>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:9, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', color:'#8790aa', fontSize:12, cursor:'pointer' }}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      <div style={{ background:'#161b27', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:32, textAlign:'center', color:'#8790aa', fontSize:13 }}>Loading…</div>
        ) : tenants.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#8790aa', fontSize:13 }}>No tenants found.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                {['Company','Plan','Status','Created','Actions'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#8790aa', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: i < tenants.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'white' }}>{t.name}</div>
                    <div style={{ fontSize:11, color:'#8790aa', fontFamily:'monospace' }}>{t.id.slice(0,8)}…</div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    {editId === t.id ? (
                      <select value={editData.plan} onChange={e => setEditData(d => ({...d, plan:e.target.value}))}
                        style={{ padding:'4px 8px', borderRadius:7, border:'1px solid rgba(255,255,255,0.15)', background:'#0f1117', color:'white', fontSize:12 }}>
                        {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span style={{ padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:700, background:`${PLAN_COLOR[t.plan]||'#8790aa'}18`, color: PLAN_COLOR[t.plan]||'#8790aa', textTransform:'capitalize' }}>{t.plan}</span>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    {editId === t.id ? (
                      <select value={editData.status} onChange={e => setEditData(d => ({...d, status:e.target.value}))}
                        style={{ padding:'4px 8px', borderRadius:7, border:'1px solid rgba(255,255,255,0.15)', background:'#0f1117', color:'white', fontSize:12 }}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span style={{ padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:700, background: t.status==='active' ? 'rgba(40,201,154,0.12)' : 'rgba(244,107,114,0.12)', color: t.status==='active' ? '#28c99a' : '#f46b72', textTransform:'capitalize' }}>{t.status||'active'}</span>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#8790aa' }}>{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={{ padding:'12px 16px' }}>
                    {editId === t.id ? (
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => save(t.id)} style={{ background:'#28c99a', border:'none', borderRadius:7, padding:'5px 10px', cursor:'pointer', color:'white', fontSize:12, display:'flex', alignItems:'center', gap:4 }}><Check size={11}/> Save</button>
                        <button onClick={() => setEditId(null)} style={{ background:'rgba(244,107,114,0.15)', border:'none', borderRadius:7, padding:'5px 10px', cursor:'pointer', color:'#f46b72', fontSize:12, display:'flex', alignItems:'center', gap:4 }}><X size={11}/> Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditId(t.id); setEditData({plan:t.plan||'free', status:t.status||'active'}); }}
                        style={{ background:'rgba(79,109,245,0.12)', border:'none', borderRadius:7, padding:'5px 10px', cursor:'pointer', color:'#4f6df5', fontSize:12, display:'flex', alignItems:'center', gap:4 }}>
                        <Edit2 size={11}/> Edit
                      </button>
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
