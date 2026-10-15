/**
 * CRM 3.0 — Automation Catalog (shared, side-effect free)
 * Single source of truth for triggers, actions, fields and operators.
 * Imported by both the engine (server) and the builder UI (client).
 */

// ── Triggers ─────────────────────────────────────────────────
export type TriggerCategory =
  | 'manual'
  | 'contact'
  | 'lead'
  | 'conversation'
  | 'sales'
  | 'time'
  | 'integration';

export interface TriggerDef {
  type: string;
  label: string;
  description: string;
  category: TriggerCategory;
  /** true = the engine can only run it when an external event is ingested. */
  eventDriven: boolean;
  /** true = driven by the cron scheduler (no external integration needed). */
  scheduled?: boolean;
}

export const TRIGGERS: TriggerDef[] = [
  { type: 'manual',                 label: 'Manual Run',              description: 'Run on demand from the UI or API.',                 category: 'manual', eventDriven: false },
  { type: 'contact_created',        label: 'Contact Created',         description: 'Fires when a new contact is added.',                category: 'contact', eventDriven: true },
  { type: 'contact_updated',        label: 'Contact Updated',         description: 'Fires when a contact record changes.',              category: 'contact', eventDriven: true },
  { type: 'contact_tagged',         label: 'Contact Tagged',          description: 'Fires when a tag is applied to a contact.',         category: 'contact', eventDriven: true },
  { type: 'contact_assigned',       label: 'Contact Assigned',        description: 'Fires when a contact/conversation is assigned.',    category: 'contact', eventDriven: true },
  { type: 'lead_created',           label: 'New Lead Created',        description: 'Fires when a lead enters the pipeline.',            category: 'lead', eventDriven: true },
  { type: 'lead_status_changed',    label: 'Lead Status Changed',     description: 'Fires when a lead status changes.',                 category: 'lead', eventDriven: true },
  { type: 'message_received',       label: 'Incoming Message',        description: 'Fires on any inbound customer message.',            category: 'conversation', eventDriven: true },
  { type: 'first_inbound_message',  label: 'First Message from Contact', description: 'Fires on the first inbound message of a contact.', category: 'conversation', eventDriven: true },
  { type: 'keyword_match',          label: 'Keyword Match',           description: 'Fires when an inbound message contains keywords.',  category: 'conversation', eventDriven: true },
  { type: 'conversation_assigned',  label: 'Conversation Assigned',   description: 'Fires when a conversation is assigned.',            category: 'conversation', eventDriven: true },
  { type: 'conversation_status_changed', label: 'Conversation Status Changed', description: 'Fires when a conversation is opened/resolved.', category: 'conversation', eventDriven: true },
  { type: 'deal_created',           label: 'Deal Created',            description: 'Fires when a deal is created.',                     category: 'sales', eventDriven: true },
  { type: 'deal_stage_changed',     label: 'Deal Stage Changed',      description: 'Fires when a deal moves stage.',                    category: 'sales', eventDriven: true },
  { type: 'deal_won',               label: 'Deal Won',                description: 'Fires when a deal is won.',                         category: 'sales', eventDriven: true },
  { type: 'deal_lost',              label: 'Deal Lost',               description: 'Fires when a deal is lost.',                        category: 'sales', eventDriven: true },
  { type: 'ai_intent_detected',     label: 'AI Intent Detected',      description: 'Fires when AI detects a buying intent.',            category: 'integration', eventDriven: true },
  { type: 'ai_score_threshold',     label: 'AI Score Threshold',      description: 'Fires when AI lead score crosses a threshold.',     category: 'integration', eventDriven: true },
  { type: 'schedule',               label: 'Scheduled',               description: 'Runs on a recurring cron schedule.',                category: 'time', eventDriven: false, scheduled: true },
  { type: 'follow_up_due',          label: 'Follow-up Due',           description: 'Runs when follow-ups become due (cron).',           category: 'time', eventDriven: false, scheduled: true },
];

export const TRIGGER_MAP: Record<string, TriggerDef> = Object.fromEntries(
  TRIGGERS.map(t => [t.type, t])
);

export const TRIGGER_GROUPS: { label: string; triggers: TriggerDef[] }[] = [
  { label: 'Manual',            triggers: TRIGGERS.filter(t => t.category === 'manual') },
  { label: 'Contacts & Leads',  triggers: TRIGGERS.filter(t => t.category === 'contact' || t.category === 'lead') },
  { label: 'Conversations',     triggers: TRIGGERS.filter(t => t.category === 'conversation') },
  { label: 'Sales',             triggers: TRIGGERS.filter(t => t.category === 'sales') },
  { label: 'Time & Schedule',   triggers: TRIGGERS.filter(t => t.category === 'time') },
  { label: 'AI & Integrations', triggers: TRIGGERS.filter(t => t.category === 'integration') },
];

// ── Actions ──────────────────────────────────────────────────
export type ActionCategory = 'messaging' | 'crm' | 'flow' | 'integration';

export interface ActionFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'channel' | 'tag' | 'user' | 'url';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
}

export interface ActionDef {
  type: string;
  label: string;
  description: string;
  category: ActionCategory;
  icon: string;
  /** terminal step (stops the workflow) */
  terminal?: boolean;
  /** structural delay handled by the scheduler */
  delay?: boolean;
  fields: ActionFieldDef[];
}

export const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
  { value: 'web', label: 'Web Chat' },
];

export const LEAD_STATUSES = [
  'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost',
];

export const ACTIONS: ActionDef[] = [
  {
    type: 'send_message', label: 'Send Message', icon: 'MessageSquare',
    description: 'Send a message to the contact on a supported channel.',
    category: 'messaging',
    fields: [
      { key: 'channel', label: 'Channel', type: 'channel', required: true },
      { key: 'text', label: 'Message', type: 'textarea', required: true, placeholder: 'Hi {{contact.name}}, ...', hint: 'Supports {{contact.name}}, {{contact.email}}, {{contact.lead_status}}' },
    ],
  },
  {
    type: 'send_welcome_message', label: 'Send Welcome Message', icon: 'PartyPopper',
    description: 'Send a one-time welcome message (duplicate-safe).',
    category: 'messaging',
    fields: [
      { key: 'channel', label: 'Channel', type: 'channel', required: true },
      { key: 'text', label: 'Welcome Message', type: 'textarea', required: true, placeholder: 'Welcome {{contact.name}}! 👋' },
    ],
  },
  {
    type: 'send_list', label: 'Send List / Options', icon: 'List',
    description: 'Send an interactive list of options (channels that support it).',
    category: 'messaging',
    fields: [
      { key: 'channel', label: 'Channel', type: 'channel', required: true },
      { key: 'text', label: 'Body', type: 'textarea', required: true, placeholder: 'Choose an option:' },
      { key: 'button_text', label: 'Button Label', type: 'text', placeholder: 'Options' },
      { key: 'list_items', label: 'Options (one per line)', type: 'textarea', placeholder: 'Pricing\nBook a demo\nTalk to sales' },
    ],
  },
  {
    type: 'add_tag', label: 'Add Tag', icon: 'Tag',
    description: 'Apply a tag to the contact.',
    category: 'crm',
    fields: [{ key: 'tag', label: 'Tag', type: 'tag', required: true, placeholder: 'e.g. hot-lead' }],
  },
  {
    type: 'remove_tag', label: 'Remove Tag', icon: 'TagOff',
    description: 'Remove a tag from the contact.',
    category: 'crm',
    fields: [{ key: 'tag', label: 'Tag', type: 'tag', required: true }],
  },
  {
    type: 'assign_contact', label: 'Assign Contact', icon: 'UserPlus',
    description: 'Assign the contact / conversation to a team member.',
    category: 'crm',
    fields: [{ key: 'user_id', label: 'Assign to', type: 'user', required: true }],
  },
  {
    type: 'update_lead_status', label: 'Update Lead Status', icon: 'GitBranch',
    description: 'Change the contact lead status.',
    category: 'crm',
    fields: [
      { key: 'status', label: 'New Status', type: 'select', required: true,
        options: LEAD_STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })) },
    ],
  },
  {
    type: 'create_follow_up', label: 'Create Follow-up', icon: 'CalendarClock',
    description: 'Create a follow-up task for the team.',
    category: 'crm',
    fields: [
      { key: 'title', label: 'Task Title', type: 'text', required: true, placeholder: 'Call back about pricing' },
      { key: 'days', label: 'Due in (days)', type: 'number', placeholder: '1' },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional context' },
    ],
  },
  {
    type: 'add_note', label: 'Add Note', icon: 'StickyNote',
    description: 'Attach a note to the contact record.',
    category: 'crm',
    fields: [{ key: 'note', label: 'Note', type: 'textarea', required: true, placeholder: 'Logged by automation' }],
  },
  {
    type: 'send_notification', label: 'Notify Team', icon: 'Bell',
    description: 'Send an in-app notification to the team.',
    category: 'flow',
    fields: [{ key: 'message', label: 'Notification', type: 'textarea', required: true }],
  },
  {
    type: 'run_ai_agent', label: 'Run AI Agent', icon: 'Bot',
    description: 'Invoke an AI agent to analyze this contact and take authorized actions.',
    category: 'integration',
    fields: [
      { key: 'agent_id', label: 'AI Agent', type: 'text', required: true, placeholder: 'AI agent UUID', hint: 'The agent must be enabled and belong to this account.' },
      { key: 'prompt', label: 'Instruction', type: 'textarea', required: true, placeholder: 'Qualify this lead and create a follow-up task' },
    ],
  },
  {
    type: 'wait', label: 'Wait / Delay', icon: 'Clock',
    description: 'Pause the workflow for a duration (durable schedule).',
    category: 'flow',
    delay: true,
    fields: [
      { key: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '1' },
      { key: 'unit', label: 'Unit', type: 'select', required: true,
        options: [
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
          { value: 'days', label: 'Days' },
        ] },
    ],
  },
  {
    type: 'webhook', label: 'Call Webhook', icon: 'Webhook',
    description: 'Send an outbound HTTP request to an external URL.',
    category: 'integration',
    fields: [
      { key: 'url', label: 'URL', type: 'url', required: true, placeholder: 'https://...' },
      { key: 'method', label: 'Method', type: 'select',
        options: [{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }, { value: 'PUT', label: 'PUT' }] },
      { key: 'body', label: 'JSON Body (optional)', type: 'textarea', placeholder: '{ "contact_id": "{{contact.id}}" }' },
    ],
  },
  {
    type: 'end', label: 'End Workflow', icon: 'Square',
    description: 'Stop the workflow here.',
    category: 'flow',
    terminal: true,
    fields: [],
  },
];

export const ACTION_MAP: Record<string, ActionDef> = Object.fromEntries(
  ACTIONS.map(a => [a.type, a])
);

// ── Condition fields & operators ─────────────────────────────
export interface ConditionFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'tags' | 'date';
  options?: { value: string; label: string }[];
}

export const CONDITION_FIELDS: ConditionFieldDef[] = [
  { key: 'lead_status', label: 'Lead Status', type: 'select',
    options: LEAD_STATUSES.map(s => ({ value: s, label: s })) },
  { key: 'lead_score', label: 'Lead Score', type: 'number' },
  { key: 'lead_score_tier', label: 'Lead Tier', type: 'select',
    options: [{ value: 'hot', label: 'Hot' }, { value: 'warm', label: 'Warm' }, { value: 'cold', label: 'Cold' }] },
  { key: 'source', label: 'Source', type: 'text' },
  { key: 'tags', label: 'Tags', type: 'tags' },
  { key: 'company', label: 'Company', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'opt_out', label: 'Opted Out', type: 'select',
    options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
  { key: 'platform', label: 'Conversation Channel', type: 'select',
    options: CHANNELS.map(c => ({ value: c.value, label: c.label })) },
  { key: 'conversation_status', label: 'Conversation Status', type: 'select',
    options: [{ value: 'open', label: 'Open' }, { value: 'pending', label: 'Pending' }, { value: 'resolved', label: 'Resolved' }, { value: 'snoozed', label: 'Snoozed' }] },
  { key: 'message_content', label: 'Message Content', type: 'text' },
  { key: 'deal_value', label: 'Deal Value', type: 'number' },
  { key: 'days_since_last_interaction', label: 'Days Since Last Interaction', type: 'number' },
];

export const CONDITION_FIELD_MAP: Record<string, ConditionFieldDef> = Object.fromEntries(
  CONDITION_FIELDS.map(f => [f.key, f])
);

export interface OperatorDef { value: string; label: string; valueType: 'none' | 'single' | 'list' | 'number' | 'text' | 'select'; }

export const OPERATORS: OperatorDef[] = [
  { value: 'eq',          label: 'equals',            valueType: 'text' },
  { value: 'neq',         label: 'does not equal',    valueType: 'text' },
  { value: 'gt',          label: 'greater than',      valueType: 'number' },
  { value: 'gte',         label: 'greater or equal',  valueType: 'number' },
  { value: 'lt',          label: 'less than',         valueType: 'number' },
  { value: 'lte',         label: 'less or equal',     valueType: 'number' },
  { value: 'contains',    label: 'contains',          valueType: 'text' },
  { value: 'not_contains',label: 'does not contain',  valueType: 'text' },
  { value: 'in',          label: 'is one of',         valueType: 'list' },
  { value: 'not_in',      label: 'is not one of',     valueType: 'list' },
  { value: 'exists',      label: 'is set',            valueType: 'none' },
  { value: 'not_exists',  label: 'is empty',          valueType: 'none' },
];

export const OPERATOR_MAP: Record<string, OperatorDef> = Object.fromEntries(
  OPERATORS.map(o => [o.value, o])
);

// ── Status metadata (shared by UI) ───────────────────────────
export const AUTOMATION_STATUSES = ['draft', 'active', 'paused', 'archived', 'error'] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];
