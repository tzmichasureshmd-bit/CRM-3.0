/**
 * CRM 3.0 — Journey Node Configuration Panel
 * Premium configuration UI for all journey node types.
 */

'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Trash2, Users as UsersIcon, Tag, ShieldCheck, Settings, Clock, Zap } from 'lucide-react';

interface NodeConfigPanelProps {
  node: any;
  onUpdate: (n: any) => void;
  onDelete: () => void;
  onClose: () => void;
}

const ACTION_TYPES = [
  { value: 'create_followup',    label: 'Create Follow-up' },
  { value: 'update_lead_status', label: 'Update Lead Status' },
  { value: 'create_task',        label: 'Create Task' },
  { value: 'send_notification',  label: 'Send Notification' },
  { value: 'add_journey_event',  label: 'Log Journey Event' },
  { value: 'add_tag',            label: 'Add Tag' },
  { value: 'remove_tag',         label: 'Remove Tag' },
  { value: 'update_contact',     label: 'Update Contact Property' },
  { value: 'add_to_segment',     label: 'Add to Segment' },
  { value: 'remove_from_segment', label: 'Remove from Segment' },
  { value: 'send_whatsapp',      label: 'Send WhatsApp Template' },
  { value: 'send_email',         label: 'Send Email' },
  { value: 'assign_lead',        label: 'Assign Lead to Team Member' },
];

const CONDITION_FIELDS = [
  { value: 'lead_score',    label: 'Lead Score' },
  { value: 'lead_status',   label: 'Lead Status' },
  { value: 'lead_score_tier', label: 'Score Tier' },
  { value: 'source',        label: 'Source' },
  { value: 'tags',          label: 'Tags' },
  { value: 'opt_out',       label: 'Opt-out Status' },
  { value: 'company',       label: 'Company' },
];

const STAGE_OPTIONS = [
  'discovery', 'engagement', 'conversation', 'qualification',
  'sales', 'conversion', 'retention', 'expansion',
];

export default function NodeConfigPanel({
  node, onUpdate, onDelete, onClose,
}: NodeConfigPanelProps) {
  const [cfg, setCfg] = useState({ ...(node.data.config ?? {}) });
  const [label, setLabel] = useState(node.data.label ?? 'Node');

  const isTrigger = node.type === 'trigger';
  const isCondition = node.type === 'condition';
  const isAction = node.type === 'action';
  const isWait = node.type === 'wait';
  const isStage = node.type === 'stage';
  const isEnd = node.type === 'end';
  const isAIDecision = node.type === 'ai_decision';

  const save = () => {
    onUpdate({ ...node, data: { label, config: cfg } });
  };

  // Reset config when node changes
  useEffect(() => {
    setCfg({ ...(node.data.config ?? {}) });
    setLabel(node.data.label ?? 'Node');
  }, [node]);

  return (
    <div className="fixed inset-0 z-50 flex items-end px-4 pb-4">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 h-[55%] md:h-[65%] rounded-3xl border border-crm-border/30 bg-crm-card-bg shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Handle */}
        <div className="w-12 h-1.5 rounded-full bg-crm-border/30 mx-auto mt-2 mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-crm-border/20 bg-crm-card-bg/80 backdrop-blur z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${getNodeColor(node.type)}20`} style={{ color: getNodeColor(node.type) }}>
              {getNodeIcon(node.type)}
            </div>
            <div>
              <h3 className="text-sm font-bold text-crm-text">Configure Node</h3>
              <p className="text-[10px] text-crm-muted capitalize">{node.type}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-crm-accent flex items-center justify-center text-crm-muted hover:text-crm-text transition-colors">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Label */}
          <div>
            <label className="block text-[10px] font-bold text-crm-muted uppercase tracking-wider mb-2">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-crm-text text-sm outline-none focus:ring-2 focus:ring-crm-primary/20 transition-all"
            />
          </div>

          {isCondition && (
            <ConfigSection title="Condition Rules">
              <ConfigRow label="Field">
                <select
                  value={cfg.field ?? 'lead_score'}
                  onChange={(e) => setCfg({ ...cfg, field: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                >
                  {CONDITION_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </ConfigRow>
              <ConfigRow label="Operator">
                <select
                  value={cfg.operator ?? 'gt'}
                  onChange={(e) => setCfg({ ...cfg, operator: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                >
                  {[
                    ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'],
                    ['eq', '='], ['neq', '≠'], ['contains', 'Contains'],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </ConfigRow>
              <ConfigRow label="Value">
                <input
                  type="text"
                  value={cfg.value ?? ''}
                  onChange={(e) => setCfg({ ...cfg, value: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                  placeholder="Enter value..."
                />
              </ConfigRow>
              <div className="text-[10px] text-crm-muted mt-2">
                YES branch = condition met · NO branch = condition not met
              </div>
            </ConfigSection>
          )}

          {isAIDecision && (
            <ConfigSection title="AI Decision Threshold">
              <ConfigRow label="Score Threshold (0-100)">
                <input
                  type="number" min={0} max={100}
                  value={cfg.score_threshold ?? 70}
                  onChange={(e) => setCfg({ ...cfg, score_threshold: parseInt(e.target.value) || 70 })}
                  className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                />
              </ConfigRow>
              <div className="text-[10px] text-crm-muted">
                YES branch = AI score ≥ threshold · NO branch = below threshold
              </div>
            </ConfigSection>
          )}

          {isAction && (
            <ConfigSection title="CRM Action">
              <ConfigRow label="Action Type">
                <select
                  value={cfg.action_type ?? 'create_followup'}
                  onChange={(e) => setCfg({ ...cfg, action_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                >
                  {ACTION_TYPES.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </ConfigRow>

              {cfg.action_type === 'send_whatsapp' && (
                <>
                  <ConfigRow label="WhatsApp Template">
                    <select
                      value={cfg.whatsapp_template ?? ''}
                      onChange={(e) => setCfg({ ...cfg, whatsapp_template: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                    >
                      <option value="">Select a template...</option>
                      <option value="welcome_message">Welcome Message</option>
                      <option value="appointment_reminder">Appointment Reminder</option>
                      <option value="follow_up">Follow-up</option>
                    </select>
                  </ConfigRow>
                  <div className="text-[10px] text-crm-muted">
                    Uses existing Meta WhatsApp integration. Respects messaging window and template requirements.
                  </div>
                </>
              )}

              {cfg.action_type === 'send_email' && (
                <>
                  <ConfigRow label="Email Template">
                    <select
                      value={cfg.email_template ?? ''}
                      onChange={(e) => setCfg({ ...cfg, email_template: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                    >
                      <option value="">Select a template...</option>
                      <option value="welcome_email">Welcome Email</option>
                      <option value="newsletter">Newsletter</option>
                      <option value="promotional">Promotional</option>
                    </select>
                  </ConfigRow>
                  <div className="text-[10px] text-crm-muted">
                    Requires SMTP/IMAP email provider to be configured in backend settings.
                  </div>
                </>
              )}

              {(cfg.action_type === 'create_followup' || cfg.action_type === 'create_task' || cfg.action_type === 'send_notification') && (
                <ConfigRow label="Title / Message">
                  <input
                    value={cfg.title ?? cfg.message ?? ''}
                    onChange={(e) => setCfg({ ...cfg, title: e.target.value, message: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                    placeholder="Enter title or message..."
                  />
                </ConfigRow>
              )}

              {cfg.action_type === 'update_lead_status' && (
                <ConfigRow label="Lead Status">
                  <select
                    value={cfg.lead_status ?? 'qualified'}
                    onChange={(e) => setCfg({ ...cfg, lead_status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                  >
                    {['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </ConfigRow>
              )}

              {(cfg.action_type === 'add_tag' || cfg.action_type === 'remove_tag') && (
                <ConfigRow label="Tag">
                  <input
                    value={cfg.tag ?? ''}
                    onChange={(e) => setCfg({ ...cfg, tag: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                    placeholder="e.g. VIP, cold-lead"
                  />
                </ConfigRow>
              )}

              {cfg.action_type === 'update_contact' && (
                <ConfigRow label="Property to Update">
                  <input
                    value={cfg.property ?? ''}
                    onChange={(e) => setCfg({ ...cfg, property: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                    placeholder="e.g. company, phone"
                  />
                </ConfigRow>
              )}
              {cfg.action_type === 'update_contact' && (
                <ConfigRow label="New Value">
                  <input
                    value={cfg.new_value ?? ''}
                    onChange={(e) => setCfg({ ...cfg, new_value: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                    placeholder="Enter new value..."
                  />
                </ConfigRow>
              )}

              {(cfg.action_type === 'add_to_segment' || cfg.action_type === 'remove_from_segment') && (
                <ConfigRow label="Segment ID">
                  <input
                    value={cfg.segment_id ?? ''}
                    onChange={(e) => setCfg({ ...cfg, segment_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                    placeholder="UUID of segment"
                  />
                </ConfigRow>
              )}

              {cfg.action_type === 'assign_lead' && (
                <ConfigRow label="Assign To (User ID)">
                  <input
                    value={cfg.assignee_id ?? ''}
                    onChange={(e) => setCfg({ ...cfg, assignee_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                    placeholder="UUID of team member"
                  />
                </ConfigRow>
              )}
            </ConfigSection>
          )}

          {isWait && (
            <ConfigSection title="Wait Configuration">
              <ConfigRow label="Amount">
                <input
                  type="number" min={1}
                  value={cfg.amount ?? 1}
                  onChange={(e) => setCfg({ ...cfg, amount: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                />
              </ConfigRow>
              <ConfigRow label="Unit">
                <select
                  value={cfg.unit ?? 'hours'}
                  onChange={(e) => setCfg({ ...cfg, unit: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </ConfigRow>
              <div className="text-[10px] text-crm-muted">
                Execution pauses and resumes via the background scheduler when the wait time elapses.
              </div>
            </ConfigSection>
          )}

          {isStage && (
            <ConfigSection title="Journey Stage">
              <ConfigRow label="Stage">
                <select
                  value={cfg.stage ?? 'engagement'}
                  onChange={(e) => setCfg({ ...cfg, stage: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-sm outline-none focus:ring-2 focus:ring-crm-primary/20"
                >
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </ConfigRow>
            </ConfigSection>
          )}

          {isEnd && (
            <ConfigSection title="End Journey">
              <div className="text-[10px] text-crm-muted">
                Marks the contact's journey as completed. No further nodes will be executed.
              </div>
            </ConfigSection>
          )}

          {isTrigger && (
            <ConfigSection title="Trigger Configuration">
              <div className="text-[10px] text-crm-muted">
                The trigger defines how contacts enter this journey. Configure trigger conditions in the journey settings.
              </div>
            </ConfigSection>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-crm-border/20 bg-crm-card-bg/80 backdrop-blur p-6 flex items-center justify-between gap-3 z-10">
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-crm-border/30 bg-crm-bg/50 text-crm-text text-sm font-medium hover:bg-crm-danger/10 hover:text-crm-danger transition-colors"
          >
            <Trash2 size={14} strokeWidth={2} /> Delete Node
          </button>
          <button
            onClick={save}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-transparent bg-linear-gradient-to-r from-crm-primary to-crm-purple text-white text-sm font-medium shadow-lg hover:shadow-crm-primary/30 transition-all"
          >
            <Settings size={14} strokeWidth={2} /> Save Configuration
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold text-crm-muted uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  );
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-crm-muted">{label}</label>
      {children}
    </div>
  );
}

function getNodeColor(type: string) {
  const colors: Record<string, string> = {
    trigger: '#4f6df5', condition: '#f4c95d', ai_decision: '#8b5cf6',
    action: '#28c99a', wait: '#f46b72', stage: '#06b6d4', end: '#8790aa',
  };
  return colors[type] ?? '#8790aa';
}

function getNodeIcon(type: string) {
  const icons: Record<string, React.ReactNode> = {
    trigger: <Zap size={12} strokeWidth={2} />,
    condition: <ShieldCheck size={12} strokeWidth={2} />,
    ai_decision: <Settings size={12} strokeWidth={2} />,
    action: <UsersIcon size={12} strokeWidth={2} />,
    wait: <Clock size={12} strokeWidth={2} />,
    stage: <Tag size={12} strokeWidth={2} />,
    end: <X size={12} strokeWidth={2} />,
  };
  return icons[type] ?? <Settings size={12} strokeWidth={2} />;
}
