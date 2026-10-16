'use client';

import Link from 'next/link';
import { ShieldCheck, ShieldAlert, Gauge, Wrench, ArrowUpRight } from 'lucide-react';
import type { AgentLite } from './types';

export function PermissionsPanel({ agents, toolsAvailable }: { agents: AgentLite[]; toolsAvailable: number }) {
  const active = agents.filter(a => a.enabled);
  const approvals = active.filter(a => a.requires_approval).length;
  const auto = active.length - approvals;
  const cap = active.reduce((m, a) => Math.max(m, a.max_actions_per_run ?? 0), 0);

  const tiles = [
    { label: 'Approval gated', value: String(approvals), icon: ShieldAlert, accent: '#f59e0b' },
    { label: 'Auto-execute', value: String(auto), icon: ShieldCheck, accent: '#28c99a' },
    { label: 'Action cap / run', value: String(cap), icon: Gauge, accent: '#4d7cff' },
    { label: 'Tools available', value: String(toolsAvailable), icon: Wrench, accent: '#8b5cf6' },
  ];

  return (
    <section aria-label="Permissions and approvals">
      <header className="crm-auto-section-head">
        <div>
          <h2 className="crm-auto-section-title">Permissions</h2>
          <p className="crm-auto-section-sub">Guardrails applied to every agent run</p>
        </div>
      </header>

      <div className="crm-auto-perm-tiles">
        {tiles.map(t => (
          <div key={t.label} className="crm-auto-perm-tile" style={{ '--accent': t.accent } as React.CSSProperties}>
            <span className="crm-auto-perm-tile-icon"><t.icon size={15} color={t.accent} /></span>
            <div>
              <div className="crm-auto-perm-tile-value">{t.value}</div>
              <div className="crm-auto-perm-tile-label">{t.label}</div>
            </div>
          </div>
        ))}
      </div>

      {active.length === 0 ? (
        <div className="crm-auto-perm-empty">
          <ShieldCheck size={20} />
          <p>No active agents — permissions apply once an agent is enabled.</p>
          <Link href="/agents" className="crm-auto-link">Go to AI Agents <ArrowUpRight size={13} /></Link>
        </div>
      ) : (
        <ul className="crm-auto-perm-list">
          {active.map(a => (
            <li key={a.id}>
              <span className="crm-auto-perm-name">{a.name}</span>
              <span className={`crm-auto-perm-badge ${a.requires_approval ? 'gated' : 'auto'}`}>
                {a.requires_approval ? 'Approval' : 'Auto'}
              </span>
              <span className="crm-auto-perm-meta">{a.allowed_tools.length} tools · ≤{a.max_actions_per_run}/run</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
