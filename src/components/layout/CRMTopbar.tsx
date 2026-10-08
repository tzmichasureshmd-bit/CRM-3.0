'use client';
import { Search, Bell, Settings, LayoutGrid, MessageSquare, Sun, Moon, User, LogOut } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface CRMTopbarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function CRMTopbar({ theme, onToggleTheme }: CRMTopbarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="crm-topbar">
      <div className="crm-search">
        <Search size={14} color="var(--crm-text-muted)" strokeWidth={2} />
        <input type="text" placeholder="Search customers, leads, conversations... (Ctrl + K)" />
        <kbd style={{
          fontSize: 10, color: 'var(--crm-text-muted)',
          background: 'rgba(130,145,190,0.12)', border: '1px solid rgba(130,145,190,0.20)',
          borderRadius: 5, padding: '2px 5px', fontFamily: 'monospace', flexShrink: 0,
        }}>⌘K</kbd>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="crm-topbar-btn" aria-label="Messages">
          <MessageSquare size={15} strokeWidth={1.8} />
        </button>
        <button className="crm-topbar-btn" aria-label="Notifications" style={{ position: 'relative' }}>
          <Bell size={15} strokeWidth={1.8} />
          <span style={{
            position: 'absolute', top: 7, right: 7,
            width: 7, height: 7, borderRadius: '50%',
            background: '#f46b72', border: '1.5px solid white',
          }} />
        </button>
        <button className="crm-topbar-btn" aria-label="Settings">
          <Settings size={15} strokeWidth={1.8} />
        </button>
        <button className="crm-topbar-btn" aria-label="Apps">
          <LayoutGrid size={15} strokeWidth={1.8} />
        </button>

        <div ref={ref} style={{ position: 'relative' }}>
          <div
            className="crm-avatar crm-avatar-online"
            onClick={() => setOpen(v => !v)}
          >J</div>

          {open && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200,
              background: 'var(--crm-surface, rgba(255,255,255,0.95))',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(130,145,190,0.18)',
              borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
              minWidth: 200, padding: '6px 0',
            }}>
              <div style={{ padding: '10px 14px 12px', borderBottom: '1px solid rgba(130,145,190,0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>J</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--crm-text)' }}>John Doe</div>
                    <div style={{ fontSize: 11, color: 'var(--crm-text-muted)' }}>Team Lead</div>
                  </div>
                </div>
                <button
                  onClick={onToggleTheme}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '6px 8px', borderRadius: 8,
                    background: 'rgba(130,145,190,0.10)', border: '1px solid rgba(130,145,190,0.16)',
                    cursor: 'pointer', color: 'var(--crm-text-secondary)', fontSize: 12, fontWeight: 500,
                  }}
                >
                  {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
                  {theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                </button>
              </div>

              <button style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--crm-text)', fontSize: 13,
              }}>
                <User size={14} /> Profile
              </button>

              <div style={{ borderTop: '1px solid rgba(130,145,190,0.12)', margin: '4px 0' }} />

              <button style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
                color: '#f46b72', fontSize: 13,
              }}>
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
