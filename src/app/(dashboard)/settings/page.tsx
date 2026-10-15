'use client';

import { User, Bell, Shield, Key, CreditCard, Server, Smartphone, AtSign, Mail, MessageSquare, ChevronRight } from 'lucide-react';
import Link from 'next/link';

const SECTIONS = [
  {
    title: 'Account',
    items: [
      { icon: <User size={16} />, label: 'Profile', desc: 'Name, avatar, timezone', color: '#4d7cff', href: '/settings/profile' },
      { icon: <Bell size={16} />, label: 'Notifications', desc: 'Email, push, in-app alerts', color: '#8b5cf6', href: '/settings/notifications' },
    ],
  },
  {
    title: 'Integrations',
    items: [
      { icon: <Smartphone size={16} />, label: 'WhatsApp Business', desc: 'Connect WhatsApp API', color: '#25D366', href: '/settings/integrations' },
      { icon: <AtSign size={16} />, label: 'Instagram', desc: 'Connect Instagram DMs', color: '#E1306C', href: '/settings/integrations' },
      { icon: <MessageSquare size={16} />, label: 'Facebook', desc: 'Connect Facebook Messenger', color: '#1877F2', href: '/settings/integrations' },
      { icon: <Mail size={16} />, label: 'Email', desc: 'SMTP / Gmail / Outlook', color: '#8b5cf6', href: '/settings/integrations' },
    ],
  },
  {
    title: 'Security',
    items: [
      { icon: <Shield size={16} />, label: 'Security', desc: 'Password, 2FA, sessions', color: '#28c99a', href: '/settings/security' },
      { icon: <Key size={16} />, label: 'API Keys', desc: 'Manage API access keys', color: '#f4c95d', href: '/settings/security' },
    ],
  },
  {
    title: 'Billing & System',
    items: [
      { icon: <CreditCard size={16} />, label: 'Billing', desc: 'Plan, usage, invoices', color: '#f46b72', href: '/settings/billing' },
      { icon: <Server size={16} />, label: 'Platform Health', desc: 'System status, diagnostics', color: '#4f6df5', href: '/settings/health' },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 750, color: 'var(--crm-text)', margin: 0 }}>Settings</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crm-text-secondary)' }}>Manage your CRM configuration</p>
      </div>

      {SECTIONS.map(section => (
        <div key={section.title}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{section.title}</div>
          <div className="crm-glass" style={{ overflow: 'hidden' }}>
            {section.items.map((item, i) => {
              const inner = (
                <>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.color, flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-text)' }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>{item.desc}</div>
                  </div>
                  <ChevronRight size={16} color="var(--crm-text-muted)" />
                </>
              );
              const sharedStyle = {
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
                textAlign: 'left' as const, textDecoration: 'none',
                borderBottom: i < section.items.length - 1 ? '1px solid rgba(130,145,190,0.10)' : 'none',
              };
              return item.href ? (
                <Link key={item.label} href={item.href} style={sharedStyle}>{inner}</Link>
              ) : (
                <button key={item.label} style={sharedStyle}>{inner}</button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
