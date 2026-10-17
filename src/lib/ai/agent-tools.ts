/**
 * CRM 3.0 — Agent Tool Registry
 * Every tool an agent can call is registered here.
 * Agents CANNOT call anything outside this registry (no arbitrary SQL / code / URLs).
 * Every tool validates account_id from the session — never from the agent prompt.
 *
 * Write tools RE-READ the affected row(s) after mutation and return `verified`
 * so the engine can refuse to report success without a confirmed backend result.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { completeJSON, detectProvider, logAIOperation } from './ai-provider';

export type ToolCategory = 'crm_read' | 'crm_write' | 'ai' | 'communication';
export type ApprovalLevel = 'auto' | 'requires_approval';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** For write tools: true only when the mutation was confirmed by a follow-up read. */
  verified?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  approval: ApprovalLevel;
  inputSchema: Record<string, { type: string; required: boolean; description: string }>;
}

// ── Tool Registry ─────────────────────────────────────────────
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  // ── CRM READ ────────────────────────────────────────────────
  get_contact: {
    name: 'get_contact',
    description: 'Get a contact (lead) by ID including lead score and status',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: { contact_id: { type: 'string', required: true, description: 'Contact UUID' } },
  },
  get_conversation: {
    name: 'get_conversation',
    description: 'Get a conversation with its AI analysis fields',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: { conversation_id: { type: 'string', required: true, description: 'Conversation UUID' } },
  },
  get_messages: {
    name: 'get_messages',
    description: 'Get recent messages for a conversation',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: {
      conversation_id: { type: 'string', required: true, description: 'Conversation UUID' },
      limit: { type: 'number', required: false, description: 'Max messages (default 20)' },
    },
  },
  get_deal: {
    name: 'get_deal',
    description: 'Get a deal by ID',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: { deal_id: { type: 'string', required: true, description: 'Deal UUID' } },
  },
  list_deals: {
    name: 'list_deals',
    description: 'List deals for the account, optionally filtered by status',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: {
      status: { type: 'string', required: false, description: 'open|won|lost' },
      limit: { type: 'number', required: false, description: 'Max results (default 20)' },
    },
  },
  search_conversations: {
    name: 'search_conversations',
    description: 'List/search conversations (support tickets) by status, priority or platform',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: {
      status: { type: 'string', required: false, description: 'open|pending|resolved|snoozed' },
      priority: { type: 'string', required: false, description: 'low|normal|high|urgent' },
      platform: { type: 'string', required: false, description: 'whatsapp|instagram|facebook|email|telegram|web' },
      limit: { type: 'number', required: false, description: 'Max results (default 20)' },
    },
  },
  get_followups: {
    name: 'get_followups',
    description: 'Get follow-ups for a contact',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: { contact_id: { type: 'string', required: true, description: 'Contact UUID' } },
  },
  search_contacts: {
    name: 'search_contacts',
    description: 'Search contacts by name, email, or phone',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: { query: { type: 'string', required: true, description: 'Search query' } },
  },
  get_overdue_followups: {
    name: 'get_overdue_followups',
    description: 'Get all overdue follow-ups for the account',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: { limit: { type: 'number', required: false, description: 'Max results (default 20)' } },
  },
  get_hot_leads: {
    name: 'get_hot_leads',
    description: 'Get contacts with high lead scores',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: {
      min_score: { type: 'number', required: false, description: 'Minimum score (default 60)' },
      limit: { type: 'number', required: false, description: 'Max results (default 10)' },
    },
  },

  // ── CRM WRITE ───────────────────────────────────────────────
  create_followup: {
    name: 'create_followup',
    description: 'Create a follow-up task for a contact',
    category: 'crm_write',
    approval: 'auto',
    inputSchema: {
      contact_id: { type: 'string', required: true, description: 'Contact UUID' },
      title: { type: 'string', required: true, description: 'Follow-up title' },
      due_date: { type: 'string', required: true, description: 'ISO date string' },
      notes: { type: 'string', required: false, description: 'Optional notes' },
    },
  },
  update_lead_status: {
    name: 'update_lead_status',
    description: 'Update the lead status of a contact',
    category: 'crm_write',
    approval: 'requires_approval',
    inputSchema: {
      contact_id: { type: 'string', required: true, description: 'Contact UUID' },
      lead_status: { type: 'string', required: true, description: 'new|contacted|qualified|proposal|negotiation|won|lost' },
    },
  },
  update_lead_score: {
    name: 'update_lead_score',
    description: 'Update the AI lead score for a contact',
    category: 'crm_write',
    approval: 'auto',
    inputSchema: {
      contact_id: { type: 'string', required: true, description: 'Contact UUID' },
      score: { type: 'number', required: true, description: 'Score 0-100' },
      reason: { type: 'string', required: false, description: 'Reason for score' },
    },
  },
  update_contact_field: {
    name: 'update_contact_field',
    description: 'Update a supported contact field (name, email, company, source, phone)',
    category: 'crm_write',
    approval: 'requires_approval',
    inputSchema: {
      contact_id: { type: 'string', required: true, description: 'Contact UUID' },
      field: { type: 'string', required: true, description: 'name|email|company|source|phone' },
      value: { type: 'string', required: true, description: 'New value' },
    },
  },
  add_tag: {
    name: 'add_tag',
    description: 'Add a tag to a contact',
    category: 'crm_write',
    approval: 'auto',
    inputSchema: {
      contact_id: { type: 'string', required: true, description: 'Contact UUID' },
      tag: { type: 'string', required: true, description: 'Tag to add' },
    },
  },
  remove_tag: {
    name: 'remove_tag',
    description: 'Remove a tag from a contact',
    category: 'crm_write',
    approval: 'auto',
    inputSchema: {
      contact_id: { type: 'string', required: true, description: 'Contact UUID' },
      tag: { type: 'string', required: true, description: 'Tag to remove' },
    },
  },
  assign_lead: {
    name: 'assign_lead',
    description: 'Assign a lead\'s conversations to a team member',
    category: 'crm_write',
    approval: 'requires_approval',
    inputSchema: {
      contact_id: { type: 'string', required: true, description: 'Contact UUID' },
      user_id: { type: 'string', required: true, description: 'Team member auth user UUID' },
    },
  },
  create_task: {
    name: 'create_task',
    description: 'Create an internal task (not sent to the customer)',
    category: 'crm_write',
    approval: 'auto',
    inputSchema: {
      contact_id: { type: 'string', required: false, description: 'Contact UUID (optional)' },
      title: { type: 'string', required: true, description: 'Task title' },
      due_date: { type: 'string', required: false, description: 'ISO date string' },
    },
  },
  update_deal_stage: {
    name: 'update_deal_stage',
    description: 'Move a deal to a different pipeline stage',
    category: 'crm_write',
    approval: 'requires_approval',
    inputSchema: {
      deal_id: { type: 'string', required: true, description: 'Deal UUID' },
      stage_id: { type: 'string', required: true, description: 'Pipeline stage UUID' },
    },
  },

  // ── AI TOOLS ────────────────────────────────────────────────
  analyze_lead: {
    name: 'analyze_lead',
    description: 'Analyze lead quality and intent for a contact (score + reasoning)',
    category: 'ai',
    approval: 'auto',
    inputSchema: { contact_id: { type: 'string', required: true, description: 'Contact UUID' } },
  },
  classify_conversation: {
    name: 'classify_conversation',
    description: 'Classify a conversation: intent, sentiment and a short summary (persisted)',
    category: 'ai',
    approval: 'auto',
    inputSchema: { conversation_id: { type: 'string', required: true, description: 'Conversation UUID' } },
  },
  recommend_actions: {
    name: 'recommend_actions',
    description: 'Recommend next-best workflow actions for a contact (no changes made)',
    category: 'ai',
    approval: 'auto',
    inputSchema: { contact_id: { type: 'string', required: true, description: 'Contact UUID' } },
  },
  generate_reply: {
    name: 'generate_reply',
    description: 'Generate an AI reply suggestion for a conversation (NOT auto-sent)',
    category: 'ai',
    approval: 'auto',
    inputSchema: {
      conversation_id: { type: 'string', required: true, description: 'Conversation UUID' },
      action: { type: 'string', required: true, description: 'professional|friendly|short|qualify|followup' },
    },
  },
  summarize_conversation: {
    name: 'summarize_conversation',
    description: 'Summarize a conversation and extract intent/sentiment',
    category: 'ai',
    approval: 'auto',
    inputSchema: { conversation_id: { type: 'string', required: true, description: 'Conversation UUID' } },
  },
  prepare_message: {
    name: 'prepare_message',
    description: 'Prepare a draft outbound message for a contact (NOT sent — requires human send)',
    category: 'communication',
    approval: 'auto',
    inputSchema: {
      contact_id: { type: 'string', required: true, description: 'Contact UUID' },
      purpose: { type: 'string', required: true, description: 'What the message should accomplish' },
    },
  },
  send_notification: {
    name: 'send_notification',
    description: 'Send an in-app notification to the team about this contact',
    category: 'communication',
    approval: 'auto',
    inputSchema: {
      title: { type: 'string', required: true, description: 'Notification title' },
      message: { type: 'string', required: true, description: 'Notification body' },
      contact_id: { type: 'string', required: false, description: 'Related contact UUID' },
    },
  },
};

export const TOOL_NAMES = Object.keys(TOOL_REGISTRY);

// ── Input validation (used by the engine's "Validate Decision" stage) ──
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  normalized: Record<string, unknown>;
}

export function validateToolInput(
  toolName: string,
  rawInput: Record<string, unknown> | undefined
): ValidationResult {
  const def = TOOL_REGISTRY[toolName];
  if (!def) return { valid: false, errors: [`Unknown tool: ${toolName}`], normalized: {} };

  const input = rawInput ?? {};
  const normalized: Record<string, unknown> = { ...input };
  const errors: string[] = [];

  for (const [key, spec] of Object.entries(def.inputSchema)) {
    const val = input[key];
    const empty = val === undefined || val === null || val === '';
    if (spec.required && empty) {
      errors.push(`missing required field "${key}"`);
      continue;
    }
    if (empty) continue;

    if (spec.type === 'number') {
      const n = Number(val);
      if (Number.isNaN(n)) errors.push(`field "${key}" must be a number`);
      else normalized[key] = n;
    } else if (spec.type === 'boolean') {
      if (typeof val === 'boolean') normalized[key] = val;
      else if (val === 'true' || val === 'false') normalized[key] = val === 'true';
      else errors.push(`field "${key}" must be a boolean`);
    } else {
      const s = typeof val === 'string' ? val : String(val);
      if (s.length > 8000) errors.push(`field "${key}" is too long`);
      normalized[key] = s;
    }
  }

  return { valid: errors.length === 0, errors, normalized };
}

// ── Tool Executor ─────────────────────────────────────────────
// Each tool validates account ownership before executing.
// No raw SQL. No arbitrary API calls.
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  accountId: string,
  supabase: SupabaseClient
): Promise<ToolResult> {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) return { success: false, error: `Unknown tool: ${toolName}` };

  const check = validateToolInput(toolName, input);
  if (!check.valid) return { success: false, error: `Invalid input: ${check.errors.join('; ')}` };
  const args = check.normalized;

  try {
    switch (toolName) {
      case 'get_contact': return await toolGetContact(args, accountId, supabase);
      case 'get_conversation': return await toolGetConversation(args, accountId, supabase);
      case 'get_messages': return await toolGetMessages(args, accountId, supabase);
      case 'get_deal': return await toolGetDeal(args, accountId, supabase);
      case 'list_deals': return await toolListDeals(args, accountId, supabase);
      case 'search_conversations': return await toolSearchConversations(args, accountId, supabase);
      case 'get_followups': return await toolGetFollowups(args, accountId, supabase);
      case 'search_contacts': return await toolSearchContacts(args, accountId, supabase);
      case 'get_overdue_followups': return await toolGetOverdueFollowups(args, accountId, supabase);
      case 'get_hot_leads': return await toolGetHotLeads(args, accountId, supabase);
      case 'create_followup': return await toolCreateFollowup(args, accountId, supabase);
      case 'update_lead_status': return await toolUpdateLeadStatus(args, accountId, supabase);
      case 'update_lead_score': return await toolUpdateLeadScore(args, accountId, supabase);
      case 'update_contact_field': return await toolUpdateContactField(args, accountId, supabase);
      case 'add_tag': return await toolTag(args, accountId, supabase, 'add');
      case 'remove_tag': return await toolTag(args, accountId, supabase, 'remove');
      case 'assign_lead': return await toolAssignLead(args, accountId, supabase);
      case 'create_task': return await toolCreateTask(args, accountId, supabase);
      case 'update_deal_stage': return await toolUpdateDealStage(args, accountId, supabase);
      case 'analyze_lead': return await toolAnalyzeLead(args, accountId, supabase);
      case 'classify_conversation': return await toolClassifyConversation(args, accountId, supabase);
      case 'recommend_actions': return await toolRecommendActions(args, accountId, supabase);
      case 'generate_reply': return await toolGenerateReply(args, accountId, supabase);
      case 'summarize_conversation': return await toolSummarizeConversation(args, accountId, supabase);
      case 'prepare_message': return await toolPrepareMessage(args, accountId, supabase);
      case 'send_notification': return await toolSendNotification(args, accountId, supabase);
      default: return { success: false, error: `Tool not implemented: ${toolName}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Tool execution failed' };
  }
}

// ── Individual Tool Implementations ──────────────────────────

async function toolGetContact(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone, email, company, source, tags, lead_score, lead_score_tier, lead_score_reason, lead_status, opt_out, last_customer_reply_at, created_at, updated_at')
    .eq('id', input.contact_id as string)
    .eq('account_id', accountId)
    .single();
  if (error || !data) return { success: false, error: 'Contact not found or access denied' };
  return { success: true, data };
}

async function toolGetConversation(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, contact_id, platform, status, priority, unread_count, last_message_text, last_message_at, ai_intent, ai_sentiment, ai_summary, ai_lead_score')
    .eq('id', input.conversation_id as string)
    .eq('account_id', accountId)
    .single();
  if (error || !data) return { success: false, error: 'Conversation not found or access denied' };
  return { success: true, data };
}

async function toolGetMessages(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data: conv } = await supabase
    .from('conversations').select('id')
    .eq('id', input.conversation_id as string).eq('account_id', accountId).single();
  if (!conv) return { success: false, error: 'Conversation not found or access denied' };

  const limit = Math.min((input.limit as number) ?? 20, 50);
  const { data } = await supabase
    .from('messages')
    .select('id, content, sender_type, created_at, status')
    .eq('conversation_id', input.conversation_id as string)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { success: true, data: (data ?? []).reverse() };
}

async function toolGetDeal(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('deals')
    .select('id, title, value, currency, status, stage_id, updated_at')
    .eq('id', input.deal_id as string).eq('account_id', accountId).single();
  if (error || !data) return { success: false, error: 'Deal not found or access denied' };
  return { success: true, data };
}

async function toolListDeals(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const limit = Math.min((input.limit as number) ?? 20, 50);
  let q = supabase
    .from('deals')
    .select('id, title, value, currency, status, stage_id, contact_id, updated_at')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (input.status) q = q.eq('status', input.status as string);
  const { data } = await q;
  return { success: true, data: data ?? [] };
}

async function toolSearchConversations(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const limit = Math.min((input.limit as number) ?? 20, 50);
  let q = supabase
    .from('conversations')
    .select('id, contact_id, platform, status, priority, unread_count, last_message_text, last_message_at, ai_intent, ai_sentiment')
    .eq('account_id', accountId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (input.status) q = q.eq('status', input.status as string);
  if (input.priority) q = q.eq('priority', input.priority as string);
  if (input.platform) q = q.eq('platform', input.platform as string);
  const { data } = await q;
  return { success: true, data: data ?? [] };
}

async function toolGetFollowups(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data } = await supabase
    .from('follow_ups')
    .select('id, title, status, due_date, notes')
    .eq('contact_id', input.contact_id as string).eq('account_id', accountId)
    .order('due_date', { ascending: true }).limit(10);
  return { success: true, data: data ?? [] };
}

async function toolSearchContacts(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const q = `%${input.query as string}%`;
  const { data } = await supabase
    .from('contacts')
    .select('id, name, phone, email, lead_score, lead_status')
    .eq('account_id', accountId)
    .or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`)
    .limit(10);
  return { success: true, data: data ?? [] };
}

async function toolGetOverdueFollowups(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const limit = Math.min((input.limit as number) ?? 20, 50);
  const { data } = await supabase
    .from('follow_ups')
    .select('id, title, due_date, status, contact_id, contacts(name)')
    .eq('account_id', accountId).eq('status', 'pending')
    .lt('due_date', new Date().toISOString())
    .order('due_date', { ascending: true }).limit(limit);
  return { success: true, data: data ?? [] };
}

async function toolGetHotLeads(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const minScore = (input.min_score as number) ?? 60;
  const limit = Math.min((input.limit as number) ?? 10, 50);
  const { data } = await supabase
    .from('contacts')
    .select('id, name, phone, email, lead_score, lead_score_tier, lead_status, last_customer_reply_at')
    .eq('account_id', accountId).gte('lead_score', minScore)
    .order('lead_score', { ascending: false }).limit(limit);
  return { success: true, data: data ?? [] };
}

async function toolCreateFollowup(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data: contact } = await supabase
    .from('contacts').select('id')
    .eq('id', input.contact_id as string).eq('account_id', accountId).single();
  if (!contact) return { success: false, error: 'Contact not found or access denied' };

  const { data, error } = await supabase
    .from('follow_ups')
    .insert({
      account_id: accountId,
      contact_id: input.contact_id as string,
      title: input.title as string,
      due_date: input.due_date as string,
      notes: (input.notes as string) ?? null,
      status: 'pending',
    })
    .select('id, title, due_date, status')
    .single();
  if (error || !data) return { success: false, error: error?.message ?? 'insert failed' };
  return { success: true, data, verified: !!data.id };
}

async function toolUpdateLeadStatus(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const validStatuses = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  if (!validStatuses.includes(input.lead_status as string)) {
    return { success: false, error: `Invalid lead_status. Must be one of: ${validStatuses.join(', ')}` };
  }
  const { error } = await supabase
    .from('contacts').update({ lead_status: input.lead_status as string, updated_at: new Date().toISOString() })
    .eq('id', input.contact_id as string).eq('account_id', accountId);
  if (error) return { success: false, error: error.message };

  const { data: check } = await supabase
    .from('contacts').select('lead_status').eq('id', input.contact_id as string).eq('account_id', accountId).single();
  const verified = check?.lead_status === input.lead_status;
  if (!verified) return { success: false, error: 'Update could not be verified', verified: false };
  return { success: true, data: { lead_status: input.lead_status }, verified: true };
}

async function toolUpdateLeadScore(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const score = Math.max(0, Math.min(100, Number(input.score)));
  const tier = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  const { error } = await supabase
    .from('contacts')
    .update({
      lead_score: score,
      lead_score_tier: tier,
      lead_score_reason: (input.reason as string) ?? null,
      lead_score_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.contact_id as string).eq('account_id', accountId);
  if (error) return { success: false, error: error.message };

  const { data: check } = await supabase
    .from('contacts').select('lead_score').eq('id', input.contact_id as string).eq('account_id', accountId).single();
  const verified = Number(check?.lead_score) === score;
  if (!verified) return { success: false, error: 'Score update could not be verified', verified: false };
  return { success: true, data: { score, tier }, verified: true };
}

async function toolUpdateContactField(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const allowed = ['name', 'email', 'company', 'source', 'phone'];
  const field = input.field as string;
  if (!allowed.includes(field)) return { success: false, error: `field "${field}" is not writable` };

  const { error } = await supabase
    .from('contacts').update({ [field]: input.value, updated_at: new Date().toISOString() })
    .eq('id', input.contact_id as string).eq('account_id', accountId);
  if (error) return { success: false, error: error.message };

  const { data: check } = await supabase
    .from('contacts').select(field).eq('id', input.contact_id as string).eq('account_id', accountId).single();
  const verified = check ? String((check as unknown as Record<string, unknown>)[field] ?? '') === String(input.value) : false;
  if (!verified) return { success: false, error: 'Field update could not be verified', verified: false };
  return { success: true, data: { field, value: input.value }, verified: true };
}

async function toolTag(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient, mode: 'add' | 'remove'): Promise<ToolResult> {
  const tag = (input.tag as string).trim();
  if (!tag) return { success: false, error: 'tag is required' };

  const { data: contact } = await supabase
    .from('contacts').select('tags').eq('id', input.contact_id as string).eq('account_id', accountId).single();
  if (!contact) return { success: false, error: 'Contact not found or access denied' };

  const current = Array.isArray(contact.tags) ? (contact.tags as string[]) : [];
  const exists = current.includes(tag);
  if (mode === 'add' && exists) return { success: true, data: { tags: current }, verified: true };
  if (mode === 'remove' && !exists) return { success: true, data: { tags: current }, verified: true };

  const next = mode === 'add' ? [...current, tag] : current.filter(t => t !== tag);
  const { error } = await supabase
    .from('contacts').update({ tags: next, updated_at: new Date().toISOString() })
    .eq('id', input.contact_id as string).eq('account_id', accountId);
  if (error) return { success: false, error: error.message };

  const { data: check } = await supabase
    .from('contacts').select('tags').eq('id', input.contact_id as string).eq('account_id', accountId).single();
  const finalTags = Array.isArray(check?.tags) ? (check?.tags as string[]) : [];
  const verified = mode === 'add' ? finalTags.includes(tag) : !finalTags.includes(tag);
  if (!verified) return { success: false, error: 'Tag update could not be verified', verified: false };
  return { success: true, data: { tags: finalTags }, verified: true };
}

async function toolAssignLead(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const userId = input.user_id as string;

  const { data: contact } = await supabase
    .from('contacts').select('id').eq('id', input.contact_id as string).eq('account_id', accountId).single();
  if (!contact) return { success: false, error: 'Contact not found or access denied' };

  const { data: member } = await supabase
    .from('profiles').select('user_id').eq('user_id', userId).eq('account_id', accountId).single();
  if (!member) return { success: false, error: 'Assignee is not a member of this account' };

  const { error } = await supabase
    .from('conversations')
    .update({ assigned_agent_id: userId, updated_at: new Date().toISOString() })
    .eq('account_id', accountId).eq('contact_id', input.contact_id as string);
  if (error) return { success: false, error: error.message };

  const { data: check } = await supabase
    .from('conversations').select('id, assigned_agent_id')
    .eq('account_id', accountId).eq('contact_id', input.contact_id as string);
  const convs = check ?? [];
  const verified = convs.length === 0 || convs.every(c => c.assigned_agent_id === userId);
  if (!verified) return { success: false, error: 'Assignment could not be verified', verified: false };
  return { success: true, data: { assigned: userId, conversations: convs.length }, verified: true };
}

async function toolCreateTask(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const row: Record<string, unknown> = {
    account_id: accountId,
    title: input.title as string,
    status: 'pending',
    due_date: (input.due_date as string) ?? new Date(Date.now() + 86400000).toISOString(),
  };
  if (input.contact_id) {
    const { data: c } = await supabase.from('contacts').select('id')
      .eq('id', input.contact_id as string).eq('account_id', accountId).single();
    if (!c) return { success: false, error: 'Contact not found or access denied' };
    row.contact_id = input.contact_id;
  }
  const { data, error } = await supabase.from('follow_ups').insert(row).select('id, title, due_date, status').single();
  if (error || !data) return { success: false, error: error?.message ?? 'insert failed' };
  return { success: true, data, verified: !!data.id };
}

async function toolUpdateDealStage(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data: stage } = await supabase
    .from('pipeline_stages').select('id').eq('id', input.stage_id as string).eq('account_id', accountId).single();
  if (!stage) return { success: false, error: 'Stage not found or access denied' };

  const { error } = await supabase
    .from('deals').update({ stage_id: input.stage_id as string, updated_at: new Date().toISOString() })
    .eq('id', input.deal_id as string).eq('account_id', accountId);
  if (error) return { success: false, error: error.message };

  const { data: check } = await supabase
    .from('deals').select('stage_id').eq('id', input.deal_id as string).eq('account_id', accountId).single();
  const verified = check?.stage_id === input.stage_id;
  if (!verified) return { success: false, error: 'Stage update could not be verified', verified: false };
  return { success: true, data: { stage_id: input.stage_id }, verified: true };
}

// ── AI-backed tools ───────────────────────────────────────────

interface LeadSignal {
  contactId: string;
  score: number;
  tier: 'hot' | 'warm' | 'cold';
  intent: string;
  messageCount: number;
  reason: string;
}

async function gatherLeadSignals(
  contactId: string, accountId: string, supabase: SupabaseClient
): Promise<{ contact: Record<string, unknown>; messages: { sender_type: string; content: string | null }[]; customerReplies: number } | null> {
  const { data: contact } = await supabase
    .from('contacts').select('*').eq('id', contactId).eq('account_id', accountId).single();
  if (!contact) return null;

  const { data: convs } = await supabase
    .from('conversations').select('id, platform, status, ai_intent, ai_sentiment, last_message_text')
    .eq('contact_id', contactId).eq('account_id', accountId).limit(5);
  const convIds = (convs ?? []).map((c: { id: string }) => c.id);
  const { data: messages } = convIds.length
    ? await supabase.from('messages').select('sender_type, content')
        .in('conversation_id', convIds).order('created_at', { ascending: false }).limit(20)
    : { data: [] as { sender_type: string; content: string | null }[] };

  const msgs = (messages ?? []) as { sender_type: string; content: string | null }[];
  const customerReplies = msgs.filter(m => m.sender_type === 'contact' || m.sender_type === 'customer').length;
  return { contact, messages: msgs, customerReplies };
}

function heuristicLead(signals: NonNullable<Awaited<ReturnType<typeof gatherLeadSignals>>>): LeadSignal {
  const { contact, customerReplies } = signals;
  let score = 0;
  if (customerReplies >= 5) score += 15;
  else if (customerReplies >= 2) score += 8;
  const status = contact.lead_status as string;
  if (status === 'qualified') score += 25;
  else if (status === 'proposal') score += 30;
  else if (status === 'negotiation') score += 35;
  else if (status === 'contacted') score += 10;
  if (contact.source) score += 5;
  score = Math.max(0, Math.min(100, score));
  return {
    contactId: contact.id as string,
    score,
    tier: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
    intent: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
    messageCount: customerReplies,
    reason: 'Heuristic score from engagement and pipeline status',
  };
}

async function toolAnalyzeLead(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const signals = await gatherLeadSignals(input.contact_id as string, accountId, supabase);
  if (!signals) return { success: false, error: 'Contact not found or access denied' };

  const base = heuristicLead(signals);
  const info = detectProvider();
  let final = base;

  if (info.configured) {
    const transcript = signals.messages
      .slice(0, 10).reverse()
      .map(m => `${m.sender_type === 'contact' || m.sender_type === 'customer' ? 'Customer' : 'Team'}: ${m.content ?? ''}`)
      .join('\n');
    const res = await completeJSON({
      provider: info.provider,
      model: info.model,
      system: 'You are a CRM lead analyst. Respond ONLY with JSON.',
      user: `Analyze this lead and return JSON {"score":0-100,"tier":"hot|warm|cold","intent":"high|medium|low","reason":"short"}. Contact: ${JSON.stringify({
        name: signals.contact.name, status: signals.contact.lead_status, source: signals.contact.source,
      })}. Transcript:\n${transcript || '(no messages)'}`,
    });
    await logAIOperation(supabase, {
      accountId, userId: null, operationType: 'agent:analyze_lead',
      provider: info.provider, model: info.model, latencyMs: res.latencyMs, success: res.ok, error: res.error,
    });
    const j = res.json as { score?: unknown; tier?: unknown; intent?: unknown; reason?: unknown } | null;
    if (res.ok && j) {
      const score = Math.max(0, Math.min(100, Number(j.score ?? base.score)));
      const tier = (['hot', 'warm', 'cold'].includes(String(j.tier)) ? String(j.tier) : score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold') as LeadSignal['tier'];
      final = { ...base, score, tier, intent: String(j.intent ?? base.intent), reason: String(j.reason ?? base.reason) };
    }
  }

  return {
    success: true,
    data: {
      contact_id: final.contactId, score: final.score, tier: final.tier, intent: final.intent,
      message_count: final.messageCount, reason: final.reason, source: info.configured ? info.provider : 'heuristic',
    },
  };
}

async function toolClassifyConversation(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, ai_intent, ai_sentiment, ai_summary')
    .eq('id', input.conversation_id as string).eq('account_id', accountId).single();
  if (!conv) return { success: false, error: 'Conversation not found or access denied' };

  const { data: messages } = await supabase
    .from('messages').select('sender_type, content')
    .eq('conversation_id', input.conversation_id as string)
    .order('created_at', { ascending: false }).limit(15);
  const transcript = (messages ?? []).slice().reverse()
    .map((m: { sender_type: string; content: string | null }) => `${m.sender_type === 'contact' || m.sender_type === 'customer' ? 'Customer' : 'Team'}: ${m.content ?? ''}`)
    .join('\n');

  const info = detectProvider();
  let intent = 'Unknown';
  let sentiment = 'neutral';
  let summary = '';
  let source = 'heuristic';

  if (info.configured) {
    const res = await completeJSON({
      provider: info.provider,
      model: info.model,
      system: 'You classify CRM conversations. Respond ONLY with JSON.',
      user: `Return JSON {"intent":"short label","sentiment":"positive|neutral|negative","summary":"one sentence"}. Conversation:\n${transcript || '(empty)'}`,
    });
    await logAIOperation(supabase, {
      accountId, userId: null, operationType: 'agent:classify_conversation',
      provider: info.provider, model: info.model, latencyMs: res.latencyMs, success: res.ok, error: res.error,
    });
    const j = res.json as { intent?: unknown; sentiment?: unknown; summary?: unknown } | null;
    if (res.ok && j) {
      intent = String(j.intent ?? intent);
      sentiment = ['positive', 'neutral', 'negative'].includes(String(j.sentiment)) ? String(j.sentiment) : sentiment;
      summary = String(j.summary ?? '');
      source = info.provider;
    }
  }
  if (!summary) {
    intent = conv.ai_intent ?? 'Unknown';
    sentiment = conv.ai_sentiment ?? 'neutral';
    summary = conv.ai_summary ?? (transcript ? transcript.slice(0, 180) : 'No messages yet.');
  }

  const { error } = await supabase
    .from('conversations')
    .update({ ai_intent: intent, ai_sentiment: sentiment, ai_summary: summary, ai_analyzed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', input.conversation_id as string).eq('account_id', accountId);
  if (error) return { success: false, error: error.message };

  const { data: check } = await supabase
    .from('conversations').select('ai_intent, ai_summary')
    .eq('id', input.conversation_id as string).eq('account_id', accountId).single();
  const verified = !!check && check.ai_summary === summary;
  if (!verified) return { success: false, error: 'Classification could not be verified', verified: false };
  return { success: true, data: { intent, sentiment, summary, source }, verified: true };
}

async function toolRecommendActions(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const signals = await gatherLeadSignals(input.contact_id as string, accountId, supabase);
  if (!signals) return { success: false, error: 'Contact not found or access denied' };

  const info = detectProvider();
  const base = heuristicLead(signals);
  let actions: { action: string; reason: string; urgency: string }[] = [];
  let source = 'heuristic';

  const fallback = () => {
    const out: { action: string; reason: string; urgency: string }[] = [];
    if (base.tier === 'hot') out.push({ action: 'Assign to a senior rep and call within 1 hour', reason: 'High engagement', urgency: 'immediate' });
    if (signals.contact.lead_status === 'new') out.push({ action: 'Send a qualification message', reason: 'Status is new', urgency: 'today' });
    out.push({ action: 'Create a follow-up task', reason: 'Keep the lead warm', urgency: 'this_week' });
    return out.slice(0, 5);
  };

  if (info.configured) {
    const transcript = signals.messages.slice(0, 10).reverse()
      .map(m => `${m.sender_type === 'contact' || m.sender_type === 'customer' ? 'Customer' : 'Team'}: ${m.content ?? ''}`).join('\n');
    const res = await completeJSON({
      provider: info.provider,
      model: info.model,
      system: 'You recommend CRM next-best actions. Respond ONLY with JSON.',
      user: `Return JSON {"actions":[{"action":"...","reason":"...","urgency":"immediate|today|this_week|low"}]} (max 5). Contact: ${JSON.stringify({
        status: signals.contact.lead_status, score: signals.contact.lead_score, source: signals.contact.source,
      })}. Transcript:\n${transcript || '(none)'}`,
    });
    await logAIOperation(supabase, {
      accountId, userId: null, operationType: 'agent:recommend_actions',
      provider: info.provider, model: info.model, latencyMs: res.latencyMs, success: res.ok, error: res.error,
    });
    const j = res.json as { actions?: unknown } | null;
    if (res.ok && j && Array.isArray(j.actions)) {
      actions = (j.actions as Record<string, unknown>[]).slice(0, 5).map(a => ({
        action: String(a.action ?? ''), reason: String(a.reason ?? ''), urgency: String(a.urgency ?? 'today'),
      })).filter(a => a.action);
      if (actions.length) source = info.provider;
    }
  }
  if (actions.length === 0) actions = fallback();

  return { success: true, data: { contact_id: input.contact_id, actions, source } };
}

async function toolGenerateReply(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data: conv } = await supabase
    .from('conversations').select('id').eq('id', input.conversation_id as string).eq('account_id', accountId).single();
  if (!conv) return { success: false, error: 'Conversation not found or access denied' };

  const FALLBACKS: Record<string, string> = {
    professional: 'Thank you for reaching out. We would be happy to assist you with your inquiry.',
    friendly: "Hey! Thanks for messaging us — we'd love to help. What can we do for you today?",
    short: "Thanks for your message! We'll get back to you shortly.",
    qualify: 'Thank you for your interest! Could you share your specific needs, budget, and timeline?',
    followup: "Hi! I'm following up on our previous conversation. Any questions I can help with?",
  };
  const action = (input.action as string) ?? 'professional';
  const info = detectProvider();

  if (!info.configured) {
    return { success: true, data: { reply: FALLBACKS[action] ?? FALLBACKS.professional, source: 'fallback' } };
  }

  const { data: messages } = await supabase
    .from('messages').select('sender_type, content')
    .eq('conversation_id', input.conversation_id as string)
    .order('created_at', { ascending: false }).limit(10);
  const transcript = (messages ?? []).reverse()
    .map((m: { sender_type: string; content: string | null }) => `${m.sender_type === 'contact' || m.sender_type === 'customer' ? 'Customer' : 'Team'}: ${m.content ?? ''}`)
    .join('\n');

  const toneMap: Record<string, string> = {
    professional: 'Write a professional, formal business reply.',
    friendly: 'Write a warm, friendly and conversational reply.',
    short: 'Write a very concise reply in 1-2 sentences.',
    qualify: 'Write a reply that qualifies this lead by asking about needs, budget, and timeline.',
    followup: 'Write a follow-up message to re-engage this customer.',
  };

  const res = await completeJSON({
    provider: info.provider,
    model: info.model,
    system: `You are a CRM sales assistant. ${toneMap[action] ?? toneMap.professional} Reply with ONLY the message text.`,
    user: `Conversation:\n${transcript}\n\nWrite the reply.`,
  });
  await logAIOperation(supabase, {
    accountId, userId: null, operationType: 'agent:generate_reply',
    provider: info.provider, model: info.model, latencyMs: res.latencyMs, success: res.ok, error: res.error,
  });
  const reply = res.ok ? res.text.trim() : '';
  return { success: true, data: { reply: reply || (FALLBACKS[action] ?? FALLBACKS.professional), source: reply ? info.provider : 'fallback' } };
}

async function toolSummarizeConversation(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data: conv } = await supabase
    .from('conversations').select('id, ai_intent, ai_sentiment, ai_summary')
    .eq('id', input.conversation_id as string).eq('account_id', accountId).single();
  if (!conv) return { success: false, error: 'Conversation not found or access denied' };
  if (conv.ai_summary) {
    return { success: true, data: { intent: conv.ai_intent, sentiment: conv.ai_sentiment, summary: conv.ai_summary, source: 'cached' } };
  }
  return await toolClassifyConversation(input, accountId, supabase);
}

async function toolPrepareMessage(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data: contact } = await supabase
    .from('contacts').select('id, name').eq('id', input.contact_id as string).eq('account_id', accountId).single();
  if (!contact) return { success: false, error: 'Contact not found or access denied' };

  const info = detectProvider();
  const purpose = input.purpose as string;
  let draft = `Hi ${contact.name ?? 'there'}, `;
  if (!info.configured) {
    draft += purpose;
    return { success: true, data: { draft, source: 'template', sent: false } };
  }
  const res = await completeJSON({
    provider: info.provider,
    model: info.model,
    system: 'You draft CRM outbound messages. Return ONLY the message text.',
    user: `Write a short ${purpose} message to ${contact.name ?? 'the customer'}. Do not invent facts.`,
  });
  await logAIOperation(supabase, {
    accountId, userId: null, operationType: 'agent:prepare_message',
    provider: info.provider, model: info.model, latencyMs: res.latencyMs, success: res.ok, error: res.error,
  });
  draft = res.ok && res.text.trim() ? res.text.trim() : draft + purpose;
  return { success: true, data: { draft, source: res.ok ? info.provider : 'template', sent: false } };
}

async function toolSendNotification(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  let contactId: string | null = null;
  if (input.contact_id) {
    const { data: c } = await supabase.from('contacts').select('id')
      .eq('id', input.contact_id as string).eq('account_id', accountId).single();
    if (!c) return { success: false, error: 'Contact not found or access denied' };
    contactId = input.contact_id as string;
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      account_id: accountId,
      user_id: null,
      type: 'agent',
      title: input.title as string,
      body: input.message as string,
      data: { contact_id: contactId, source: 'ai_agent' },
      is_read: false,
    })
    .select('id')
    .single();
  if (error || !data) return { success: false, error: error?.message ?? 'insert failed' };
  return { success: true, data: { notification_id: data.id }, verified: true };
}
