'use client';

import { useState, useEffect } from 'react';
import { CRMSidebar } from '@/components/layout/CRMSidebar';
import { CRMTopbar } from '@/components/layout/CRMTopbar';
import { FloatingCopilot } from '@/components/chat/FloatingCopilot';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
<<<<<<< Updated upstream
=======
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('crm_token');
    if (token) { setReady(true); return; }
    // No legacy token — fall back to a live Supabase session (e.g. one created
    // server-side) before deciding to redirect, to avoid a login redirect loop.
    void (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) {
          localStorage.setItem('crm_token', data.session.access_token);
          setReady(true);
        } else {
          window.location.replace('/login');
        }
      } catch {
        if (active) window.location.replace('/login');
      }
    })();
    return () => { active = false; };
  }, []);
>>>>>>> Stashed changes

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  return (
    <div className="crm-app">
      <div className="crm-shell">
        <div className="crm-sidebar-wrap">
          <CRMSidebar theme={theme} onToggleTheme={toggleTheme} />
        </div>
        <div className="crm-main">
          <CRMTopbar theme={theme} onToggleTheme={toggleTheme} />
          <div className="crm-content">
            {children}
          </div>
        </div>
      </div>
      {/* Floating AI Copilot - appears on all pages */}
      <FloatingCopilot />
    </div>
  );
}
