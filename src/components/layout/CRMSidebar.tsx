'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Brain, Users, UserCircle, Navigation, Target,
  Flame, TrendingUp, CalendarDays, MessageSquare, Smartphone,
  AtSign, Mail, Sparkles, Megaphone, Rss, Zap,
  Bot, BarChart3, Activity, FileBarChart, Settings, Key,
  Shield, CreditCard, Server, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

const NAV = [
  {
    id: 'home',
    items: [
      { href: '/dashboard', icon: Home, label: 'Command Center' },
      { href: '/ai-center', icon: Brain, label: 'AI Copilot' },
    ],
  },
  {
    id: 'customer', label: 'CUSTOMER',
    items: [
      { href: '/contacts', icon: Users, label: 'Contacts' },
      { href: '/customers', icon: UserCircle, label: 'Customer 360' },
      { href: '/journeys', icon: Navigation, label: 'Journeys' },
      { href: '/segments', icon: Target, label: 'Segments' },
    ],
  },
  {
    id: 'sales', label: 'SALES',
    items: [
      { href: '/leads', icon: Flame, label: 'Leads' },
      { href: '/pipeline-crm', icon: TrendingUp, label: 'Pipeline & CRM' },
      { href: '/follow-ups', icon: CalendarDays, label: 'Follow-ups' },
    ],
  },
  {
    id: 'conversations', label: 'CONVERSATIONS',
    items: [
      { href: '/inbox', icon: MessageSquare, label: 'Unified Inbox' },
      { href: '/inbox/whatsapp', icon: Smartphone, label: 'WhatsApp' },
      { href: '/inbox/instagram', icon: AtSign, label: 'Instagram' },
      { href: '/inbox/facebook', icon: MessageSquare, label: 'Facebook' },
      { href: '/inbox/email', icon: Mail, label: 'Email' },
    ],
  },
  {
    id: 'marketing', label: 'MARKETING',
    items: [
      { href: '/content-studio', icon: Sparkles, label: 'Content Studio' },
      { href: '/campaigns', icon: Megaphone, label: 'Campaigns' },
      { href: '/broadcasts', icon: Rss, label: 'Broadcasts' },
    ],
  },
  {
    id: 'automation', label: 'AUTOMATION',
    items: [
      { href: '/automations', icon: Zap, label: 'Automations' },
      { href: '/agents', icon: Bot, label: 'AI Agents' },
    ],
  },
  {
    id: 'intelligence', label: 'INTELLIGENCE',
    items: [
      { href: '/revenue', icon: BarChart3, label: 'Revenue Attribution' },
      { href: '/analytics', icon: Activity, label: 'Analytics' },
      { href: '/reports', icon: FileBarChart, label: 'Reports' },
    ],
  },
  {
    id: 'admin', label: 'ADMIN',
    items: [
      { href: '/settings', icon: Settings, label: 'Settings' },
      { href: '/settings/integrations', icon: Key, label: 'Integrations' },
      { href: '/settings/security', icon: Shield, label: 'Security' },
      { href: '/settings/billing', icon: CreditCard, label: 'Billing' },
      { href: '/settings/health', icon: Server, label: 'Platform Health' },
    ],
  },
] as const;

type NavItem = { href: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string };

function NavItemLink({ href, icon: Icon, label }: NavItem) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  return (
    <Link href={href} className={`crm-nav-item${active ? ' active' : ''}`}>
      <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
      <span>{label}</span>
    </Link>
  );
}

function NavSection({ section }: { section: typeof NAV[number] }) {
  const [open, setOpen] = useState(true);

  if (!('label' in section)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {(section.items as readonly NavItem[]).map(item => (
          <NavItemLink key={item.href} {...item} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setOpen(v => !v)} className="crm-nav-section-label">
        <span>{section.label}</span>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(section.items as readonly NavItem[]).map(item => (
            <NavItemLink key={item.href} {...item} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CRMSidebarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function CRMSidebar({ theme: _theme, onToggleTheme: _onToggleTheme }: CRMSidebarProps) {
  return (
    <aside className="crm-sidebar">
      <div className="crm-sidebar-brand">
        <div className="crm-brand-icon">
          <Brain size={18} color="white" strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-text-strong)', letterSpacing: '-0.01em' }}>
            TZMICHA
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--crm-text-muted)', letterSpacing: '0.04em' }}>
            CRM 3.0
          </div>
        </div>
      </div>

      <nav className="crm-sidebar-nav">
        {NAV.map(section => (
          <NavSection key={section.id} section={section} />
        ))}
      </nav>
    </aside>
  );
}
