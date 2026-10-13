'use client';

import { useState, useEffect } from 'react';
import { CRMSidebar } from '@/components/layout/CRMSidebar';
import { CRMTopbar } from '@/components/layout/CRMTopbar';
import { FloatingCopilot } from '@/components/chat/FloatingCopilot';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

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
