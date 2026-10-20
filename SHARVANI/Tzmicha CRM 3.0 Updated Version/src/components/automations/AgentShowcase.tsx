'use client';

import Link from 'next/link';
import {
  Briefcase, Headphones, Megaphone, CircleDollarSign, Settings2, Bot, ArrowUpRight,
} from 'lucide-react';
import type { AgentLite } from './types';

interface RoleDef {
  key: string;
  label: string;
  blurb: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  accent: string;
  types: string[];
}

const ROLES: RoleDef[] = [
  { key: 'sales', label: 'Sales Agents', blurb: 'Qualify leads and drive the pipeline', icon: Briefcase, accent: '#4d7cff', types: ['sales_assistant', 'lead_qualification'] },
  { key: 'support', label: 'Support Agents', blurb: 'Resolve issues and protect retention', icon: Headphones, accent: '#28c99a', types: ['customer_support', 'customer_success'] },
  { key: 'marketing', label: 'Marketing Agents', blurb: 'Draft campaigns and content', icon: Megaphone, accent: '#8b5cf6', types: ['content'] },
  { key: 'finance', label: 'Finance Agents', blurb: 'Watch revenue and deal health', icon: CircleDollarSign, accent: '#f59e0b', types: [] },
  { key: 'admin', label: 'Admin Agents', blurb: 'Keep tasks and calendars on track', icon: Settings2, accent: '#28d7df', types: ['followup', 'appointment'] },
  { key: 'custom', label: 'Custom Agents', blurb: 'Bespoke agents for your workflows', icon: Bot, accent: '#ec78b5', types: [] },
];

export function AgentShowcase({ agents }: { agents: AgentLite[] }) {
  const matchedIds = new Set<string>();
  const byRole: Record<string, AgentLite[]> = {};

  for (const role of ROLES) {
    if (role.types.length === 0) { byRole[role.key] = []; continue; }
    const list = agents.filter(a => role.types.includes(a.type));
    list.forEach(a => matchedIds.add(a.id));
    byRole[role.key] = list;
  }
  byRole.custom = agents.filter(a => !matchedIds.has(a.id));

  return (
    <section aria-label="AI agent roles">
      <header className="crm-auto-section-head">
        <div>
          <h2 className="crm-auto-section-title">AI Agent Fleet</h2>
          <p className="crm-auto-section-sub">Specialized agents that power your automations</p>
        </div>
        <Link href="/agents" className="crm-auto-link">Manage agents <ArrowUpRight size={13} /></Link>
      </header>

      <div className="crm-auto-agent-grid">
        {ROLES.map(role => {
          const list = byRole[role.key] ?? [];
          const enabled = list.filter(a => a.enabled).length;
          return (
            <article key={role.key} className="crm-auto-agent-card" style={{ '--accent': role.accent } as React.CSSProperties}>
              <div className="crm-auto-agent-head">
                <span className="crm-auto-agent-icon"><role.icon size={18} color={role.accent} /></span>
                <span className="crm-auto-agent-count">
                  {list.length > 0 ? `${enabled}/${list.length}` : '0'}
                </span>
              </div>
              <h3 className="crm-auto-agent-title">{role.label}</h3>
              <p className="crm-auto-agent-blurb">{role.blurb}</p>

              {list.length === 0 ? (
                <Link href="/agents" className="crm-auto-agent-empty">No agents yet · Set up</Link>
              ) : (
                <ul className="crm-auto-agent-list">
                  {list.slice(0, 3).map(a => (
                    <li key={a.id}>
                      <span className={`crm-auto-agent-dot ${a.enabled ? 'on' : ''}`} />
                      <span className="crm-auto-agent-name">{a.name}</span>
                      <span className="crm-auto-agent-runs">{a.execution_count} runs</span>
                    </li>
                  ))}
                  {list.length > 3 && <li className="crm-auto-agent-more">+{list.length - 3} more</li>}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
