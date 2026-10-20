'use client';
import { Search, Bell, Settings, LayoutGrid, MessageSquare, Sun, Moon, User, LogOut, X, Users, TrendingUp, MessageCircle } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, getContacts, getDeals, getConversations } from '@/lib/api-client';

interface CRMTopbarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

interface SearchResult {
  id: string;
  type: 'contact' | 'deal' | 'conversation';
  title: string;
  subtitle: string;
  href: string;
}

export function CRMTopbar({ theme, onToggleTheme }: CRMTopbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');
  const [userInitial, setUserInitial] = useState('U');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const router = useRouter();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setQuery('');
        setResults([]);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setQuery('');
        setResults([]);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load user from localStorage JWT — no Supabase call needed
  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      const raw = localStorage.getItem('crm_user');
      const parsed = raw ? JSON.parse(raw) as { user_id?: string; account_id?: string; role?: string; email?: string; full_name?: string } : null;
      const name = parsed?.full_name ?? parsed?.email?.split('@')[0] ?? stored.role ?? 'User';
      const email = parsed?.email ?? '';
      setUserName(name);
      setUserEmail(email);
      setUserInitial(name[0]?.toUpperCase() ?? 'U');
    }
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.location.replace('/login');
  };

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const [contactsRes, dealsRes, convsRes] = await Promise.all([
        getContacts({ search: q, limit: '4' }),
        getDeals({ search: q, limit: '3' }),
        getConversations({ search: q, limit: '3' }),
      ]);
      const out: SearchResult[] = [];
      for (const c of contactsRes.data ?? []) {
        out.push({ id: c.id, type: 'contact', title: c.name ?? c.phone ?? c.email ?? 'Unknown', subtitle: [c.phone, c.email, c.lead_status].filter(Boolean).join(' · '), href: '/contacts' });
      }
      for (const d of dealsRes.data ?? []) {
        const sym = d.currency === 'INR' ? '₹' : '$';
        out.push({ id: d.id, type: 'deal', title: d.title, subtitle: `${sym}${(d.value ?? 0).toLocaleString()} · ${d.status}`, href: '/pipeline-crm?tab=pipeline' });
      }
      for (const c of convsRes.data ?? []) {
        out.push({ id: c.id, type: 'conversation', title: (c.contacts as { name?: string } | null)?.name ?? 'Conversation', subtitle: `${c.platform ?? 'inbox'} · ${(c.last_message_text ?? '').slice(0, 40)}`, href: '/inbox' });
      }
      setResults(out);
      setSelectedIdx(0);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(val), 300);
  };

  const handleKeyNav = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[selectedIdx]) {
      router.push(results[selectedIdx].href);
      setSearchOpen(false); setQuery(''); setResults([]);
    }
  };

  const handleResultClick = (href: string) => {
    router.push(href);
    setSearchOpen(false); setQuery(''); setResults([]);
  };

  const TYPE_ICON: Record<string, React.ReactNode> = {
    contact:      <Users size={13} color="#4f6df5" />,
    deal:         <TrendingUp size={13} color="#28c99a" />,
    conversation: <MessageCircle size={13} color="#8b5cf6" />,
  };

  const TYPE_LABEL: Record<string, string> = {
    contact: 'Contact', deal: 'Deal', conversation: 'Conversation',
  };

  return (
    <>
      <header className="crm-topbar">
        {/* Search bar */}
        <div ref={searchRef} style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
          <div
            className="crm-search"
            onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            style={{ cursor: 'text' }}
          >
            <Search size={14} color="#2563EB" strokeWidth={2} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyNav}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search contacts, deals, conversations..."
              style={{ background: 'none', border: 'none', outline: 'none', flex: 1, fontSize: 13, color: 'var(--crm-text)' }}
            />
            {query ? (
              <button onClick={() => { setQuery(''); setResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--crm-text-muted)', display: 'flex' }}>
                <X size={13} />
              </button>
            ) : (
              <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', background: 'rgba(130,145,190,0.12)', border: '1px solid rgba(130,145,190,0.20)', borderRadius: 5, padding: '2px 5px', fontFamily: 'monospace', flexShrink: 0, whiteSpace: 'nowrap' }}>
                Ctrl+K
              </span>
            )}
          </div>

          {/* Search results dropdown */}
          {searchOpen && (query.length >= 2) && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 500,
              background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(130,145,190,0.18)', borderRadius: 14,
              boxShadow: '0 12px 40px rgba(0,0,0,0.16)', overflow: 'hidden',
            }}>
              {searching ? (
                <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--crm-text-muted)', textAlign: 'center' }}>
                  Searching...
                </div>
              ) : results.length === 0 ? (
                <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--crm-text-muted)', textAlign: 'center' }}>
                  No results for &quot;{query}&quot;
                </div>
              ) : (
                <div style={{ padding: '6px 0' }}>
                  {/* Group by type */}
                  {(['contact', 'deal', 'conversation'] as const).map(type => {
                    const group = results.filter(r => r.type === type);
                    if (!group.length) return null;
                    return (
                      <div key={type}>
                        <div style={{ padding: '6px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {TYPE_LABEL[type]}s
                        </div>
                        {group.map((r, _i) => {
                          const globalIdx = results.indexOf(r);
                          const isSelected = globalIdx === selectedIdx;
                          return (
                            <button
                              key={r.id}
                              onClick={() => handleResultClick(r.href)}
                              onMouseEnter={() => setSelectedIdx(globalIdx)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                padding: '9px 16px', background: isSelected ? 'rgba(79,109,245,0.08)' : 'none',
                                border: 'none', cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(130,145,190,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {TYPE_ICON[r.type]}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                                <div style={{ fontSize: 11, color: 'var(--crm-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{r.subtitle}</div>
                              </div>
                              {isSelected && (
                                <span style={{ fontSize: 10, color: 'var(--crm-text-muted)', background: 'rgba(130,145,190,0.12)', borderRadius: 5, padding: '2px 5px', flexShrink: 0 }}>Enter</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(130,145,190,0.10)', fontSize: 11, color: 'var(--crm-text-muted)', display: 'flex', gap: 12 }}>
                    <span>Arrow keys to navigate</span>
                    <span>Enter to open</span>
                    <span>Esc to close</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="crm-topbar-btn" aria-label="Messages" title="Inbox" onClick={() => router.push('/inbox')} style={{ color: 'var(--crm-text-nav)' }}>
            <MessageSquare size={15} strokeWidth={1.8} />
          </button>
          <button className="crm-topbar-btn" aria-label="Notifications" title="Notifications" onClick={() => router.push('/settings/notifications')} style={{ position: 'relative', color: 'var(--crm-text-nav)' }}>
            <Bell size={15} strokeWidth={1.8} />
            <span style={{ position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: '#DC2626', border: '1.5px solid white' }} />
          </button>
          <button className="crm-topbar-btn" aria-label="Settings" title="Settings" onClick={() => router.push('/settings')} style={{ color: 'var(--crm-text-nav)' }}>
            <Settings size={15} strokeWidth={1.8} />
          </button>
          <button className="crm-topbar-btn" aria-label="Apps" title="Dashboard" onClick={() => router.push('/dashboard')} style={{ color: 'var(--crm-text-nav)' }}>
            <LayoutGrid size={15} strokeWidth={1.8} />
          </button>

          {/* User dropdown */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <div className="crm-avatar crm-avatar-online" onClick={() => setDropdownOpen(v => !v)} style={{ cursor: 'pointer' }}>
              {userInitial}
            </div>

            {dropdownOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200,
                background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(130,145,190,0.18)', borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.14)', minWidth: 200, padding: '6px 0',
              }}>
                <div style={{ padding: '10px 14px 12px', borderBottom: '1px solid rgba(130,145,190,0.12)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6df5,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{userInitial}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3A' }}>{userName}</div>
                      <div style={{ fontSize: 11, color: '#627D98' }}>{userEmail}</div>
                    </div>
                  </div>
                  <button onClick={onToggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 8, background: 'rgba(130,145,190,0.10)', border: '1px solid rgba(130,145,190,0.16)', cursor: 'pointer', color: '#334E68', fontSize: 12, fontWeight: 500 }}>
                    {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
                    {theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                  </button>
                </div>
                <button onClick={() => { router.push('/settings/profile'); setDropdownOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#0B1F3A', fontSize: 13 }}>
                  <User size={14} /> Profile
                </button>
                <div style={{ borderTop: '1px solid rgba(130,145,190,0.12)', margin: '4px 0' }} />
                <button onClick={() => void handleSignOut()} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 13 }}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
