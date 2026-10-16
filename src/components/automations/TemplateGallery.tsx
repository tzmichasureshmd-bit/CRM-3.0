'use client';

import { Briefcase, Headphones, Megaphone, Wallet, Sparkles, ArrowRight, Zap, Eye, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { TRIGGER_MAP } from '@/lib/ai/automation-catalog';
import type { WorkflowTemplate, TemplateCompatibility } from '@/lib/ai/automation-templates';

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  Briefcase, Headphones, Megaphone, Wallet,
};

const COMPAT_META: Record<TemplateCompatibility['status'], { label: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  ready:   { label: 'Ready',        color: '#28c99a', bg: 'rgba(40,201,154,0.13)',  Icon: CheckCircle2 },
  partial: { label: 'Partial setup', color: '#f59e0b', bg: 'rgba(245,158,11,0.13)', Icon: AlertCircle },
  blocked: { label: 'Needs setup',  color: '#f46b72', bg: 'rgba(244,107,114,0.13)', Icon: XCircle },
};

export function TemplateGallery({
  templates,
  compatFor,
  installing,
  onPreview,
  onUse,
}: {
  templates: WorkflowTemplate[];
  compatFor: (t: WorkflowTemplate) => TemplateCompatibility;
  installing: string | null;
  onPreview: (t: WorkflowTemplate) => void;
  onUse: (t: WorkflowTemplate) => void;
}) {
  return (
    <section aria-label="AI workflow templates">
      <header className="crm-auto-section-head">
        <div>
          <h2 className="crm-auto-section-title">AI Workflow Templates</h2>
          <p className="crm-auto-section-sub">Preview, then install a fully editable draft — nothing runs until you activate it.</p>
        </div>
        <span className="crm-auto-chip"><Sparkles size={12} /> {templates.length} templates</span>
      </header>

      <div className="crm-auto-template-grid">
        {templates.map(t => {
          const Icon = ICONS[t.icon] ?? Zap;
          const compat = compatFor(t);
          const meta = COMPAT_META[compat.status];
          const steps = t.conditions.length + t.actions.length;
          return (
            <article key={t.id} className="crm-auto-template-card" style={{ '--accent': t.accent } as React.CSSProperties}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                <div className="crm-auto-template-icon" style={{ marginBottom: 0 }}><Icon size={20} color={t.accent} /></div>
                <span className="crm-auto-tpl-badge" style={{ color: meta.color, background: meta.bg }}>
                  <meta.Icon size={11} /> {meta.label}
                </span>
              </div>
              <h3 className="crm-auto-template-title">{t.name}</h3>
              <p className="crm-auto-template-desc">{t.description}</p>
              <div className="crm-auto-template-meta">
                <span className="crm-auto-chip">{TRIGGER_MAP[t.triggerType]?.label ?? t.triggerType}</span>
                <span className="crm-auto-chip">{steps} steps</span>
                {t.integrations.filter(i => i.required).length > 0 && (
                  <span className="crm-auto-chip">{t.integrations.filter(i => i.required).length} integrations</span>
                )}
                {t.approval && <span className="crm-auto-chip">Approval</span>}
              </div>
              <div className="crm-auto-template-actions">
                <button type="button" className="crm-auto-template-btn ghost" onClick={() => onPreview(t)}>
                  <Eye size={14} /> Preview Workflow
                </button>
                <button
                  type="button"
                  className="crm-auto-template-btn"
                  onClick={() => onUse(t)}
                  disabled={installing === t.id || compat.status === 'blocked'}
                  title={compat.status === 'blocked' ? compat.blockingReasons.join(' ') : 'Create an editable draft'}
                >
                  {installing === t.id ? 'Installing…' : 'Use Template'} <ArrowRight size={14} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
