'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, Users, LogOut, Shield } from 'lucide-react';

const NAV = [
  { href:'/admin',         icon: LayoutDashboard, label:'Overview' },
  { href:'/admin/tenants', icon: Building2,        label:'Tenants' },
  { href:'/admin/users',   icon: Users,            label:'Users' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady]   = useState(false);
  const [denied, setDenied] = useState(false);
  const pathname            = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (!token) { window.location.replace('/login'); return; }
    // Decode JWT to check is_super_admin — backend enforces it too
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      // We rely on backend to enforce; just check token exists
      if (!payload.sub) { setDenied(true); return; }
    } catch { setDenied(true); return; }
    setReady(true);
  }, []);

  if (denied) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ textAlign:'center', color:'white' }}>
        <Shield size={48} style={{ marginBottom:16, color:'#f46b72' }}/>
        <h2 style={{ margin:'0 0 8px' }}>Access Denied</h2>
        <p style={{ color:'#8790aa', marginBottom:20 }}>Super admin access required.</p>
        <Link href="/dashboard" style={{ color:'#4f6df5', textDecoration:'none', fontSize:14 }}>← Back to CRM</Link>
      </div>
    </div>
  );

  if (!ready) return (
    <div style={{ minHeight:'100vh', background:'#0f1117', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#8790aa', fontSize:13 }}>Loading…</div>
    </div>
  );

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0f1117', fontFamily:'var(--font-sans, system-ui)' }}>
      {/* Sidebar */}
      <aside style={{ width:220, background:'#161b27', borderRight:'1px solid rgba(255,255,255,0.06)', display:'flex', flexDirection:'column', padding:'24px 0' }}>
        <div style={{ padding:'0 20px 24px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize:13, fontWeight:800, color:'white', letterSpacing:'-0.01em' }}>TZMICHA</div>
          <div style={{ fontSize:10, fontWeight:600, color:'#f46b72', letterSpacing:'0.08em', marginTop:2 }}>SUPER ADMIN</div>
        </div>
        <nav style={{ flex:1, padding:'16px 12px', display:'flex', flexDirection:'column', gap:4 }}>
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, textDecoration:'none', background: active ? 'rgba(244,107,114,0.12)' : 'transparent', color: active ? '#f46b72' : '#8790aa', fontSize:13, fontWeight: active ? 700 : 500, transition:'all 0.15s' }}>
                <Icon size={15}/> {label}
              </Link>
            );
          })}
        </nav>
        <div style={{ padding:'16px 12px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <Link href="/dashboard" style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, textDecoration:'none', color:'#8790aa', fontSize:13 }}>
            <LogOut size={15}/> Back to CRM
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, padding:32, overflowY:'auto' }}>
        {children}
      </main>
    </div>
  );
}
