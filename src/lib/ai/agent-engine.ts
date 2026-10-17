/**
 * CRM 3.0 — Agent Execution Engine
 *
 * Full run lifecycle, implemented as an explicit 8-stage pipeline:
 *
 *   1. Trigger            — load + authorize agent, idempotency guard, open run
 *   2. Validate Data      — validate request + verify contact/conversation ownership
 *   3. AI Analysis        — structured LLM reasoning (or deterministic rule-based)
 *   4. Validate Decision  — validate the structured plan against the tool registry
 *   5. Check Permissions  — allow-list + approval gating per tool
 *   6. Execute Action     — run authorized tools with bounded, safe retries
 *   7. Verify Result      — require a confirmed backend result for write tools
 *   8. Save Execution Log — persist steps, run, audit trail and counters
 *
 * Security:
 *   - account_id ALWAYS from the session (never from the request body or the prompt).
 *   - Only tools in the registry can run. No arbitrary SQL, code or URLs.
 *   - Write tools must re-read and confirm before a run can be reported successful.
 * Limits: max 10 tool calls, bounded retries, request timeouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { TOOL_REGISTRY, executeTool, validateToolInput, type ToolResult } from './agent-tools';
import { completeJSON, detectProvider, logAIOperation, type AIProviderId } from './ai-provider';

const MAX_TOOL_CALLS = 10;
const MAX_RETRY_ATTEMPTS = 2;

export interface AgentRunInput {
  agentId: string;
  accountId: string;
  userId: string;
  input: string;
  contactId?: string;
  conversationId?: string;
  /** Optional key to make a run idempotent (safe retries / webhook redelivery). */
  idempotencyKey?: string;
}

export type RunStatus = 'completed' | 'failed' | 'awaiting_approval';

export interface AgentStep {
  stepNumber: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: Record<string, unknown>;
  status: 'completed' | 'failed' | 'awaiting_approval';
  durationMs: number;
  verified?: boolean;
  reason?: string;
}

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  proposedAction: string;
}

export interface StageRecord {
  stage: string;
  status: 'ok' | 'failed' | 'skipped';
  detail: string;
}

export interface AgentRunResult {
  runId: string;
  status: RunStatus;
  summary: string;
  steps: AgentStep[];
  pendingApprovals: PendingApproval[];
  error?: string;
  tokensUsed: number;
  provider: AIProviderId | string;
  usedAI: boolean;
  reused?: boolean;
  stages: StageRecord[];
}

// ── Agent Definitions (system instructions per type) ──────────
const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  sales_assistant: `You are a Sales Assistant AI for a CRM. Analyze leads and intent, recommend next best actions, create follow-up tasks, and summarize conversations. Gather real data with tools before recommending. Never invent data.`,
  lead_qualification: `You are a Lead Qualification AI. Analyze contact data and conversation history, score leads on engagement/intent/fit, update lead status when qualification is clear, and create follow-up tasks. Use analyze_lead first.`,
  followup: `You are a Follow-up Agent. Find overdue follow-ups, review prior interactions, and create specific follow-up tasks. Check existing follow-ups before creating new ones.`,
  customer_support: `You are a Customer Support AI. Analyze incoming conversations for intent and sentiment, summarize issues, and create support tasks. Never auto-send messages.`,
  content: `You are a Content AI. Generate content drafts and suggestions. All content is a DRAFT only — never publish without approval.`,
  appointment: `You are an Appointment Agent. Review upcoming and missed appointments and create reminder/re-engagement tasks. Create tasks rather than sending messages.`,
  customer_success: `You are a Customer Success AI. Analyze customer health, detect inactive customers, review deal history, and recommend retention actions.`,
};

interface AgentRow {
  id: string;
  account_id: string;
  name: string;
  type: string;
  enabled: boolean;
  instructions: string;
  allowed_tools: string[];
  requires_approval: boolean;
  max_actions_per_run: number;
  provider: string;
  model: string;
  temperature: number;
  execution_count: number;
  success_count: number;
  failure_count: number;
}

interface PlannedTool { tool: string; input: Record<string, unknown>; reason?: string }

interface ContactContext { contact: Record<string, unknown>; conversation: Record<string, unknown> | null }

// ── Helpers ───────────────────────────────────────────────────
function emptyResult(runId: string, error: string, provider: AIProviderId | string = 'rule_based'): AgentRunResult {
  return { runId, status: 'failed', summary: error, steps: [], pendingApprovals: [], error, tokensUsed: 0, provider, usedAI: false, stages: [] };
}

function stageRecord(list: StageRecord[], stage: string, status: StageRecord['status'], detail: string): void {
  list.push({ stage, status, detail });
}

async function execWithRetry(
  tool: string, input: Record<string, unknown>, accountId: string, supabase: SupabaseClient
): Promise<ToolResult> {
  let last: ToolResult = { success: false, error: 'not executed' };
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    last = await executeTool(tool, input, accountId, supabase);
    if (last.success) return last;
    const nonRetryable = last.error && /not found|access denied|invalid|not writable|not a member|invalid input|unknown tool/i.test(last.error);
    if (nonRetryable) return last;
    if (attempt < MAX_RETRY_ATTEMPTS - 1) await new Promise(res => setTimeout(res, 250 * (attempt + 1)));
  }
  return last;
}

function isWriteTool(toolName: string): boolean {
  const def = TOOL_REGISTRY[toolName];
  return !!def && (def.category === 'crm_write' || def.category === 'communication');
}

// ── Build CRM context for the agent ───────────────────────────
async function buildContext(
  input: AgentRunInput, supabase: SupabaseClient, ctx: ContactContext
): Promise<string> {
  const parts: string[] = [`User request: ${input.input}`];

  if (ctx.contact && ctx.contact.id) {
    parts.push(`Contact context: ${JSON.stringify({
      name: ctx.contact.name, email: ctx.contact.email, phone: ctx.contact.phone,
      lead_status: ctx.contact.lead_status, lead_score: ctx.contact.lead_score,
      lead_score_tier: ctx.contact.lead_score_tier, source: ctx.contact.source, tags: ctx.contact.tags,
    })}`);
  }

  if (ctx.conversation && ctx.conversation.id) {
    parts.push(`Conversation context: ${JSON.stringify({
      platform: ctx.conversation.platform, status: ctx.conversation.status,
      ai_intent: ctx.conversation.ai_intent, ai_sentiment: ctx.conversation.ai_sentiment,
    })}`);
  } else if (input.conversationId) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('platform, status, ai_intent, ai_sentiment, ai_summary')
      .eq('id', input.conversationId).eq('account_id', input.accountId).single();
    if (conv) parts.push(`Conversation context: ${JSON.stringify(conv)}`);
  }

  return parts.join('\n\n');
}

// ── Rule-based reasoning (deterministic fallback, no LLM) ─────
function ruleBasedReason(agentType: string, userInput: string, allowedTools: string[]): PlannedTool[] {
  const input = userInput.toLowerCase();
  const plan: PlannedTool[] = [];
  const canUse = (t: string) => allowedTools.includes(t) && !!TOOL_REGISTRY[t];

  if (agentType === 'lead_qualification' && canUse('analyze_lead')) {
    plan.push({ tool: 'analyze_lead', input: {}, reason: 'Baseline lead analysis' });
  }
  if (agentType === 'lead_qualification' || agentType === 'sales_assistant') {
    if (canUse('get_hot_leads') && (input.includes('hot') || input.includes('lead') || input.includes('qualif'))) {
      plan.push({ tool: 'get_hot_leads', input: { min_score: 60, limit: 10 }, reason: 'Find high-intent leads' });
    }
    if (canUse('get_overdue_followups') && (input.includes('overdue') || input.includes('follow'))) {
      plan.push({ tool: 'get_overdue_followups', input: { limit: 10 }, reason: 'Surface overdue follow-ups' });
    }
  }
  if (agentType === 'followup' && canUse('get_overdue_followups')) {
    plan.push({ tool: 'get_overdue_followups', input: { limit: 20 }, reason: 'Find overdue follow-ups' });
  }
  if (agentType === 'customer_support') {
    if (canUse('search_conversations')) plan.push({ tool: 'search_conversations', input: { status: 'open', limit: 20 }, reason: 'Review open support conversations' });
    if (canUse('get_overdue_followups')) plan.push({ tool: 'get_overdue_followups', input: { limit: 10 }, reason: 'Surface overdue follow-ups' });
  }
  if (agentType === 'customer_success' && canUse('list_deals')) {
    plan.push({ tool: 'list_deals', input: { limit: 20 }, reason: 'Review deals for retention signals' });
  }
  if (agentType === 'appointment' && canUse('get_overdue_followups')) {
    plan.push({ tool: 'get_overdue_followups', input: { limit: 20 }, reason: 'Find missed appointments' });
  }

  if (plan.length === 0) {
    if (canUse('analyze_lead')) plan.push({ tool: 'analyze_lead', input: {}, reason: 'Default lead analysis' });
    else if (canUse('get_hot_leads')) plan.push({ tool: 'get_hot_leads', input: { min_score: 50, limit: 5 }, reason: 'Default lead scan' });
    else if (canUse('get_overdue_followups')) plan.push({ tool: 'get_overdue_followups', input: { limit: 10 }, reason: 'Default follow-up scan' });
  }

  return plan.slice(0, MAX_TOOL_CALLS);
}

// ── LLM reasoning (structured) ────────────────────────────────
interface ReasoningResult {
  analysis: string;
  plan: PlannedTool[];
  usedAI: boolean;
  provider: AIProviderId;
  tokens: number;
}

async function llmReason(
  agent: AgentRow, context: string, allowedTools: string[], supabase: SupabaseClient, userId: string
): Promise<ReasoningResult> {
  const info = detectProvider(agent.provider);
  if (!info.configured) {
    return { analysis: '', plan: [], usedAI: false, provider: 'rule_based', tokens: 0 };
  }

  const availableTools = allowedTools
    .filter(t => TOOL_REGISTRY[t])
    .map(t => {
      const def = TOOL_REGISTRY[t];
      const schema = Object.entries(def.inputSchema)
        .map(([k, s]) => `${k}${s.required ? '' : '?'}:${s.type}`).join(', ');
      return `- ${t}(${schema}) — ${def.description}`;
    })
    .join('\n');

  const systemPrompt = AGENT_SYSTEM_PROMPTS[agent.type] ?? agent.instructions ?? `You are a CRM ${agent.type} agent.`;

  const prompt = `${systemPrompt}

Available tools:
${availableTools || '(none)'}

Context:
${context}

Respond ONLY with a JSON object of the form:
{"analysis": "one short sentence", "tools": [{"tool": "tool_name", "input": {...}, "reason": "why"}]}
Rules: use at most ${MAX_TOOL_CALLS} tools, only from the available list, and only tools needed for the request. If none are needed return {"analysis": "...", "tools": []}.`;

  const res = await completeJSON({
    provider: info.provider,
    model: agent.model || info.model,
    system: 'You are a precise CRM automation planner. Respond only with valid JSON.',
    user: prompt,
    temperature: agent.temperature ?? 0.3,
    maxTokens: 1200,
  });

  await logAIOperation(supabase, {
    accountId: agent.account_id, userId, operationType: `agent:${agent.type}:plan`,
    provider: info.provider, model: agent.model || info.model,
    latencyMs: res.latencyMs, success: res.ok, error: res.error,
  });

  if (!res.ok || !res.json) {
    return { analysis: '', plan: [], usedAI: false, provider: info.provider, tokens: 0 };
  }

  const parsed = res.json as { analysis?: unknown; tools?: unknown };
  const rawTools = Array.isArray(parsed.tools) ? (parsed.tools as Record<string, unknown>[]) : [];
  const plan: PlannedTool[] = rawTools.slice(0, MAX_TOOL_CALLS).map(t => ({
    tool: String(t.tool ?? ''),
    input: (t.input && typeof t.input === 'object' ? t.input as Record<string, unknown> : {}),
    reason: t.reason ? String(t.reason) : undefined,
  })).filter(t => t.tool);

  return { analysis: String(parsed.analysis ?? ''), plan, usedAI: true, provider: info.provider, tokens: 0 };
}

// ── Generate a human summary from results ─────────────────────
function generateSummary(agentType: string, steps: AgentStep[], userInput: string, analysis: string): string {
  const completed = steps.filter(s => s.status === 'completed');
  const failed = steps.filter(s => s.status === 'failed');
  const pending = steps.filter(s => s.status === 'awaiting_approval');

  const parts: string[] = [];
  if (analysis) parts.push(analysis);
  parts.push(`${agentType.replace(/_/g, ' ')} agent completed ${completed.length} action(s).`);

  const detail = completed.map(s => {
    const out = s.toolOutput as Record<string, unknown>;
    const data = out.data as unknown;
    if (Array.isArray(data)) return `${s.toolName}: ${data.length} record(s)`;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (d.score !== undefined) return `analyze_lead: score ${d.score} (${d.tier ?? 'n/a'})`;
      if (d.draft) return 'prepare_message: draft ready';
      if (d.reply) return 'generate_reply: suggestion ready';
      if (d.actions) return `recommend_actions: ${(d.actions as unknown[]).length} suggestion(s)`;
      if (d.tags) return `${s.toolName}: tags updated`;
      return `${s.toolName}: ok`;
    }
    return s.toolName;
  });
  if (detail.length) parts.push(detail.join('; ') + '.');
  if (pending.length) parts.push(`${pending.length} action(s) awaiting approval.`);
  if (failed.length) parts.push(`${failed.length} action(s) failed.`);
  if (completed.length === 0 && failed.length === 0 && pending.length === 0) {
    parts.push(`No actions were required for: "${userInput}".`);
  }
  return parts.join(' ');
}

// ── Main execution ────────────────────────────────────────────
export async function runAgent(input: AgentRunInput, supabase: SupabaseClient): Promise<AgentRunResult> {
  const startTime = Date.now();
  const stages: StageRecord[] = [];

  // ── STAGE 1: TRIGGER ────────────────────────────────────────
  const { data: agentData, error: agentErr } = await supabase
    .from('crm3_ai_agents').select('*')
    .eq('id', input.agentId).eq('account_id', input.accountId).single();

  if (agentErr || !agentData) return emptyResult('', 'Agent not found or access denied');
  const agent = agentData as AgentRow;
  if (!agent.enabled) return emptyResult('', 'Agent is disabled', detectProvider(agent.provider).provider);

  const providerInfo = detectProvider(agent.provider);
  stageRecord(stages, 'trigger', 'ok', `Agent "${agent.name}" authorized`);

  // Idempotency guard — reuse a prior terminal run with the same key.
  if (input.idempotencyKey) {
    const { data: prior } = await supabase
      .from('crm3_ai_agent_runs')
      .select('id, status, result_summary, error_message, actions_taken, tokens_used')
      .eq('account_id', input.accountId)
      .contains('input_context', { idempotency_key: input.idempotencyKey })
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior) {
      if (prior.status === 'running') {
        return { ...emptyResult(prior.id as string, 'A run with this idempotency key is already in progress', providerInfo.provider), reused: true, stages };
      }
      const priorSteps = (prior.actions_taken as AgentStep[] | null) ?? [];
      stageRecord(stages, 'trigger', 'ok', 'Reused prior run for idempotency key');
      return {
        runId: prior.id as string,
        status: prior.status as RunStatus,
        summary: (prior.result_summary as string) ?? 'Reused prior run',
        steps: priorSteps,
        pendingApprovals: [],
        error: (prior.error_message as string) ?? undefined,
        tokensUsed: (prior.tokens_used as number) ?? 0,
        provider: providerInfo.provider,
        usedAI: false,
        reused: true,
        stages,
      };
    }
  }

  // Open the run record.
  const { data: run, error: runErr } = await supabase
    .from('crm3_ai_agent_runs')
    .insert({
      account_id: input.accountId,
      agent_id: input.agentId,
      triggered_by: input.userId,
      status: 'running',
      input_context: {
        input: input.input,
        contactId: input.contactId,
        conversationId: input.conversationId,
        ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
      },
      contact_id: input.contactId ?? null,
      conversation_id: input.conversationId ?? null,
      actions_taken: [],
      tokens_used: 0,
    })
    .select('id')
    .single();

  if (runErr || !run) return { ...emptyResult('', 'Failed to create run record'), stages };
  const runId = run.id as string;

  const steps: AgentStep[] = [];
  const pendingApprovals: PendingApproval[] = [];
  let tokensUsed = 0;
  let usedAI = false;

  const failRun = async (message: string, stageName: string): Promise<AgentRunResult> => {
    stageRecord(stages, stageName, 'failed', message);
    await supabase.from('crm3_ai_agent_runs')
      .update({ status: 'failed', error_message: message, result_summary: message, completed_at: new Date().toISOString(), duration_ms: Date.now() - startTime, actions_taken: steps })
      .eq('id', runId);
    await supabase.from('crm3_ai_agents')
      .update({ execution_count: (agent.execution_count ?? 0) + 1, failure_count: (agent.failure_count ?? 0) + 1, last_run_at: new Date().toISOString() })
      .eq('id', input.agentId);
    await supabase.from('crm3_agent_audit_log').insert({
      account_id: input.accountId, agent_id: input.agentId, run_id: runId, user_id: input.userId,
      event_type: 'run_failed', event_data: { stage: stageName, error: message },
    });
    return { runId, status: 'failed', summary: message, steps, pendingApprovals, error: message, tokensUsed, provider: providerInfo.provider, usedAI, stages };
  };

  try {
    // ── STAGE 2: VALIDATE DATA ────────────────────────────────
    if (!input.input || !input.input.trim()) {
      return await failRun('input is required', 'validate_data');
    }

    const ctx: ContactContext = { contact: {}, conversation: null };

    if (input.contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, name, email, phone, company, source, tags, lead_status, lead_score, lead_score_tier, opt_out, last_customer_reply_at, updated_at, created_at')
        .eq('id', input.contactId).eq('account_id', input.accountId).single();
      if (!contact) return await failRun('Contact not found in this account', 'validate_data');
      ctx.contact = contact as Record<string, unknown>;
    }

    if (input.conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, platform, status, assigned_agent_id, contact_id, ai_intent, ai_sentiment')
        .eq('id', input.conversationId).eq('account_id', input.accountId).single();
      if (!conv) return await failRun('Conversation not found in this account', 'validate_data');
      ctx.conversation = conv as Record<string, unknown>;
    }

    stageRecord(stages, 'validate_data', 'ok', input.contactId || input.conversationId ? 'Ownership verified' : 'Account-scoped run');

    // ── STAGE 3: AI ANALYSIS ──────────────────────────────────
    const context = await buildContext(input, supabase, ctx);
    const allowedTools = (agent.allowed_tools as string[]) ?? [];
    const reasoning = await llmReason(agent, context, allowedTools, supabase, input.userId);
    usedAI = reasoning.usedAI;
    tokensUsed = reasoning.tokens;

    let plan = reasoning.plan;
    if (plan.length === 0) {
      plan = ruleBasedReason(agent.type, input.input, allowedTools);
      stageRecord(stages, 'ai_analysis', 'ok', reasoning.usedAI ? 'LLM returned no tools; used deterministic fallback' : `Rule-based planning (${providerInfo.configured ? 'LLM unavailable' : 'no AI key configured'})`);
    } else {
      stageRecord(stages, 'ai_analysis', 'ok', `LLM planned ${plan.length} tool call(s) via ${reasoning.provider}`);
    }

    // Inject the run's contact/conversation into context tools when omitted.
    plan = plan.map(p => {
      const inp = { ...p.input };
      if (ctx.contact.id && !inp.contact_id && TOOL_REGISTRY[p.tool]?.inputSchema.contact_id) inp.contact_id = ctx.contact.id;
      if (ctx.conversation?.id && !inp.conversation_id && TOOL_REGISTRY[p.tool]?.inputSchema.conversation_id) inp.conversation_id = ctx.conversation.id;
      return { ...p, input: inp };
    });

    // ── STAGE 4: VALIDATE DECISION ────────────────────────────
    const maxActions = Math.min(agent.max_actions_per_run || MAX_TOOL_CALLS, MAX_TOOL_CALLS);
    const planned = plan.slice(0, maxActions);
    const decisionErrors: string[] = [];
    const candidates: { tool: string; input: Record<string, unknown>; reason?: string; invalid?: string }[] = [];

    for (const item of planned) {
      if (!TOOL_REGISTRY[item.tool]) {
        decisionErrors.push(`unknown tool "${item.tool}"`);
        candidates.push({ tool: item.tool, input: item.input, invalid: `Unknown tool "${item.tool}"` });
        continue;
      }
      const v = validateToolInput(item.tool, item.input);
      if (!v.valid) {
        decisionErrors.push(`${item.tool}: ${v.errors.join(', ')}`);
        candidates.push({ tool: item.tool, input: item.input, invalid: `Invalid input: ${v.errors.join('; ')}` });
        continue;
      }
      candidates.push({ tool: item.tool, input: v.normalized, reason: item.reason });
    }

    stageRecord(
      stages, 'validate_decision', 'ok',
      `${candidates.length - candidates.filter(c => c.invalid).length}/${candidates.length} tool call(s) valid${decisionErrors.length ? ` — ${decisionErrors.length} rejected` : ''}`
    );

    // ── STAGES 5-7: PERMISSIONS → EXECUTE → VERIFY ────────────
    for (let i = 0; i < candidates.length && i < MAX_TOOL_CALLS; i++) {
      const c = candidates[i];
      const stepNumber = i + 1;

      if (c.invalid) {
        steps.push({ stepNumber, toolName: c.tool, toolInput: c.input, toolOutput: { error: c.invalid }, status: 'failed', durationMs: 0, reason: 'decision_rejected' });
        continue;
      }

      // STAGE 5: CHECK PERMISSIONS
      if (!allowedTools.includes(c.tool)) {
        steps.push({ stepNumber, toolName: c.tool, toolInput: c.input, toolOutput: { error: 'Tool not permitted for this agent' }, status: 'failed', durationMs: 0, reason: c.reason });
        continue;
      }

      const toolDef = TOOL_REGISTRY[c.tool];

      if (toolDef.approval === 'requires_approval' && agent.requires_approval) {
        const proposed = `${c.tool}: ${JSON.stringify(c.input)}`;
        const { data: approval } = await supabase
          .from('crm3_agent_approvals')
          .insert({
            account_id: input.accountId, run_id: runId, agent_id: input.agentId,
            tool_name: c.tool, tool_input: c.input, proposed_action: proposed, status: 'pending',
          })
          .select('id').single();
        if (approval) {
          pendingApprovals.push({ approvalId: approval.id as string, toolName: c.tool, toolInput: c.input, proposedAction: proposed });
          const step: AgentStep = { stepNumber, toolName: c.tool, toolInput: c.input, toolOutput: { pending_approval: true }, status: 'awaiting_approval', durationMs: 0, reason: c.reason };
          steps.push(step);
          await supabase.from('crm3_agent_execution_steps').insert({
            account_id: input.accountId, run_id: runId, step_number: stepNumber, tool_name: c.tool,
            tool_input: c.input, tool_output: step.toolOutput, status: 'awaiting_approval', duration_ms: 0,
          });
          await supabase.from('crm3_agent_audit_log').insert({
            account_id: input.accountId, agent_id: input.agentId, run_id: runId, user_id: input.userId,
            event_type: 'approval_requested', event_data: { tool: c.tool, input: c.input },
          });
        }
        continue;
      }

      // STAGE 6: EXECUTE ACTION (with safe retries)
      const stepStart = Date.now();
      const result = await execWithRetry(c.tool, c.input, input.accountId, supabase);
      const durationMs = Date.now() - stepStart;

      // STAGE 7: VERIFY RESULT — writes must be confirmed.
      let ok = result.success;
      let output: Record<string, unknown> = result.success ? { data: result.data } : { error: result.error };
      let verified: boolean | undefined = result.verified;

      if (result.success && isWriteTool(c.tool) && result.verified !== true) {
        ok = false;
        verified = false;
        output = { error: 'Write could not be verified by a follow-up read', data: result.data };
      }
      if (ok && isWriteTool(c.tool)) verified = true;

      steps.push({
        stepNumber, toolName: c.tool, toolInput: c.input, toolOutput: output,
        status: ok ? 'completed' : 'failed', durationMs, verified, reason: c.reason,
      });

      await supabase.from('crm3_agent_execution_steps').insert({
        account_id: input.accountId, run_id: runId, step_number: stepNumber, tool_name: c.tool,
        tool_input: c.input, tool_output: { ...output, verified: verified ?? null },
        status: ok ? 'completed' : 'failed', error_message: ok ? null : (result.error ?? null), duration_ms: durationMs,
      });

      if (!ok) {
        // Stop the plan on the first hard failure (no partial cascades).
        break;
      }
    }

    stageRecord(
      stages, 'execute_verify',
      steps.some(s => s.status === 'failed') ? 'failed' : 'ok',
      `${steps.filter(s => s.status === 'completed').length} executed, ${steps.filter(s => s.status === 'failed').length} failed, ${pendingApprovals.length} awaiting approval`
    );

    // ── STAGE 8: SAVE EXECUTION LOG ───────────────────────────
    const hasPending = pendingApprovals.length > 0;
    const anyCompleted = steps.some(s => s.status === 'completed');
    const anyFailed = steps.some(s => s.status === 'failed');
    const finalStatus: RunStatus = hasPending ? 'awaiting_approval' : anyFailed && !anyCompleted ? 'failed' : anyFailed && anyCompleted ? 'completed' : 'completed';

    const summary = generateSummary(agent.type, steps, input.input, reasoning.analysis);

    await supabase.from('crm3_ai_agent_runs')
      .update({
        status: finalStatus,
        actions_taken: steps,
        result_summary: summary,
        error_message: anyFailed
          ? String((steps.find(s => s.status === 'failed')?.toolOutput as Record<string, unknown> | undefined)?.error ?? 'One or more actions failed')
          : null,
        tokens_used: tokensUsed,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      })
      .eq('id', runId);

    await supabase.from('crm3_ai_agents')
      .update({
        execution_count: (agent.execution_count ?? 0) + 1,
        last_run_at: new Date().toISOString(),
        ...(finalStatus === 'completed' ? { success_count: (agent.success_count ?? 0) + 1 } : {}),
        ...(finalStatus === 'failed' ? { failure_count: (agent.failure_count ?? 0) + 1 } : {}),
      })
      .eq('id', input.agentId);

    await supabase.from('crm3_agent_audit_log').insert({
      account_id: input.accountId, agent_id: input.agentId, run_id: runId, user_id: input.userId,
      event_type: finalStatus === 'completed' ? 'run_completed' : finalStatus === 'failed' ? 'run_failed' : 'run_awaiting_approval',
      event_data: { steps: steps.length, tokens: tokensUsed, duration_ms: Date.now() - startTime, used_ai: usedAI, provider: providerInfo.provider },
    });

    stageRecord(stages, 'save_log', 'ok', `Run ${finalStatus}`);

    return { runId, status: finalStatus, summary, steps, pendingApprovals, tokensUsed, provider: providerInfo.provider, usedAI, stages };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Execution error';
    return await failRun(errMsg, 'execute_verify');
  }
}
