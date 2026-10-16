/**
 * CRM 3.0 — AI Workflow Templates
 *
 * Pure, side-effect-free definitions for the Automations tab. Each template is
 * a *draft blueprint* only: installing one never activates it, never sends a
 * message and never performs an external action. Everything here maps to the
 * shared automation catalog (`./automation-catalog`) plus the AI agent engine,
 * so templates reuse the existing backend instead of duplicating it.
 *
 * Compatibility is evaluated against the account's real agents / tools /
 * configured integrations so the UI can report honestly what is ready and what
 * needs setup.
 */

import {
  TRIGGER_MAP,
  ACTION_MAP,
  CONDITION_FIELD_MAP,
  OPERATOR_MAP,
} from './automation-catalog';

// ── Template primitives ───────────────────────────────────────
export interface TemplateCondition {
  field: string;
  operator: string;
  value?: string;
}

export interface TemplateAction {
  type: string;
  config: Record<string, unknown>;
  /** Optional steps can be removed by the user without breaking the flow. */
  optional?: boolean;
}

/** Ordered, human-readable workflow step shown in the preview. */
export type TemplateStageKind =
  | 'trigger' | 'read' | 'analyze' | 'rule' | 'assign' | 'task'
  | 'message' | 'approval' | 'publish' | 'execute' | 'verify' | 'log';

export interface TemplateStage {
  key: string;
  label: string;
  kind: TemplateStageKind;
  detail: string;
  /** false = this concept has no supported handler yet (reported honestly). */
  implemented: boolean;
  optional?: boolean;
  note?: string;
}

export interface TemplateIntegration {
  key: string;
  label: string;
  /** true = required for the template to fully function. */
  required: boolean;
  /** true = the platform has a handler for this integration. */
  supported: boolean;
  /** server-detected capability that gates availability (if any). */
  capability?: TemplateCapability;
  note?: string;
}

export type TemplateCapability =
  | 'aiProvider' | 'whatsapp' | 'approvals' | 'content' | 'inbound' | 'crm';

export type TemplateCategory = 'sales' | 'support' | 'marketing' | 'finance';

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  icon: string;
  accent: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  aiEnabled: boolean;
  /** true = the flow's core step is an AI agent run. */
  requiresAgent: boolean;
  /** preferred agent type (validated against the AI agent catalog). */
  agentRole: string;
  /** tools the selected agent should be granted for full function. */
  agentTools: string[];
  /** true = the flow relies on the agent approval gate. */
  approval: boolean;
  match: 'all' | 'any';
  conditions: TemplateCondition[];
  actions: TemplateAction[];
  integrations: TemplateIntegration[];
  stages: TemplateStage[];
  tags: string[];
}

// ── Minimal shapes for compatibility inputs (structurally compatible) ──
export interface AgentRef {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  requires_approval: boolean;
  allowed_tools: string[];
}

export interface TemplateCapabilities {
  aiProviderConfigured: boolean;
  aiProvider: string;
  whatsappConfigured: boolean;
  approvalsSupported: boolean;
  contentSupported: boolean;
}

export const DEFAULT_CAPABILITIES: TemplateCapabilities = {
  aiProviderConfigured: false,
  aiProvider: 'rule_based',
  whatsappConfigured: false,
  approvalsSupported: true,
  contentSupported: true,
};

export interface CompatibilityContext {
  agents: AgentRef[];
  tools: string[];
  capabilities: TemplateCapabilities;
}

export interface TemplateCheck {
  key: string;
  label: string;
  ok: boolean;
  /** if !ok and blocking → the template cannot be installed. */
  blocking: boolean;
  detail: string;
  group: 'structure' | 'agent' | 'permission' | 'integration';
}

export interface TemplateCompatibility {
  status: 'ready' | 'partial' | 'blocked';
  checks: TemplateCheck[];
  agent: AgentRef | null;
  missingTools: string[];
  blockingReasons: string[];
}

// ── The four ready-made AI workflow templates ─────────────────
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ── 1. SALES AGENT ──────────────────────────────────────────
  {
    id: 'sales-agent',
    name: 'Sales Agent',
    category: 'sales',
    description: 'Greet a new lead, read and analyze it, apply qualification rules, assign the best owner, create a follow-up and track the result.',
    icon: 'Briefcase',
    accent: '#4d7cff',
    triggerType: 'lead_created',
    triggerConfig: {},
    aiEnabled: true,
    requiresAgent: true,
    agentRole: 'sales_assistant',
    agentTools: ['get_contact', 'analyze_lead', 'assign_lead', 'create_followup', 'recommend_actions'],
    approval: true,
    match: 'all',
    conditions: [{ field: 'lead_score', operator: 'gte', value: '40' }],
    actions: [
      { type: 'run_ai_agent', config: { agent_id: '', prompt: 'Read the new lead {{contact.name}}, analyze and score it, qualify it and recommend the next best action.' } },
      { type: 'create_follow_up', config: { title: 'Follow up with {{contact.name}}', days: 1, notes: 'AI-qualified lead — confirm interest and agree the next step.' } },
      { type: 'send_notification', config: { message: 'AI qualified {{contact.name}} (score {{contact.lead_score}}) — follow-up created.' } },
      { type: 'send_message', config: { channel: 'whatsapp', text: 'Hi {{contact.name}}, thanks for reaching out! I would love to learn more about what you need.' }, optional: true },
    ],
    integrations: [
      { key: 'ai', label: 'AI Provider', required: true, supported: true, capability: 'aiProvider', note: 'Falls back to rule-based reasoning when no model key is set.' },
      { key: 'approvals', label: 'Approval Gate', required: true, supported: true, capability: 'approvals' },
      { key: 'inbound', label: 'Inbound Trigger Events', required: true, supported: true, capability: 'inbound', note: 'lead_created must be posted to /api/v3/automations/events.' },
      { key: 'crm', label: 'Contacts & Follow-ups', required: true, supported: true, capability: 'crm' },
      { key: 'messaging', label: 'Messaging Channel', required: false, supported: true, capability: 'whatsapp', note: 'Without a provider, the message is queued, not delivered.' },
    ],
    stages: [
      { key: 'new-lead', label: 'New Lead', kind: 'trigger', detail: 'Fires when a new lead enters the pipeline.', implemented: true },
      { key: 'read', label: 'Read Lead Data', kind: 'read', detail: 'The agent reads the contact and deal records.', implemented: true },
      { key: 'analyze', label: 'Analyze Lead', kind: 'analyze', detail: 'Scores and qualifies the lead.', implemented: true },
      { key: 'rules', label: 'Apply Rules', kind: 'rule', detail: 'Only leads scoring 40+ continue.', implemented: true },
      { key: 'assign', label: 'Assign Lead', kind: 'assign', detail: 'The agent assigns the best owner.', implemented: true, note: 'Needs the assign_lead tool on the agent.' },
      { key: 'followup', label: 'Create Follow-Up', kind: 'task', detail: 'Creates a dated follow-up task.', implemented: true },
      { key: 'message', label: 'Optional Message', kind: 'message', detail: 'Sends a first-touch message.', implemented: true, optional: true },
      { key: 'verify', label: 'Verify Result', kind: 'verify', detail: 'Each write is re-read and confirmed before continuing.', implemented: true },
    ],
    tags: ['sales', 'lead', 'qualification', 'ai'],
  },

  // ── 2. SUPPORT AGENT ────────────────────────────────────────
  {
    id: 'support-agent',
    name: 'Support Agent',
    category: 'support',
    description: 'Watch inbound messages, read the conversation, classify intent and sentiment, suggest a reply, route the conversation and log the result.',
    icon: 'Headphones',
    accent: '#28c99a',
    triggerType: 'message_received',
    triggerConfig: {},
    aiEnabled: true,
    requiresAgent: true,
    agentRole: 'customer_support',
    agentTools: ['get_conversation', 'get_messages', 'classify_conversation', 'summarize_conversation', 'prepare_message', 'recommend_actions'],
    approval: true,
    match: 'all',
    conditions: [{ field: 'conversation_status', operator: 'eq', value: 'open' }],
    actions: [
      { type: 'run_ai_agent', config: { agent_id: '', prompt: 'Read the latest inbound message and conversation history, classify the customer intent and sentiment, and suggest a reply.' } },
      { type: 'send_notification', config: { message: 'New support message from {{contact.name}} — review the AI reply suggestion and assign an owner.' } },
      { type: 'add_note', config: { note: 'Support automation analyzed an inbound message from {{contact.name}} and prepared a reply suggestion.' } },
    ],
    integrations: [
      { key: 'ai', label: 'AI Provider', required: true, supported: true, capability: 'aiProvider', note: 'Falls back to rule-based reasoning when no model key is set.' },
      { key: 'approvals', label: 'Approval Gate', required: true, supported: true, capability: 'approvals' },
      { key: 'inbound', label: 'Inbound Trigger Events', required: true, supported: true, capability: 'inbound', note: 'message_received must be posted to /api/v3/automations/events.' },
      { key: 'crm', label: 'Conversations', required: true, supported: true, capability: 'crm' },
      { key: 'messaging', label: 'Messaging Channel', required: false, supported: true, capability: 'whatsapp' },
      { key: 'ticket', label: 'Support Ticket System', required: false, supported: false, note: 'No ticket table exists — conversations are used instead.' },
    ],
    stages: [
      { key: 'new-message', label: 'New Message', kind: 'trigger', detail: 'Fires on an inbound customer message.', implemented: true },
      { key: 'read', label: 'Read Conversation', kind: 'read', detail: 'The agent reads the conversation and message history.', implemented: true },
      { key: 'intent', label: 'Analyze Intent', kind: 'analyze', detail: 'Classifies intent and sentiment.', implemented: true },
      { key: 'suggest', label: 'Suggest Reply', kind: 'message', detail: 'Prepares a reply suggestion (never auto-sent).', implemented: true },
      { key: 'assign', label: 'Assign Agent / Update Ticket', kind: 'assign', detail: 'Alerts the team to assign an owner.', implemented: false, note: 'Updating an external ticket is unsupported — no ticket system.' },
      { key: 'log', label: 'Log Result', kind: 'log', detail: 'Records the outcome on the contact timeline.', implemented: true },
    ],
    tags: ['support', 'conversation', 'intent', 'ai'],
  },

  // ── 3. MARKETING AGENT ──────────────────────────────────────
  {
    id: 'marketing-agent',
    name: 'Marketing Agent',
    category: 'marketing',
    description: 'Recurring content review: analyze engagement, validate requirements, prepare a draft, request approval before publishing and log the outcome.',
    icon: 'Megaphone',
    accent: '#8b5cf6',
    triggerType: 'schedule',
    triggerConfig: { interval_minutes: 10080, run_all: true },
    aiEnabled: true,
    requiresAgent: true,
    agentRole: 'content',
    agentTools: ['search_contacts', 'recommend_actions', 'prepare_message'],
    approval: true,
    match: 'all',
    conditions: [{ field: 'opt_out', operator: 'eq', value: 'false' }],
    actions: [
      { type: 'run_ai_agent', config: { agent_id: '', prompt: 'Analyze recent engagement for {{contact.name}} and prepare a personalised campaign draft. Do not publish.' } },
      { type: 'send_notification', config: { message: 'Marketing draft ready for {{contact.name}} — approval required before publishing.' } },
      { type: 'add_note', config: { note: 'Marketing automation prepared a content draft for {{contact.name}}; awaiting approval.' } },
    ],
    integrations: [
      { key: 'ai', label: 'AI Provider', required: true, supported: true, capability: 'aiProvider', note: 'Falls back to rule-based reasoning when no model key is set.' },
      { key: 'approvals', label: 'Approval Gate', required: true, supported: true, capability: 'approvals' },
      { key: 'content', label: 'Content Studio', required: true, supported: true, capability: 'content' },
      { key: 'messaging', label: 'Messaging Channel', required: false, supported: true, capability: 'whatsapp' },
      { key: 'publish', label: 'Publishing Integration', required: false, supported: false, note: 'No social/publishing integration is connected — publishing is manual.' },
      { key: 'content-event', label: 'Content-Created Event', required: false, supported: false, note: 'No content event is wired; this template runs on a recurring schedule.' },
    ],
    stages: [
      { key: 'content-created', label: 'Content Created', kind: 'trigger', detail: 'Intended to fire when content is created.', implemented: false, note: 'Not wired — runs on a recurring schedule instead.' },
      { key: 'analyze', label: 'Analyze Content', kind: 'analyze', detail: 'The agent reviews engagement and content signals.', implemented: true },
      { key: 'validate', label: 'Validate Requirements', kind: 'rule', detail: 'Checks audience and requirement conditions.', implemented: true },
      { key: 'draft', label: 'Prepare Draft', kind: 'read', detail: 'Prepares a content draft (never auto-published).', implemented: true },
      { key: 'approval', label: 'Request Approval', kind: 'approval', detail: 'Requests approval via the agent gate and a reviewer notification.', implemented: true },
      { key: 'publish', label: 'Publish (Integration)', kind: 'publish', detail: 'Publishes through a connected integration.', implemented: false, note: 'No publishing integration available.' },
      { key: 'log', label: 'Log Result', kind: 'log', detail: 'Records the draft and approval request.', implemented: true },
    ],
    tags: ['marketing', 'content', 'approval', 'ai'],
  },

  // ── 4. FINANCE AGENT ────────────────────────────────────────
  {
    id: 'finance-agent',
    name: 'Finance Agent',
    category: 'finance',
    description: 'Recurring revenue review: read authorized deal records, check status, prepare a payment or renewal reminder, request approval and log the result.',
    icon: 'Wallet',
    accent: '#f59e0b',
    triggerType: 'schedule',
    triggerConfig: { interval_minutes: 10080, run_all: true },
    aiEnabled: true,
    requiresAgent: true,
    agentRole: 'reporting',
    agentTools: ['list_deals', 'get_followups', 'get_overdue_followups', 'recommend_actions', 'create_followup'],
    approval: true,
    match: 'all',
    conditions: [{ field: 'lead_status', operator: 'in', value: 'proposal,negotiation' }],
    actions: [
      { type: 'run_ai_agent', config: { agent_id: '', prompt: 'Read the authorized deal and follow-up records for {{contact.name}}, check the outstanding status and prepare a payment or renewal reminder.' } },
      { type: 'send_notification', config: { message: 'Finance reminder prepared for {{contact.name}} — approval required before sending.' } },
      { type: 'add_note', config: { note: 'Finance automation checked records for {{contact.name}} and prepared a reminder; awaiting approval.' } },
    ],
    integrations: [
      { key: 'ai', label: 'AI Provider', required: true, supported: true, capability: 'aiProvider', note: 'Falls back to rule-based reasoning when no model key is set.' },
      { key: 'approvals', label: 'Approval Gate', required: true, supported: true, capability: 'approvals' },
      { key: 'crm', label: 'Deals & Follow-ups', required: true, supported: true, capability: 'crm' },
      { key: 'messaging', label: 'Messaging Channel', required: false, supported: true, capability: 'whatsapp' },
      { key: 'invoice', label: 'Invoicing / Billing', required: false, supported: false, note: 'No invoice records exist in this CRM — reminders are prepared, not billed.' },
    ],
    stages: [
      { key: 'invoice-event', label: 'Supported Invoice Event', kind: 'trigger', detail: 'Intended to fire on an invoice event.', implemented: false, note: 'No invoice system exists — runs on a recurring schedule instead.' },
      { key: 'read', label: 'Read Authorized Records', kind: 'read', detail: 'The agent reads only the deals and follow-ups it is authorized to.', implemented: true },
      { key: 'status', label: 'Check Status', kind: 'rule', detail: 'Only active deals (proposal / negotiation) continue.', implemented: true },
      { key: 'reminder', label: 'Prepare Reminder', kind: 'message', detail: 'Prepares a payment or renewal reminder.', implemented: true },
      { key: 'approval', label: 'Request Approval', kind: 'approval', detail: 'Requests approval via the agent gate and a reviewer notification.', implemented: true },
      { key: 'execute', label: 'Execute Supported Action', kind: 'execute', detail: 'Sends the approved reminder through the agent.', implemented: true, note: 'External payment execution is unsupported.' },
      { key: 'log', label: 'Result Logged', kind: 'log', detail: 'Records the reminder and approval request.', implemented: true },
    ],
    tags: ['finance', 'revenue', 'reminder', 'ai'],
  },
];

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.id === id);
}

// ── Structural validation (catalog-level, no account needed) ──
export function validateTemplate(t: WorkflowTemplate): string[] {
  const issues: string[] = [];
  if (!TRIGGER_MAP[t.triggerType]) issues.push(`Unknown trigger "${t.triggerType}".`);
  if (t.conditions.length === 0 && t.actions.length === 0) issues.push('Template has no conditions or actions.');

  for (const c of t.conditions) {
    if (!CONDITION_FIELD_MAP[c.field]) issues.push(`Unknown condition field "${c.field}".`);
    if (!OPERATOR_MAP[c.operator]) issues.push(`Unknown operator "${c.operator}".`);
    const vt = OPERATOR_MAP[c.operator]?.valueType;
    if (vt && vt !== 'none' && (c.value === undefined || c.value === '')) issues.push(`Condition "${c.field}" needs a value.`);
  }

  for (const a of t.actions) {
    const def = ACTION_MAP[a.type];
    if (!def) { issues.push(`Unknown action "${a.type}".`); continue; }
    for (const f of def.fields) {
      if (!f.required) continue;
      // run_ai_agent.agent_id is resolved at install time from the account.
      if (a.type === 'run_ai_agent' && f.key === 'agent_id') continue;
      const v = a.config[f.key];
      if (v === undefined || v === '') issues.push(`Action "${def.label}" is missing required field: ${f.label}.`);
    }
  }
  return issues;
}

// ── Agent resolution ──────────────────────────────────────────
export function resolveTemplateAgent(t: WorkflowTemplate, agents: AgentRef[]): AgentRef | null {
  if (!t.requiresAgent || agents.length === 0) return null;
  const byRoleEnabled = agents.find(a => a.enabled && a.type === t.agentRole);
  if (byRoleEnabled) return byRoleEnabled;
  const anyEnabled = agents.find(a => a.enabled);
  if (anyEnabled) return anyEnabled;
  const byRole = agents.find(a => a.type === t.agentRole);
  if (byRole) return byRole;
  return agents[0] ?? null;
}

// ── Capability resolution ─────────────────────────────────────
function capabilityAvailable(cap: TemplateCapability | undefined, caps: TemplateCapabilities): boolean {
  switch (cap) {
    case undefined: return true;
    case 'aiProvider': return caps.aiProviderConfigured;
    case 'whatsapp': return caps.whatsappConfigured;
    case 'approvals': return caps.approvalsSupported;
    case 'content': return caps.contentSupported;
    case 'inbound': return true;
    case 'crm': return true;
    default: return true;
  }
}

// ── Compatibility (combines structure + account context) ──────
export function evaluateCompatibility(t: WorkflowTemplate, ctx: CompatibilityContext): TemplateCompatibility {
  const checks: TemplateCheck[] = [];

  // Structure
  const structural = validateTemplate(t);
  checks.push({
    key: 'structure', label: 'Template definition', ok: structural.length === 0, blocking: true,
    detail: structural.length === 0 ? 'All triggers, actions and conditions are supported.' : structural.join(' '),
    group: 'structure',
  });

  const trigger = TRIGGER_MAP[t.triggerType];
  checks.push({
    key: 'trigger', label: 'Trigger', ok: !!trigger, blocking: true,
    detail: trigger
      ? `${trigger.label}${trigger.eventDriven ? ' (requires an inbound event)' : trigger.scheduled ? ' (runs on the scheduler)' : ''}`
      : `Unknown trigger "${t.triggerType}".`,
    group: 'structure',
  });

  // Agent
  const agent = t.requiresAgent ? resolveTemplateAgent(t, ctx.agents) : null;
  const missingTools = agent ? t.agentTools.filter(tool => !agent.allowed_tools.includes(tool)) : [...t.agentTools];
  checks.push({
    key: 'agent', label: 'AI Agent', ok: !t.requiresAgent || !!agent, blocking: t.requiresAgent,
    detail: agent
      ? `${agent.name} (${agent.type})${agent.enabled ? '' : ' — currently disabled'}`
      : 'No AI agent is available in this account — create or enable one first.',
    group: 'agent',
  });
  if (agent) {
    checks.push({
      key: 'agent-tools', label: 'Agent tools', ok: missingTools.length === 0, blocking: false,
      detail: missingTools.length === 0 ? 'Agent has all recommended tools.' : `Agent is missing: ${missingTools.join(', ')}.`,
      group: 'agent',
    });
    checks.push({
      key: 'agent-enabled', label: 'Agent enabled', ok: agent.enabled, blocking: false,
      detail: agent.enabled ? 'Agent is enabled and ready to run.' : 'Agent is disabled — enable it before activating.',
      group: 'agent',
    });
  }

  // Permissions / approval
  if (t.approval) {
    const gated = !!agent?.requires_approval;
    checks.push({
      key: 'approval', label: 'Approval gate', ok: gated, blocking: false,
      detail: gated ? 'Write actions pause for approval via the agent gate.' : 'Agent does not require approval — sensitive actions may run without review.',
      group: 'permission',
    });
  }

  // Integrations
  for (const integ of t.integrations) {
    const ok = integ.supported && capabilityAvailable(integ.capability, ctx.capabilities);
    let detail = integ.label;
    if (!integ.supported) detail += ' — not supported in this build.';
    else if (integ.capability === 'aiProvider') detail += ctx.capabilities.aiProviderConfigured ? ` — ${ctx.capabilities.aiProvider} detected.` : ' — no model key set (rule-based fallback).';
    else if (integ.capability === 'whatsapp') detail += ctx.capabilities.whatsappConfigured ? ' — provider configured.' : ' — provider not configured (messages queue).';
    else detail += ' — available.';
    checks.push({
      key: `integration:${integ.key}`, label: integ.label, ok, blocking: false,
      detail: integ.note ? `${detail} ${integ.note}` : detail,
      group: 'integration',
    });
  }

  const blockingReasons = checks.filter(c => !c.ok && c.blocking).map(c => c.detail);
  const hasWarning = checks.some(c => !c.ok && !c.blocking);
  const status: TemplateCompatibility['status'] = blockingReasons.length > 0 ? 'blocked' : hasWarning ? 'partial' : 'ready';

  return { status, checks, agent, missingTools, blockingReasons };
}

// ── Draft step builder (mirrors the builder's own step model) ──
export function buildTemplateSteps(
  t: WorkflowTemplate,
  agent: AgentRef | null
): { step_type: string; config: Record<string, unknown>; position: number }[] {
  const steps: { step_type: string; config: Record<string, unknown>; position: number }[] = [];
  let position = 0;

  if (t.conditions.length > 0) {
    steps.push({ step_type: 'condition', position: position++, config: { match: t.match, conditions: t.conditions } });
  }
  for (const a of t.actions) {
    const config: Record<string, unknown> = { ...a.config };
    if (a.type === 'run_ai_agent' && agent) config.agent_id = agent.id;
    steps.push({ step_type: a.type, config, position: position++ });
  }
  steps.push({ step_type: 'end', position: position++, config: {} });
  return steps;
}
