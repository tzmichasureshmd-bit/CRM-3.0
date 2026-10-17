'use client';

import {
  Briefcase, Headphones, Megaphone, Wallet, Zap, X, ArrowRight, CheckCircle2,
  AlertCircle, XCircle, Circle, Bot, ShieldCheck, Plug, GitBranch, Clock,
} from 'lucide-react';
import {
  TRIGGER_MAP, ACTION_MAP, CONDITION_FIELD_MAP, OPERATOR_MAP,
} from '@/lib/ai/automation-catalog';
import type { WorkflowTemplate, TemplateCompatibility, TemplateAction, TemplateStage } from '@/lib/ai/automation-templates';

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  Briefcase, Headphones, Megaphone, Wallet,
};

const CATEGORY_LABEL: Record<string, string> = {
  sales: 'Sales', support: 'Support', marketing: 'Marketing', finance: 'Finance',
};

const STATUS_META: Record<TemplateCompatibility['status'], { label: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  ready:   { label: 'Ready to install', color: '#28c99a', bg: 'rgba(40,201,154,0.13)',  Icon: CheckCircle2 },
  partial: { label: 'Installs with setup notes', color: '#f59e0b', bg: 'rgba(245,158,11,0.13)', Icon: AlertCircle },
  blocked: { label: 'Cannot install yet', color: '#f46b72', bg: 'rgba(244,107,114,0.13)', Icon: XCircle },
};

function actionSummary(a: TemplateAction): string {
  const c = a.config;
  switch (a.type) {
    case 'send_message': return `${String(c.channel ?? '')} · ${String(c.text ?? '')}`.trim();
    case 'send_welcome_message': return `${String(c.channel ?? '')} · ${String(c.text ?? '')}`.trim();
    case 'send_list': return `${String(c.channel ?? '')} · ${String(c.text ?? '')}`.trim();
    case 'add_tag': return `Add tag "${String(c.tag ?? '')}"`;
    case 'remove_tag': return `Remove tag "${String(c.tag ?? '')}"`;
    case 'assign_contact': return `Assign to ${String(c.user_id ?? '')}`;
    case 'update_lead_status': return `Set status to ${String(c.status ?? '')}`;
    case 'create_follow_up': return `${String(c.title ?? '')}${c.days ? ` (in ${String(c.days)} day(s))` : ''}`;
    case 'add_note': return String(c.note ?? '');
    case 'send_notification': return String(c.message ?? '');
    case 'run_ai_agent': return String(c.prompt ?? '');
    case 'wait': return `Wait ${String(c.amount ?? '')} ${String(c.unit ?? '')}`;
    case 'webhook': return `${String(c.method ?? 'POST')} ${String(c.url ?? '')}`;
    case 'end': return 'Stop the workflow';
    default: return '';
  }
}

function StageRow({ stage }: { stage: TemplateStage }) {
  const color = stage.implemented ? (stage.optional ? '#8b5cf6' : '#28c99a') : '#f46b72';
  return (
    <div className="crm-auto-tpl-stage">
      <span className="crm-auto-tpl-stage-dot" style={{ color }}>
        {stage.implemented ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--crm-text)' }}>{stage.label}</span>
          {stage.optional && <span className="crm-auto-chip">optional</span>}
          {!stage.implemented && <span className="crm-auto-chip" style={{ color: '#f46b72', background: 'rgba(244,107,114,0.12)' }}>unsupported</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>{stage.detail}</div>
        {stage.note && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 3 }}>{stage.note}</div>}
      </div>
    </div>
  );
}

export function TemplatePreview({
  template,
  compatibility,
  installing,
  onClose,
  onUse,
}: {
  template: WorkflowTemplate;
  compatibility: TemplateCompatibility;
  installing: boolean;
  onClose: () => void;
  onUse: () => void;
}) {
  const Icon = ICONS[template.icon] ?? Zap;
  const meta = STATUS_META[compatibility.status];
  const trigger = TRIGGER_MAP[template.triggerType];
  const blocked = compatibility.status === 'blocked';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="crm-glass-strong" style={{ width: '100%', maxWidth: 780, maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--crm-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${template.accent}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={20} color={template.accent} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--crm-text)' }}>{template.name}</h2>
                <span className="crm-auto-chip">{CATEGORY_LABEL[template.category] ?? template.category}</span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--crm-text-muted)' }}>Workflow preview — nothing runs until you activate it.</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--crm-text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--crm-text-secondary)', lineHeight: 1.55 }}>{template.description}</p>

          {/* Compatibility banner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, background: meta.bg, border: `1px solid ${meta.color}33` }}>
            <meta.Icon size={16} color={meta.color} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 650, color: meta.color }}>{meta.label}</div>
              {blocked && <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)', marginTop: 2 }}>{compatibility.blockingReasons.join(' ')}</div>}
            </div>
          </div>

          {/* Trigger + conditions */}
          <section>
            <h3 className="crm-auto-tpl-h3"><Zap size={14} color="var(--crm-primary)" /> Trigger &amp; conditions</h3>
            <div className="crm-auto-tpl-box">
              <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--crm-text)' }}>{trigger?.label ?? template.triggerType}</div>
              <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2 }}>
                {trigger?.description ?? ''}
                {trigger?.eventDriven ? ' · requires an inbound event' : ''}
                {trigger?.scheduled ? ' · runs on the scheduler (every 5 min)' : ''}
              </div>
              {template.conditions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--crm-text-muted)' }}>Run only when {template.match === 'all' ? 'ALL' : 'ANY'} match:</div>
                  {template.conditions.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--crm-text-secondary)' }}>
                      {CONDITION_FIELD_MAP[c.field]?.label ?? c.field} {OPERATOR_MAP[c.operator]?.label ?? c.operator}
                      {c.value !== undefined && c.value !== '' ? ` ${c.value}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* AI agent */}
          {template.requiresAgent && (
            <section>
              <h3 className="crm-auto-tpl-h3"><Bot size={14} color="#8b5cf6" /> AI agent</h3>
              <div className="crm-auto-tpl-box">
                {compatibility.agent ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--crm-text)' }}>{compatibility.agent.name}</span>
                      <span className="crm-auto-chip">{compatibility.agent.type}</span>
                      <span className="crm-auto-chip" style={{ color: compatibility.agent.enabled ? '#28c99a' : '#f59e0b' }}>
                        {compatibility.agent.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 4 }}>
                      Preferred role: <strong>{template.agentRole}</strong>. Recommended tools:{' '}
                      {template.agentTools.join(', ')}.
                    </div>
                    {compatibility.missingTools.length > 0 && (
                      <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>
                        This agent is missing: {compatibility.missingTools.join(', ')} — grant them for full function.
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#f46b72' }}>No AI agent is available — create or enable one first.</div>
                )}
              </div>
            </section>
          )}

          {/* Ordered actions */}
          <section>
            <h3 className="crm-auto-tpl-h3"><GitBranch size={14} color="var(--crm-primary)" /> Actions (in order)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {template.actions.map((a, i) => {
                const def = ACTION_MAP[a.type];
                const summary = actionSummary(a);
                return (
                  <div key={i} className="crm-auto-tpl-action">
                    <span className="crm-auto-tpl-action-num">{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--crm-text)' }}>{def?.label ?? a.type}</span>
                        {a.optional && <span className="crm-auto-chip">optional</span>}
                      </div>
                      {summary && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 2, wordBreak: 'break-word' }}>{summary}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Workflow stages */}
          <section>
            <h3 className="crm-auto-tpl-h3"><Clock size={14} color="var(--crm-primary)" /> Workflow stages</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {template.stages.map(s => <StageRow key={s.key} stage={s} />)}
            </div>
          </section>

          {/* Integrations */}
          <section>
            <h3 className="crm-auto-tpl-h3"><Plug size={14} color="var(--crm-primary)" /> Required integrations</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {template.integrations.map(integ => {
                const check = compatibility.checks.find(c => c.key === `integration:${integ.key}`);
                const ok = check?.ok ?? integ.supported;
                return (
                  <div key={integ.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    {ok ? <CheckCircle2 size={14} color="#28c99a" style={{ marginTop: 2 }} /> : <AlertCircle size={14} color="#f59e0b" style={{ marginTop: 2 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--crm-text)', fontWeight: 600 }}>
                        {integ.label} {integ.required ? <span style={{ color: 'var(--crm-text-muted)', fontWeight: 500 }}>· required</span> : <span style={{ color: 'var(--crm-text-muted)', fontWeight: 500 }}>· optional</span>}
                      </div>
                      {check && <div style={{ fontSize: 12, color: 'var(--crm-text-muted)', marginTop: 1 }}>{check.detail}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Permissions & approval */}
          <section>
            <h3 className="crm-auto-tpl-h3"><ShieldCheck size={14} color="#28c99a" /> Permissions &amp; approval</h3>
            <div className="crm-auto-tpl-box">
              {template.approval ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <ShieldCheck size={14} color={compatibility.checks.find(c => c.key === 'approval')?.ok ? '#28c99a' : '#f59e0b'} style={{ marginTop: 2 }} />
                  <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)' }}>
                    {compatibility.checks.find(c => c.key === 'approval')?.detail ?? 'Write actions pause for approval via the agent gate.'}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--crm-text-secondary)' }}>This workflow runs its actions directly — no approval gate.</div>
              )}
            </div>
          </section>

          {/* Compatibility checks */}
          <section>
            <h3 className="crm-auto-tpl-h3"><Circle size={10} color="var(--crm-text-muted)" /> Compatibility details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {compatibility.checks.map(c => (
                <div key={c.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {c.ok ? <CheckCircle2 size={13} color="#28c99a" style={{ marginTop: 2 }} /> : c.blocking ? <XCircle size={13} color="#f46b72" style={{ marginTop: 2 }} /> : <AlertCircle size={13} color="#f59e0b" style={{ marginTop: 2 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-text)' }}>{c.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}> — {c.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--crm-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--crm-text-muted)' }}>
            Installs as an editable <strong>draft</strong> — you activate it manually.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} className="crm-auto-template-btn ghost">Cancel</button>
            <button
              type="button"
              onClick={onUse}
              className="crm-auto-template-btn"
              disabled={installing || blocked}
              title={blocked ? compatibility.blockingReasons.join(' ') : 'Create an editable draft'}
            >
              {installing ? 'Installing…' : 'Use Template'} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
