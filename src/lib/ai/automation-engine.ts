/**
 * CRM 3.0 — Automation Execution Engine
 * Durable, idempotent workflow execution for the Automations tab.
 *
 * Design notes:
 * - Linear execution (matches existing CRM 3.0 automations + flow diagram).
 * - Conditions act as gates; a failed condition stops the run.
 * - "wait" steps are persisted to crm3_automation_scheduled_jobs and resumed
 *   by the cron scheduler (no long sleeps, no open browser required).
 * - Trigger events are de-duplicated via crm3_automation_events.
 *
 * Security: account_id always supplied by the caller from the session.
 * Every entity access is account-scoped. No arbitrary user code is executed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTION_MAP } from './automation-catalog';
import { runAgent } from './agent-engine';

type Cfg = Record<string, unknown>;

export interface StepLogEntry {
  step_type: string;
  action?: string;
  status: 'completed' | 'failed' | 'skipped' | 'waiting';
  detail: string;
  duration_ms: number;
  executed_at: string;
}

export interface AutomationStepRow {
  id: string;
  step_type: string;
  position: number;
  config: Cfg | null;
  parent_step_id: string | null;
  branch: string | null;
}

export interface AutomationRow {
  id: string;
  account_id: string;
  name: string;
  trigger_type: string;
  trigger_config: Cfg | null;
  is_active: boolean;
  status: string;
  execution_count: number;
  success_count: number;
  failure_count: number;
  workflow_version: number;
}

export interface ExecutionContext {
  contact: Record<string, unknown>;
  conversation: Record<string, unknown> | null;
  dealValue: number | null;
  payload: Cfg;
}

export interface ExecuteOptions {
  supabase: SupabaseClient;
  automation: AutomationRow;
  contactId: string;
  conversationId?: string | null;
  triggerType?: string;
  triggerData?: Cfg;
  mode?: 'live' | 'simulate';
  startStepIndex?: number;
  existingExecutionId?: string | null;
}

export interface ExecuteResult {
  executionId: string | null;
  status: 'completed' | 'failed' | 'waiting' | 'simulated';
  stepsLog: StepLogEntry[];
  error?: string | null;
  scheduledFor?: string | null;
}

// ── Template rendering ────────────────────────────────────────
export function renderTemplate(text: string, ctx: ExecutionContext): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const [scope, ...rest] = path.split('.');
    const key = rest.join('.');
    let value: unknown;
    if (scope === 'contact') value = ctx.contact?.[key];
    else if (scope === 'payload') value = ctx.payload?.[key];
    else if (scope === 'conversation') value = ctx.conversation?.[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

// ── Condition evaluation ──────────────────────────────────────
function compare(field: string, op: string, value: unknown, fv: unknown): boolean {
  if (op === 'exists' || op === 'not_exists') {
    const has = fv !== null && fv !== undefined && fv !== '';
    return op === 'exists' ? has : !has;
  }

  const isArray = Array.isArray(fv);
  const list = (() => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
    return [String(value ?? '')];
  })();

  switch (op) {
    case 'in':     return isArray ? (fv as unknown[]).some(v => list.includes(String(v))) : list.includes(String(fv ?? ''));
    case 'not_in': return !(isArray ? (fv as unknown[]).some(v => list.includes(String(v))) : list.includes(String(fv ?? '')));
    case 'contains': {
      if (isArray) return (fv as unknown[]).some(v => String(v).toLowerCase().includes(String(value ?? '').toLowerCase()));
      return String(fv ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    }
    case 'not_contains': {
      if (isArray) return !(fv as unknown[]).some(v => String(v).toLowerCase().includes(String(value ?? '').toLowerCase()));
      return !String(fv ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    }
    case 'eq':  return String(fv ?? '').toLowerCase() === String(value ?? '').toLowerCase();
    case 'neq': return String(fv ?? '').toLowerCase() !== String(value ?? '').toLowerCase();
    case 'gt':  return Number(fv) > Number(value);
    case 'gte': return Number(fv) >= Number(value);
    case 'lt':  return Number(fv) < Number(value);
    case 'lte': return Number(fv) <= Number(value);
    default:    return false;
  }
}

function resolveField(field: string, ctx: ExecutionContext): unknown {
  switch (field) {
    case 'platform':          return ctx.conversation?.platform;
    case 'conversation_status': return ctx.conversation?.status;
    case 'message_content':   return ctx.payload?.message_content ?? ctx.payload?.content ?? '';
    case 'deal_value':        return ctx.dealValue;
    case 'days_since_last_interaction': {
      const ref = (ctx.contact?.last_customer_reply_at ?? ctx.contact?.updated_at) as string | undefined;
      if (!ref) return null;
      return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
    }
    default:                  return ctx.contact?.[field];
  }
}

interface ConditionClause { field: string; operator: string; value?: unknown }
interface ConditionConfig {
  match?: 'all' | 'any';
  conditions?: ConditionClause[];
  // legacy single-condition shape
  field?: string;
  operator?: string;
  value?: unknown;
  subject?: string;
  threshold?: number;
}

export function evaluateConditions(cfg: ConditionConfig, ctx: ExecutionContext): { passed: boolean; detail: string } {
  let clauses: ConditionClause[] = [];
  let match: 'all' | 'any' = 'all';

  if (Array.isArray(cfg.conditions) && cfg.conditions.length > 0) {
    clauses = cfg.conditions;
    match = cfg.match === 'any' ? 'any' : 'all';
  } else if (cfg.field || cfg.subject) {
    const field = cfg.field ?? cfg.subject ?? '';
    const operator = cfg.operator ?? 'eq';
    const value = cfg.value ?? cfg.threshold;
    if (field === 'ai_score' || field === 'lead_score') {
      clauses = [{ field: 'lead_score', operator, value }];
    } else {
      clauses = [{ field, operator, value }];
    }
  } else {
    return { passed: true, detail: 'no conditions' };
  }

  const results = clauses.map(c => {
    const fv = resolveField(c.field, ctx);
    const ok = compare(c.field, c.operator, c.value, fv);
    return { field: c.field, operator: c.operator, value: c.value, actual: fv, ok };
  });

  const passed = match === 'all' ? results.every(r => r.ok) : results.some(r => r.ok);
  const detail = results.map(r => `${r.field} ${r.operator} ${String(r.value ?? '')} (actual: ${String(r.actual ?? 'null')}) = ${r.ok}`).join('; ');
  return { passed, detail: `${match.toUpperCase()} → ${detail}` };
}

// ── Context loading ───────────────────────────────────────────
export async function loadContext(
  supabase: SupabaseClient,
  accountId: string,
  contactId: string,
  conversationId: string | null | undefined,
  payload: Cfg
): Promise<ExecutionContext> {
  const { data: contact } = await supabase
    .from('contacts')
    .select('id,name,email,phone,company,source,tags,lead_status,lead_score,lead_score_tier,opt_out,instagram_user_id,telegram_chat_id,last_customer_reply_at,updated_at,created_at')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .single();

  let conversation: Record<string, unknown> | null = null;
  if (conversationId) {
    const { data } = await supabase
      .from('conversations')
      .select('id,platform,status,assigned_agent_id,contact_id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .single();
    conversation = (data as Record<string, unknown>) ?? null;
  } else {
    const { data } = await supabase
      .from('conversations')
      .select('id,platform,status,assigned_agent_id,contact_id')
      .eq('contact_id', contactId)
      .eq('account_id', accountId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    conversation = (data as Record<string, unknown>) ?? null;
  }

  const { data: deals } = await supabase
    .from('deals')
    .select('value')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('value', { ascending: false, nullsFirst: false })
    .limit(1);
  const dealValue = deals && deals[0] ? Number((deals[0] as { value: number | null }).value ?? 0) : null;

  return {
    contact: (contact as Record<string, unknown>) ?? {},
    conversation,
    dealValue,
    payload: payload ?? {},
  };
}

// ── Channel resolution & message dispatch ─────────────────────
async function resolveConversation(
  supabase: SupabaseClient,
  accountId: string,
  contactId: string,
  conversationId: string | null | undefined,
  channel: string
): Promise<string | null> {
  if (conversationId) {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .single();
    if (data) return (data as { id: string }).id;
  }
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('platform', channel)
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created } = await supabase
    .from('conversations')
    .insert({ account_id: accountId, contact_id: contactId, platform: channel, status: 'open' })
    .select('id')
    .single();
  return created ? (created as { id: string }).id : null;
}

interface MessageResult { status: 'sent' | 'pending' | 'failed'; detail: string; messageId: string | null }

async function deliverWhatsApp(phone: string | null, text: string): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !phone) return { ok: false, error: 'provider_not_configured' };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.replace(/[^\d]/g, ''), type: 'text', text: { body: text } }),
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, externalId: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'dispatch error' };
  }
}

async function sendMessage(
  supabase: SupabaseClient,
  accountId: string,
  ctx: ExecutionContext,
  contactId: string,
  conversationId: string | null | undefined,
  opts: { channel: string; text: string; contentType?: string; metadata?: Cfg; skipOptOut?: boolean }
): Promise<MessageResult> {
  const contact = ctx.contact;
  if (!opts.skipOptOut && contact?.opt_out === true) {
    return { status: 'pending', detail: 'Contact opted out — message suppressed', messageId: null };
  }
  const convId = await resolveConversation(supabase, accountId, contactId, conversationId, opts.channel);
  if (!convId) return { status: 'failed', detail: 'Could not resolve conversation', messageId: null };

  let externalId: string | null = null;
  let status: 'sent' | 'pending' = 'pending';
  let note = 'queued (no provider configured)';

  if (opts.channel === 'whatsapp' && (opts.contentType ?? 'text') === 'text') {
    const d = await deliverWhatsApp((contact?.phone as string) ?? null, opts.text);
    if (d.ok) { status = 'sent'; externalId = d.externalId ?? null; note = 'dispatched via WhatsApp Cloud API'; }
    else note = `queued (${d.error})`;
  }

  const { data: msg } = await supabase
    .from('messages')
    .insert({
      account_id: accountId,
      conversation_id: convId,
      sender_type: 'bot',
      sender_id: 'automation',
      content: opts.text,
      content_type: opts.contentType ?? 'text',
      status,
      external_id: externalId,
      metadata: { ...(opts.metadata ?? {}), source: 'automation' },
    })
    .select('id')
    .single();

  await supabase
    .from('conversations')
    .update({ last_message_text: opts.text.slice(0, 200), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', convId);

  return { status, detail: note, messageId: msg ? (msg as { id: string }).id : null };
}

// ── SSRF-safe outbound webhook ────────────────────────────────
export function isSafeUrl(raw: string): { safe: boolean; reason?: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { safe: false, reason: 'invalid URL' }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { safe: false, reason: 'protocol not allowed' };
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') return { safe: false, reason: 'host not allowed' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
      return { safe: false, reason: 'private address not allowed' };
    }
  }
  if (host.includes(':') || host.startsWith('[')) return { safe: false, reason: 'IPv6 not allowed' };
  return { safe: true };
}

async function callWebhook(url: string, method: string, body: string | undefined): Promise<{ ok: boolean; detail: string }> {
  const check = isSafeUrl(url);
  if (!check.safe) return { ok: false, detail: `Blocked webhook: ${check.reason}` };
  try {
    const res = await fetch(url, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : (body || undefined),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'request failed' };
  }
}

// ── Action execution ──────────────────────────────────────────
interface ActionOutcome { status: 'completed' | 'failed' | 'skipped'; detail: string }

async function runAction(
  actionType: string,
  cfg: Cfg,
  supabase: SupabaseClient,
  accountId: string,
  ctx: ExecutionContext,
  contactId: string,
  conversationId: string | null | undefined
): Promise<ActionOutcome> {
  const str = (k: string) => (cfg[k] === undefined || cfg[k] === null ? '' : String(cfg[k]));
  const num = (k: string, d = 1) => (cfg[k] === undefined || cfg[k] === '' ? d : Number(cfg[k]));

  switch (actionType) {
    case 'send_message':
    case 'send_welcome_message': {
      const text = renderTemplate(str('text'), ctx);
      if (!text.trim()) return { status: 'failed', detail: 'message text is empty' };
      if (actionType === 'send_welcome_message') {
        const { data: prior } = await supabase
          .from('messages')
          .select('id')
          .eq('account_id', accountId)
          .eq('conversation_id', (ctx.conversation?.id as string) ?? '00000000-0000-0000-0000-000000000000')
          .eq('sender_type', 'bot')
          .contains('metadata', { source: 'automation', welcome: true })
          .limit(1);
        if (prior && prior.length > 0) return { status: 'skipped', detail: 'Welcome message already sent (duplicate prevented)' };
        const r = await sendMessage(supabase, accountId, ctx, contactId, conversationId, {
          channel: str('channel') || 'whatsapp', text, metadata: { welcome: true },
        });
        return { status: r.status === 'failed' ? 'failed' : 'completed', detail: r.detail };
      }
      const r = await sendMessage(supabase, accountId, ctx, contactId, conversationId, {
        channel: str('channel') || 'whatsapp', text,
      });
      return { status: r.status === 'failed' ? 'failed' : 'completed', detail: r.detail };
    }

    case 'send_list': {
      const text = renderTemplate(str('text'), ctx);
      const raw = str('list_items');
      const items = raw.split('\n').map(s => s.trim()).filter(Boolean).map((t, i) => ({ id: `opt_${i + 1}`, title: t }));
      if (items.length === 0) return { status: 'failed', detail: 'no list options configured' };
      const r = await sendMessage(supabase, accountId, ctx, contactId, conversationId, {
        channel: str('channel') || 'whatsapp', text, contentType: 'interactive',
        metadata: { interactive: { type: 'list', button: str('button_text') || 'Options', items } },
      });
      return { status: r.status === 'failed' ? 'failed' : 'completed', detail: `${r.detail} (${items.length} options)` };
    }

    case 'add_tag':
    case 'remove_tag': {
      const tag = str('tag').trim();
      if (!tag) return { status: 'failed', detail: 'tag is required' };
      const current = Array.isArray(ctx.contact.tags) ? (ctx.contact.tags as string[]) : [];
      let next: string[];
      if (actionType === 'add_tag') {
        if (current.includes(tag)) return { status: 'skipped', detail: `tag "${tag}" already present` };
        next = [...current, tag];
      } else {
        if (!current.includes(tag)) return { status: 'skipped', detail: `tag "${tag}" not present` };
        next = current.filter(t => t !== tag);
      }
      const { error } = await supabase.from('contacts').update({ tags: next, updated_at: new Date().toISOString() }).eq('id', contactId).eq('account_id', accountId);
      if (error) return { status: 'failed', detail: error.message };
      ctx.contact.tags = next;
      return { status: 'completed', detail: `${actionType === 'add_tag' ? 'Added' : 'Removed'} tag "${tag}"` };
    }

    case 'assign_contact': {
      const userId = str('user_id');
      if (!userId) return { status: 'failed', detail: 'assignee is required' };
      const { data: member } = await supabase.from('profiles').select('user_id').eq('user_id', userId).eq('account_id', accountId).single();
      if (!member) return { status: 'failed', detail: 'assignee is not a member of this account' };
      const { error } = await supabase
        .from('conversations')
        .update({ assigned_agent_id: userId, updated_at: new Date().toISOString() })
        .eq('account_id', accountId)
        .eq('contact_id', contactId);
      if (error) return { status: 'failed', detail: error.message };
      return { status: 'completed', detail: `Conversations assigned to ${userId}` };
    }

    case 'update_lead_status': {
      const valid = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
      const status = str('status');
      if (!valid.includes(status)) return { status: 'failed', detail: `invalid lead status "${status}"` };
      const { error } = await supabase.from('contacts').update({ lead_status: status, updated_at: new Date().toISOString() }).eq('id', contactId).eq('account_id', accountId);
      if (error) return { status: 'failed', detail: error.message };
      return { status: 'completed', detail: `Lead status → ${status}` };
    }

    case 'update_contact_field': {
      const allowed = ['name', 'email', 'company', 'source', 'phone'];
      const field = str('field');
      if (!allowed.includes(field)) return { status: 'failed', detail: `field "${field}" is not writable` };
      const value = renderTemplate(str('value'), ctx);
      const { error } = await supabase.from('contacts').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', contactId).eq('account_id', accountId);
      if (error) return { status: 'failed', detail: error.message };
      return { status: 'completed', detail: `${field} → ${value}` };
    }

    case 'create_follow_up': {
      const title = renderTemplate(str('title') || 'Follow up', ctx);
      const days = num('days', 1);
      const dueDate = new Date(Date.now() + days * 86400000).toISOString();
      const { error } = await supabase.from('follow_ups').insert({
        account_id: accountId,
        contact_id: contactId,
        user_id: str('user_id') || null,
        title,
        notes: renderTemplate(str('notes'), ctx) || null,
        due_date: dueDate,
        status: 'pending',
      });
      if (error) return { status: 'failed', detail: error.message };
      return { status: 'completed', detail: `Follow-up "${title}" due ${dueDate.split('T')[0]}` };
    }

    case 'add_note': {
      const note = renderTemplate(str('note'), ctx);
      if (!note.trim()) return { status: 'failed', detail: 'note is empty' };
      const existing = (ctx.contact.custom_fields as Record<string, unknown>) ?? {};
      const notes = Array.isArray(existing.notes) ? (existing.notes as unknown[]) : [];
      const next = { ...existing, notes: [...notes, { note, at: new Date().toISOString(), source: 'automation' }] };
      const { error } = await supabase.from('contacts').update({ custom_fields: next, updated_at: new Date().toISOString() }).eq('id', contactId).eq('account_id', accountId);
      if (error) return { status: 'failed', detail: error.message };
      return { status: 'completed', detail: 'Note added to contact' };
    }

    case 'send_notification': {
      const message = renderTemplate(str('message') || 'Automation executed', ctx);
      const { error } = await supabase.from('notifications').insert({
        account_id: accountId, user_id: null, type: 'automation',
        title: 'Automation Action', body: message, data: { contact_id: contactId }, is_read: false,
      });
      if (error) return { status: 'failed', detail: error.message };
      return { status: 'completed', detail: 'Team notified' };
    }

    case 'webhook': {
      const url = renderTemplate(str('url'), ctx);
      if (!url) return { status: 'failed', detail: 'webhook URL is empty' };
      const r = await callWebhook(url, str('method') || 'POST', renderTemplate(str('body'), ctx) || undefined);
      return { status: r.ok ? 'completed' : 'failed', detail: `Webhook ${r.detail}` };
    }

    case 'run_ai_agent': {
      const agentId = str('agent_id');
      if (!agentId) return { status: 'failed', detail: 'AI agent is required' };
      const prompt = renderTemplate(str('prompt'), ctx) || `Analyze the current contact and take authorized actions.`;

      const result = await runAgent(
        { agentId, accountId, userId: 'automation', input: prompt, contactId, conversationId: conversationId ?? undefined },
        supabase
      );

      // No confirmed backend run record = failure (never report success blindly).
      if (!result.runId) {
        return { status: 'failed', detail: result.error ?? 'AI agent could not run' };
      }

      // Verify the run was persisted before reporting success.
      const { data: runRow } = await supabase
        .from('crm3_ai_agent_runs')
        .select('id, status')
        .eq('id', result.runId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (!runRow) return { status: 'failed', detail: 'Agent run could not be verified' };

      if (result.status === 'failed') return { status: 'failed', detail: result.error ?? 'AI agent run failed' };
      const detail = result.status === 'awaiting_approval'
        ? `Agent run ${result.runId} queued for approval`
        : `Agent run ${result.runId} completed (${result.steps.filter(s => s.status === 'completed').length} action(s))`;
      return { status: 'completed', detail };
    }

    default:
      return { status: 'failed', detail: `unsupported action "${actionType}"` };
  }
}

// ── Main execution ────────────────────────────────────────────
export async function executeAutomation(opts: ExecuteOptions): Promise<ExecuteResult> {
  const { supabase, automation, contactId } = opts;
  const accountId = automation.account_id;
  const mode = opts.mode ?? 'live';
  const conversationId = opts.conversationId ?? null;
  const triggerType = opts.triggerType ?? automation.trigger_type;

  const { data: stepData, error: stepErr } = await supabase
    .from('automation_steps')
    .select('id,step_type,position,config,parent_step_id,branch')
    .eq('automation_id', automation.id)
    .is('parent_step_id', null)
    .order('position', { ascending: true });

  if (stepErr) return { executionId: null, status: 'failed', stepsLog: [], error: stepErr.message };
  const steps = ((stepData ?? []) as AutomationStepRow[]);

  const ctx = await loadContext(supabase, accountId, contactId, conversationId, opts.triggerData ?? {});
  if (!ctx.contact || !ctx.contact.id) {
    return { executionId: null, status: 'failed', stepsLog: [], error: 'Contact not found in account' };
  }

  const stepsLog: StepLogEntry[] = [];
  const startIndex = opts.startStepIndex ?? 0;

  // ── Simulation: read-only preview, no side effects ──
  if (mode === 'simulate') {
    for (const step of steps.slice(startIndex)) {
      const type = step.step_type;
      const cfg = (step.config ?? {}) as Cfg;
      if (type === 'condition') {
        const ev = evaluateConditions(cfg as never, ctx);
        stepsLog.push({ step_type: type, status: ev.passed ? 'completed' : 'skipped', detail: ev.detail, duration_ms: 0, executed_at: new Date().toISOString() });
        if (!ev.passed) break;
      } else if (type === 'wait') {
        stepsLog.push({ step_type: type, action: 'wait', status: 'skipped', detail: `Would wait ${cfg.amount ?? 1} ${cfg.unit ?? 'hours'}`, duration_ms: 0, executed_at: new Date().toISOString() });
      } else if (type === 'end') {
        stepsLog.push({ step_type: type, status: 'completed', detail: 'Workflow ends here', duration_ms: 0, executed_at: new Date().toISOString() });
        break;
      } else {
        const actionType = (cfg.action as string) ?? type;
        const def = ACTION_MAP[actionType];
        const missing = (def?.fields ?? []).filter(f => f.required && (cfg[f.key] === undefined || cfg[f.key] === '' )).map(f => f.label);
        stepsLog.push({
          step_type: type, action: actionType,
          status: missing.length ? 'failed' : 'completed',
          detail: missing.length ? `Missing required: ${missing.join(', ')}` : `Would run "${def?.label ?? actionType}"`,
          duration_ms: 0, executed_at: new Date().toISOString(),
        });
        if (missing.length) break;
      }
    }
    const failed = stepsLog.some(s => s.status === 'failed');
    return { executionId: null, status: failed ? 'failed' : 'simulated', stepsLog, error: failed ? 'Simulation found configuration errors' : null };
  }

  // ── Live execution ──
  let executionId = opts.existingExecutionId ?? null;
  if (!executionId) {
    const { data: execution } = await supabase
      .from('crm3_automation_executions')
      .insert({
        account_id: accountId, automation_id: automation.id, contact_id: contactId,
        conversation_id: conversationId, trigger_type: triggerType,
        trigger_data: opts.triggerData ?? {}, status: 'running',
        total_steps: steps.length, current_step: startIndex, steps_log: [],
      })
      .select('id')
      .single();
    executionId = execution ? (execution as { id: string }).id : null;
  } else {
    await supabase.from('crm3_automation_executions').update({ status: 'running' }).eq('id', executionId);
  }

  let overallStatus: 'completed' | 'failed' | 'waiting' = 'completed';
  let errorMessage: string | null = null;
  let scheduledFor: string | null = null;

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    const type = step.step_type;
    const cfg = (step.config ?? {}) as Cfg;
    const stepStart = Date.now();

    try {
      if (type === 'condition') {
        const ev = evaluateConditions(cfg as never, ctx);
        stepsLog.push({ step_type: type, status: ev.passed ? 'completed' : 'skipped', detail: ev.detail, duration_ms: Date.now() - stepStart, executed_at: new Date().toISOString() });
        if (!ev.passed) { break; }
        continue;
      }

      if (type === 'end') {
        stepsLog.push({ step_type: type, status: 'completed', detail: 'Workflow ended', duration_ms: Date.now() - stepStart, executed_at: new Date().toISOString() });
        break;
      }

      if (type === 'wait') {
        const amount = Number(cfg.amount ?? 1);
        const unit = String(cfg.unit ?? 'hours');
        const ms = unit === 'minutes' ? amount * 60000 : unit === 'days' ? amount * 86400000 : amount * 3600000;
        scheduledFor = new Date(Date.now() + ms).toISOString();
        await supabase.from('crm3_automation_scheduled_jobs').insert({
          account_id: accountId, automation_id: automation.id, execution_id: executionId,
          contact_id: contactId, conversation_id: conversationId,
          job_type: 'resume_automation', run_at: scheduledFor, status: 'pending',
          next_step_index: i + 1, payload: { trigger_type: triggerType, trigger_data: opts.triggerData ?? {} },
        });
        stepsLog.push({ step_type: type, action: 'wait', status: 'waiting', detail: `Paused ${amount} ${unit} until ${scheduledFor}`, duration_ms: Date.now() - stepStart, executed_at: new Date().toISOString() });
        overallStatus = 'waiting';
        if (executionId) {
          await supabase.from('crm3_automation_executions')
            .update({ current_step: i, steps_log: stepsLog, wait_until: scheduledFor })
            .eq('id', executionId);
        }
        break;
      }

      // action step
      const actionType = (cfg.action as string) ?? type;
      const outcome = await runAction(actionType, cfg, supabase, accountId, ctx, contactId, conversationId);
      stepsLog.push({ step_type: type, action: actionType, status: outcome.status, detail: outcome.detail, duration_ms: Date.now() - stepStart, executed_at: new Date().toISOString() });
      if (outcome.status === 'failed') { overallStatus = 'failed'; errorMessage = outcome.detail; break; }

      if (executionId) {
        await supabase.from('crm3_automation_executions').update({ current_step: i + 1, steps_log: stepsLog }).eq('id', executionId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stepsLog.push({ step_type: type, action: type, status: 'failed', detail: msg, duration_ms: Date.now() - stepStart, executed_at: new Date().toISOString() });
      overallStatus = 'failed'; errorMessage = msg; break;
    }
  }

  // Finalize execution record
  if (executionId) {
    await supabase.from('crm3_automation_executions').update({
      status: overallStatus,
      steps_log: stepsLog,
      error_message: errorMessage,
      completed_at: overallStatus === 'waiting' ? null : new Date().toISOString(),
      wait_until: scheduledFor,
    }).eq('id', executionId);
  }

  // Update automation counters (only on terminal states)
  if (overallStatus !== 'waiting') {
    const update: Record<string, unknown> = {
      execution_count: (automation.execution_count ?? 0) + 1,
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (overallStatus === 'completed') update.success_count = (automation.success_count ?? 0) + 1;
    else {
      update.failure_count = (automation.failure_count ?? 0) + 1;
      update.last_error = errorMessage;
      update.last_error_at = new Date().toISOString();
    }
    await supabase.from('automations').update(update).eq('id', automation.id);
  }

  return { executionId, status: overallStatus, stepsLog, error: errorMessage, scheduledFor };
}

// ── Trigger event dispatch (idempotent) ───────────────────────
function matchesTriggerConfig(triggerType: string, cfg: Cfg, payload: Cfg): boolean {
  if (!cfg || Object.keys(cfg).length === 0) return true;
  if (triggerType === 'keyword_match') {
    const keywords = Array.isArray(cfg.keywords) ? (cfg.keywords as string[]) : String(cfg.keywords ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (keywords.length === 0) return true;
    const content = String(payload.message_content ?? payload.content ?? '').toLowerCase();
    return keywords.some(k => content.includes(k.toLowerCase()));
  }
  if (triggerType === 'deal_stage_changed' || triggerType === 'lead_status_changed') {
    const want = cfg.stage ?? cfg.status;
    if (!want) return true;
    return String(payload.stage ?? payload.status ?? '') === String(want);
  }
  if (triggerType === 'ai_score_threshold') {
    const threshold = Number(cfg.threshold ?? 70);
    return Number(payload.score ?? 0) >= threshold;
  }
  return true;
}

export interface DispatchResult { eventId: string | null; duplicate: boolean; executions: number; results: ExecuteResult[] }

export async function dispatchAutomationEvent(
  supabase: SupabaseClient,
  input: { accountId: string; eventType: string; payload: Cfg; eventKey?: string }
): Promise<DispatchResult> {
  const { accountId, eventType } = input;
  const payload = input.payload ?? {};
  const contactId = (payload.contact_id as string) ?? null;
  const eventKey = input.eventKey ?? `${eventType}:${contactId ?? 'na'}:${Math.floor(Date.now() / 1000)}`;

  // Idempotency ledger
  const { data: event, error: evErr } = await supabase
    .from('crm3_automation_events')
    .insert({ account_id: accountId, event_key: eventKey, event_type: eventType, payload, status: 'received', executions_created: 0 })
    .select('id')
    .single();

  if (evErr) {
    if (evErr.code === '23505') return { eventId: null, duplicate: true, executions: 0, results: [] };
    return { eventId: null, duplicate: false, executions: 0, results: [] };
  }
  const eventId = (event as { id: string }).id;

  const { data: automations } = await supabase
    .from('automations')
    .select('*')
    .eq('account_id', accountId)
    .eq('trigger_type', eventType)
    .eq('status', 'active');

  const results: ExecuteResult[] = [];
  for (const automation of (automations ?? []) as AutomationRow[]) {
    if (!contactId) continue;
    if (!matchesTriggerConfig(eventType, automation.trigger_config ?? {}, payload)) continue;
    const r = await executeAutomation({
      supabase, automation, contactId,
      conversationId: (payload.conversation_id as string) ?? null,
      triggerType: eventType,
      triggerData: payload,
      mode: 'live',
    });
    results.push(r);
  }

  await supabase.from('crm3_automation_events')
    .update({ status: results.length ? 'processed' : 'skipped', executions_created: results.length, automation_id: (automations?.[0] as { id?: string } | undefined)?.id ?? null })
    .eq('id', eventId);

  return { eventId, duplicate: false, executions: results.length, results };
}

// ── Scheduled job processing (cron) ───────────────────────────
export async function processScheduledJob(
  supabase: SupabaseClient,
  job: {
    id: string; account_id: string; automation_id: string; execution_id: string | null;
    contact_id: string | null; conversation_id: string | null; next_step_index: number;
    attempts: number; payload: Cfg | null;
  }
): Promise<{ ok: boolean; detail: string }> {
  if (!job.contact_id) return { ok: false, detail: 'job has no contact' };

  const { data: automationData } = await supabase.from('automations').select('*').eq('id', job.automation_id).eq('account_id', job.account_id).single();
  if (!automationData) return { ok: false, detail: 'automation no longer exists' };
  const automation = automationData as AutomationRow;

  const payload = (job.payload ?? {}) as Cfg;
  const result = await executeAutomation({
    supabase, automation, contactId: job.contact_id,
    conversationId: job.conversation_id,
    triggerType: (payload.trigger_type as string) ?? automation.trigger_type,
    triggerData: (payload.trigger_data as Cfg) ?? {},
    mode: 'live',
    startStepIndex: job.next_step_index,
    existingExecutionId: job.execution_id,
  });

  if (result.status === 'completed' || result.status === 'waiting') return { ok: true, detail: result.status };
  return { ok: false, detail: result.error ?? 'failed' };
}
