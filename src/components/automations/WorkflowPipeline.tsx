'use client';

import {
  MousePointerClick, Bot, Database, Cpu, ClipboardCheck, Gauge, ChevronRight,
} from 'lucide-react';

export interface PipelineMetrics {
  activeAutomations: number;
  totalAutomations: number;
  enabledAgents: number;
  totalAgents: number;
  toolsInUse: number;
  totalExecutions: number;
  completedExecutions: number;
  successRate: number;
  lastRunAt: string | null;
}

interface Stage {
  key: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  accent: string;
  value: string;
  sub: string;
}

export function WorkflowPipeline({ metrics }: { metrics: PipelineMetrics }) {
  const live = metrics.activeAutomations > 0 || metrics.enabledAgents > 0 || metrics.totalExecutions > 0;

  const stages: Stage[] = [
    { key: 'trigger', label: 'Trigger', desc: 'Listening for CRM events', icon: MousePointerClick, accent: '#4d7cff', value: String(metrics.activeAutomations), sub: metrics.totalAutomations === 1 ? 'active workflow' : 'active workflows' },
    { key: 'agent', label: 'AI Agent', desc: 'Reasons over live context', icon: Bot, accent: '#8b5cf6', value: String(metrics.enabledAgents), sub: metrics.totalAgents === 1 ? 'agent enabled' : 'agents enabled' },
    { key: 'read', label: 'Read & Analyze Data', desc: 'Reads records & tools', icon: Database, accent: '#28d7df', value: String(metrics.toolsInUse), sub: 'tools in use' },
    { key: 'decide', label: 'Decide & Execute', desc: 'Applies the chosen plan', icon: Cpu, accent: '#f59e0b', value: String(metrics.totalExecutions), sub: 'total runs' },
    { key: 'verify', label: 'Verify & Log', desc: 'Audits every step', icon: ClipboardCheck, accent: '#28c99a', value: String(metrics.completedExecutions), sub: 'verified' },
    { key: 'result', label: 'Result', desc: 'Delivers the outcome', icon: Gauge, accent: '#4f6df5', value: `${metrics.successRate}%`, sub: 'success rate' },
  ];

  return (
    <section className="crm-auto-pipeline" data-live={live ? 'true' : 'false'} aria-label="Automation workflow architecture">
      <header className="crm-auto-pipeline-head">
        <div>
          <h2 className="crm-auto-section-title">Automation Architecture</h2>
          <p className="crm-auto-section-sub">How every workflow moves from signal to outcome</p>
        </div>
        <span className={`crm-auto-live ${live ? 'is-live' : ''}`}>
          <i /> {live ? 'Live' : 'Idle'}
        </span>
      </header>

      <div className="crm-auto-track" role="list">
        {stages.map((s, i) => (
          <div className="crm-auto-track-item" key={s.key} role="listitem">
            <div className="crm-auto-stage" style={{ '--accent': s.accent } as React.CSSProperties}>
              <div className="crm-auto-stage-top">
                <span className="crm-auto-stage-icon"><s.icon size={18} color={s.accent} /></span>
                <span className="crm-auto-stage-step">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div className="crm-auto-stage-label">{s.label}</div>
              <div className="crm-auto-stage-value">{s.value}</div>
              <div className="crm-auto-stage-sub">{s.sub}</div>
              <div className="crm-auto-stage-desc">{s.desc}</div>
            </div>
            {i < stages.length - 1 && (
              <div className="crm-auto-connector" aria-hidden="true">
                <span className="crm-auto-connector-line" />
                <ChevronRight size={16} className="crm-auto-connector-arrow" />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
