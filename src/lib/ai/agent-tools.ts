/**
 * CRM 3.0 — Agent Tool Registry
 * Every tool an agent can call is registered here.
 * Agents CANNOT call anything outside this registry.
 * Every tool validates account_id from session — never from agent prompt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ToolCategory = 'crm_read' | 'crm_write' | 'ai' | 'communication';
export type ApprovalLevel = 'auto' | 'requires_approval';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
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
  // CRM READ
  get_contact: {
    name: 'get_contact',
    description: 'Get a contact by ID including lead score and status',
    category: 'crm_read',
    approval: 'auto',
    inputSchema: { contact_id: { type: 'string', required: true, description: 'Contact UUID' } },
  },
  get_conversation: {
    name: 'get_conversation',
    description: 'Get a conversation with recent messages',
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
  // CRM WRITE
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
  create_task: {
    name: 'create_task',
    description: 'Create an internal task (not sent to customer)',
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
  // AI TOOLS
  analyze_lead: {
    name: 'analyze_lead',
    description: 'Run AI lead intelligence analysis on a contact',
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
};

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

  try {
    switch (toolName) {
      case 'get_contact': return await toolGetContact(input, accountId, supabase);
      case 'get_conversation': return await toolGetConversation(input, accountId, supabase);
      case 'get_messages': return await toolGetMessages(input, accountId, supabase);
      case 'get_deal': return await toolGetDeal(input, accountId, supabase);
      case 'get_followups': return await toolGetFollowups(input, accountId, supabase);
      case 'search_contacts': return await toolSearchContacts(input, accountId, supabase);
      case 'get_overdue_followups': return await toolGetOverdueFollowups(input, accountId, supabase);
      case 'get_hot_leads': return await toolGetHotLeads(input, accountId, supabase);
      case 'create_followup': return await toolCreateFollowup(input, accountId, supabase);
      case 'update_lead_status': return await toolUpdateLeadStatus(input, accountId, supabase);
      case 'update_lead_score': return await toolUpdateLeadScore(input, accountId, supabase);
      case 'create_task': return await toolCreateTask(input, accountId, supabase);
      case 'update_deal_stage': return await toolUpdateDealStage(input, accountId, supabase);
      case 'analyze_lead': return await toolAnalyzeLead(input, accountId, supabase);
      case 'generate_reply': return await toolGenerateReply(input, accountId, supabase);
      case 'summarize_conversation': return await toolSummarizeConversation(input, accountId, supabase);
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
    .select('id, name, phone, email, lead_score, lead_score_tier, lead_status, source, created_at')
    .eq('id', input.contact_id as string)
    .eq('account_id', accountId)
    .single();
  if (error || !data) return { success: false, error: 'Contact not found or access denied' };
  return { success: true, data };
}

async function toolGetConversation(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, platform, status, priority, unread_count, last_message_text, last_message_at, ai_intent, ai_sentiment, ai_summary, ai_lead_score')
    .eq('id', input.conversation_id as string)
    .eq('account_id', accountId)
    .single();
  if (error || !data) return { success: false, error: 'Conversation not found or access denied' };
  return { success: true, data };
}

async function toolGetMessages(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  // Verify conversation belongs to account first
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', input.conversation_id as string)
    .eq('account_id', accountId)
    .single();
  if (!conv) return { success: false, error: 'Conversation not found or access denied' };

  const limit = Math.min((input.limit as number) ?? 20, 50);
  const { data } = await supabase
    .from('messages')
    .select('id, content_text, sender_type, created_at, status')
    .eq('conversation_id', input.conversation_id as string)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { success: true, data: (data ?? []).reverse() };
}

async function toolGetDeal(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('deals')
    .select('id, title, value, currency, status, updated_at')
    .eq('id', input.deal_id as string)
    .eq('account_id', accountId)
    .single();
  if (error || !data) return { success: false, error: 'Deal not found or access denied' };
  return { success: true, data };
}

async function toolGetFollowups(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data } = await supabase
    .from('follow_ups')
    .select('id, title, status, due_date, notes')
    .eq('contact_id', input.contact_id as string)
    .eq('account_id', accountId)
    .order('due_date', { ascending: true })
    .limit(10);
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
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .lt('due_date', new Date().toISOString())
    .order('due_date', { ascending: true })
    .limit(limit);
  return { success: true, data: data ?? [] };
}

async function toolGetHotLeads(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const minScore = (input.min_score as number) ?? 60;
  const limit = Math.min((input.limit as number) ?? 10, 50);
  const { data } = await supabase
    .from('contacts')
    .select('id, name, phone, email, lead_score, lead_score_tier, lead_status, last_customer_reply_at')
    .eq('account_id', accountId)
    .gte('lead_score', minScore)
    .order('lead_score', { ascending: false })
    .limit(limit);
  return { success: true, data: data ?? [] };
}

async function toolCreateFollowup(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  // Verify contact belongs to account
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', input.contact_id as string)
    .eq('account_id', accountId)
    .single();
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
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function toolUpdateLeadStatus(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const validStatuses = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  if (!validStatuses.includes(input.lead_status as string)) {
    return { success: false, error: `Invalid lead_status. Must be one of: ${validStatuses.join(', ')}` };
  }
  const { error } = await supabase
    .from('contacts')
    .update({ lead_status: input.lead_status as string })
    .eq('id', input.contact_id as string)
    .eq('account_id', accountId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: { updated: true, lead_status: input.lead_status } };
}

async function toolUpdateLeadScore(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const score = Math.max(0, Math.min(100, input.score as number));
  const tier = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  const { error } = await supabase
    .from('contacts')
    .update({
      lead_score: score,
      lead_score_tier: tier,
      lead_score_reason: (input.reason as string) ?? null,
      lead_score_updated_at: new Date().toISOString(),
    })
    .eq('id', input.contact_id as string)
    .eq('account_id', accountId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: { score, tier } };
}

async function toolCreateTask(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  // Tasks are stored as follow_ups with no contact (internal)
  const row: Record<string, unknown> = {
    account_id: accountId,
    title: input.title as string,
    status: 'pending',
    due_date: (input.due_date as string) ?? new Date(Date.now() + 86400000).toISOString(),
  };
  if (input.contact_id) {
    // Verify ownership
    const { data: c } = await supabase.from('contacts').select('id').eq('id', input.contact_id as string).eq('account_id', accountId).single();
    if (c) row.contact_id = input.contact_id;
  }
  const { data, error } = await supabase.from('follow_ups').insert(row).select().single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function toolUpdateDealStage(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { error } = await supabase
    .from('deals')
    .update({ stage_id: input.stage_id as string, updated_at: new Date().toISOString() })
    .eq('id', input.deal_id as string)
    .eq('account_id', accountId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: { updated: true } };
}

async function toolAnalyzeLead(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  // Reuse existing lead intelligence logic inline (no HTTP call needed server-side)
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', input.contact_id as string)
    .eq('account_id', accountId)
    .single();
  if (!contact) return { success: false, error: 'Contact not found' };

  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', input.contact_id as string)
    .eq('account_id', accountId)
    .limit(5);

  const convIds = (convs ?? []).map((c: { id: string }) => c.id);
  const { data: messages } = convIds.length
    ? await supabase.from('messages').select('content_text, sender_type').in('conversation_id', convIds).order('created_at', { ascending: false }).limit(20)
    : { data: [] };

  const customerMsgs = (messages ?? []).filter((m: { sender_type: string }) => m.sender_type === 'customer');
  let score = 0;
  if (customerMsgs.length >= 5) score += 15;
  else if (customerMsgs.length >= 2) score += 8;
  if (contact.lead_status === 'qualified') score += 25;
  else if (contact.lead_status === 'proposal') score += 30;
  else if (contact.lead_status === 'contacted') score += 10;
  score = Math.max(0, Math.min(100, score));

  return {
    success: true,
    data: {
      contact_id: input.contact_id,
      score,
      tier: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
      intent: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
      message_count: customerMsgs.length,
    },
  };
}

async function toolGenerateReply(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  // Verify conversation ownership
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', input.conversation_id as string)
    .eq('account_id', accountId)
    .single();
  if (!conv) return { success: false, error: 'Conversation not found or access denied' };

  const FALLBACKS: Record<string, string> = {
    professional: 'Thank you for reaching out. We would be happy to assist you with your inquiry.',
    friendly: "Hey! Thanks for messaging us 😊 We'd love to help — what can we do for you today?",
    short: "Thanks for your message! We'll get back to you shortly.",
    qualify: 'Thank you for your interest! Could you share your specific needs, budget, and timeline?',
    followup: "Hi! I'm following up on our previous conversation. Any questions I can help with?",
  };

  const action = (input.action as string) ?? 'professional';
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return { success: true, data: { reply: FALLBACKS[action] ?? FALLBACKS.professional, source: 'fallback' } };
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('content_text, sender_type')
    .eq('conversation_id', input.conversation_id as string)
    .order('created_at', { ascending: false })
    .limit(10);

  const transcript = (messages ?? []).reverse()
    .map((m: { sender_type: string; content_text: string | null }) => `${m.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${m.content_text ?? ''}`)
    .join('\n');

  const toneMap: Record<string, string> = {
    professional: 'Write a professional, formal business reply.',
    friendly: 'Write a warm, friendly and conversational reply.',
    short: 'Write a very concise reply in 1-2 sentences.',
    qualify: 'Write a reply that qualifies this lead by asking about needs, budget, and timeline.',
    followup: 'Write a follow-up message to re-engage this customer.',
  };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `You are a CRM sales assistant. ${toneMap[action] ?? toneMap.professional} Reply with ONLY the message text.` },
          { role: 'user', content: `Conversation:\n${transcript}\n\nWrite the reply:` },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });
    if (!res.ok) throw new Error('OpenAI unavailable');
    const d = await res.json() as { choices: { message: { content: string } }[] };
    return { success: true, data: { reply: d.choices[0].message.content.trim(), source: 'openai' } };
  } catch {
    return { success: true, data: { reply: FALLBACKS[action] ?? FALLBACKS.professional, source: 'fallback' } };
  }
}

async function toolSummarizeConversation(input: Record<string, unknown>, accountId: string, supabase: SupabaseClient): Promise<ToolResult> {
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, ai_intent, ai_sentiment, ai_summary')
    .eq('id', input.conversation_id as string)
    .eq('account_id', accountId)
    .single();
  if (!conv) return { success: false, error: 'Conversation not found or access denied' };

  // Return existing AI analysis if available
  if (conv.ai_summary) {
    return { success: true, data: { intent: conv.ai_intent, sentiment: conv.ai_sentiment, summary: conv.ai_summary, source: 'cached' } };
  }

  return { success: true, data: { intent: 'unknown', sentiment: 'neutral', summary: 'No summary available yet. Run AI analysis first.', source: 'none' } };
}
