'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Users, LogOut, Shield,
  ClipboardList, CreditCard, Activity, Settings,
} from 'lucide-react';

const NAV = [
  { href: '/super-admin',              icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/super-admin/companies',    icon: Building2,       label: 'Companies' },
  { href: '/super-admin/users',        icon: Users,           label: 'Users' },
  { href: '/super-admin/audit-logs',   icon: ClipboardList,   label: 'Audit Logs' },
  { href: '/super-admin/billing',      icon: CreditCard,      label: 'Billing' },
  { href: '/super-admin/platform-health', icon: Activity,     label: 'Platform Health' },
];

type State = 'loading' | 'authorized' | 'denied';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('loading');
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (!token) { window.location.replace('/login'); return; }
    // Verify super admin by calling a protected endpoint — backend re-checks DB
    fetch('/api/v3/super-admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (r.status === 403 || r.status === 401) setState('denied');
      else if (r.ok) setState('authorized');
      else setState('denied');
    }).catch(() => setState('denied'));
  }, []);

  if (state === 'loading') return (
    <div style={{ minHeight: '100vh', background: '#0a0d14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#8790aa', fontSize: 13 }}>Verifying access…</div>
    </div>
  );

  if (state === 'denied') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d14' }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <Shield size={48} style={{ marginBottom: 16, color: '#f46b72', display: 'block', margin: '0 auto 16px' }} />
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 750 }}>Access Denied</h2>
        <p style={{ color: '#8790aa', marginBottom: 24, fontSize: 14 }}>
          Super admin privileges are required. This access is granted only through a trusted administrative process.
        </p>
        <Link href="/dashboard" style={{ color: '#4f6df5', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          ← Return to CRM
        </Link>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0d14', fontFamily: 'var(--font-sans, system-ui)' }}>
      {/* Sidebar */}
      <aside style={{ width: 230, background: '#111520', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>TZMICHA</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f46b72', letterSpacing: '0.10em', marginTop: 3, textTransform: 'uppercase' }}>Super Admin</div>
        </div>
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/super-admin' && pathname.startsWith(href));
            return (
              <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, textDecoration: 'none', background: active ? 'rgba(244,107,114,0.12)' : 'transparent', color: active ? '#f46b72' : '#8790aa', fontSize: 13, fontWeight: active ? 700 : 500, transition: 'all 0.15s' }}>
                <Icon size={15} /> {label}
              </Link>
            );
          })}
        </nav>
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, textDecoration: 'none', color: '#8790aa', fontSize: 13 }}>
            <Settings size={15} /> CRM Settings
          </Link>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, textDecoration: 'none', color: '#8790aa', fontSize: 13 }}>
            <LogOut size={15} /> Back to CRM
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '32px 36px', overflowY: 'auto', maxHeight: '100vh' }}>
        {children}
      </main>
    </div>
  );
}
