'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, Shield, ShieldOff } from 'lucide-react';

interface AdminUser { user_id:string; account_id:string; full_name:string; email:string; role:string; avatar_url:string; created_at:string; is_super_admin:boolean; }

export default function AdminUsersPage() {
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string|null>(null);

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
  const token   = () => localStorage.getItem('crm_token') ?? '';
  const headers = () => ({ Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' });

  const load = () => {
    setLoading(true);
    fetch(`${BACKEND}/api/v1/admin/users`, { headers: headers() })
      .then(r => r.ok ? r.json() as Promise<AdminUser[]> : [])
      .then(setUsers).catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleSuperAdmin = async (userId: string, current: boolean) => {
    setToggling(userId);
    await fetch(`${BACKEND}/api/v1/admin/users/${userId}/super-admin`, {
      method:'PATCH', headers: headers(), body: JSON.stringify({ is_super_admin: !current })
    });
    setToggling(null); load();
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ margin:0, fontSize:24, fontWeight:750, color:'white' }}>Users</h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'#8790aa' }}>{users.length} users across all tenants</p>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:9, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', color:'#8790aa', fontSize:12, cursor:'pointer' }}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      <div style={{ background:'#161b27', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:32, textAlign:'center', color:'#8790aa', fontSize:13 }}>Loading…</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                {['User','Role','Tenant ID','Joined','Super Admin'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#8790aa', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.user_id} style={{ borderBottom: i < users.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/>
                      ) : (
                        <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(79,109,245,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#4f6df5' }}>
                          {(u.full_name||u.email||'?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'white' }}>{u.full_name || '—'}</div>
                        <div style={{ fontSize:11, color:'#8790aa' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:700, background:'rgba(79,109,245,0.12)', color:'#4f6df5', textTransform:'capitalize' }}>{u.role}</span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:11, color:'#8790aa', fontFamily:'monospace' }}>{u.account_id?.slice(0,8)}…</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'#8790aa' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <button onClick={() => toggleSuperAdmin(u.user_id, u.is_super_admin)}
                      disabled={toggling === u.user_id}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background: u.is_super_admin ? 'rgba(244,107,114,0.12)' : 'rgba(40,201,154,0.10)', color: u.is_super_admin ? '#f46b72' : '#28c99a', opacity: toggling===u.user_id ? 0.6 : 1 }}>
                      {u.is_super_admin ? <><ShieldOff size={12}/> Revoke</> : <><Shield size={12}/> Grant</>}
                    </button>
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
