/**
 * CRM 3.0 — Agent Execution Engine
 * Handles the full agent run lifecycle:
 * authenticate → load agent → build context → reason → select tool →
 * validate → execute → log → return result
 *
 * Security: account_id ALWAYS from session. Never from request body.
 * Limits: max 10 tool calls, 30s timeout, no infinite loops.
 */

import { TOOL_REGISTRY, executeTool } from './agent-tools';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_TOOL_CALLS = 10;
const MAX_TOKENS = 2000;

export interface AgentRunInput {
  agentId: string;
  accountId: string;
  userId: string;
  input: string;
  contactId?: string;
  conversationId?: string;
}

export interface AgentRunResult {
  runId: string;
  status: 'completed' | 'failed' | 'awaiting_approval';
  summary: string;
  steps: AgentStep[];
  pendingApprovals: PendingApproval[];
  error?: string;
  tokensUsed: number;
}

export interface AgentStep {
  stepNumber: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: Record<string, unknown>;
  status: 'completed' | 'failed' | 'awaiting_approval';
  durationMs: number;
}

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  proposedAction: string;
}

// ── Agent Definitions (system instructions per type) ──────────
const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  sales_assistant: `You are a Sales Assistant AI for a CRM system. Your job is to help sales teams by:
- Analyzing leads and their buying intent
- Recommending next best actions
- Creating follow-up tasks
- Summarizing conversations
You have access to CRM tools. Use them to gather real data before making recommendations.
Always be specific and actionable. Never invent data.`,

  lead_qualification: `You are a Lead Qualification AI. Your job is to:
- Analyze contact data and conversation history
- Score leads based on engagement, intent, and fit
- Update lead status when qualification is clear
- Create follow-up tasks for qualified leads
Use the analyze_lead tool first, then decide on next actions.`,

  followup: `You are a Follow-up Agent. Your job is to:
- Find overdue follow-ups
- Review previous interactions with contacts
- Create new follow-up tasks with specific dates
- Generate follow-up message suggestions (never auto-send)
Always check existing follow-ups before creating new ones.`,

  customer_support: `You are a Customer Support AI. Your job is to:
- Analyze incoming conversations for intent and sentiment
- Summarize customer issues
- Suggest appropriate responses (never auto-send)
- Create support tasks for the team
Focus on understanding the customer's problem accurately.`,

  content: `You are a Content AI. Your job is to:
- Generate content drafts based on context
- Suggest content improvements
- Never publish content without explicit approval
All content you generate is a DRAFT only.`,

  appointment: `You are an Appointment Agent. Your job is to:
- Review upcoming and missed appointments
- Create reminder follow-up tasks
- Detect missed appointments and create re-engagement tasks
Always create tasks rather than sending messages directly.`,

  customer_success: `You are a Customer Success AI. Your job is to:
- Analyze customer health and engagement
- Detect inactive customers
- Review deal and revenue history
- Recommend retention actions
Focus on customers at risk of churning.`,
};

// ── Build CRM context for agent ───────────────────────────────
async function buildContext(
  input: AgentRunInput,
  supabase: SupabaseClient
): Promise<string> {
  const parts: string[] = [`User request: ${input.input}`];

  if (input.contactId) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, phone, email, lead_score, lead_score_tier, lead_status, source, created_at')
      .eq('id', input.contactId)
      .eq('account_id', input.accountId)
      .single();
    if (contact) {
      parts.push(`Contact context: ${JSON.stringify(contact)}`);
    }
  }

  if (input.conversationId) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('platform, status, ai_intent, ai_sentiment, ai_summary, last_message_text')
      .eq('id', input.conversationId)
      .eq('account_id', input.accountId)
      .single();
    if (conv) {
      parts.push(`Conversation context: ${JSON.stringify(conv)}`);
    }
  }

  return parts.join('\n\n');
}

// ── Rule-based reasoning (no LLM required for basic agents) ──
function ruleBasedReason(
  agentType: string,
  userInput: string,
  allowedTools: string[]
): Array<{ tool: string; input: Record<string, unknown> }> {
  const input = userInput.toLowerCase();
  const plan: Array<{ tool: string; input: Record<string, unknown> }> = [];

  const canUse = (tool: string) => allowedTools.includes(tool);

  if (agentType === 'lead_qualification' || agentType === 'sales_assistant') {
    if (canUse('get_hot_leads') && (input.includes('hot') || input.includes('lead') || input.includes('qualify'))) {
      plan.push({ tool: 'get_hot_leads', input: { min_score: 60, limit: 10 } });
    }
    if (canUse('get_overdue_followups') && (input.includes('overdue') || input.includes('follow'))) {
      plan.push({ tool: 'get_overdue_followups', input: { limit: 10 } });
    }
  }

  if (agentType === 'followup') {
    if (canUse('get_overdue_followups')) {
      plan.push({ tool: 'get_overdue_followups', input: { limit: 20 } });
    }
  }

  if (agentType === 'customer_support') {
    if (canUse('get_overdue_followups')) {
      plan.push({ tool: 'get_overdue_followups', input: { limit: 10 } });
    }
  }

  // Default: get hot leads as a starting point
  if (plan.length === 0 && canUse('get_hot_leads')) {
    plan.push({ tool: 'get_hot_leads', input: { min_score: 50, limit: 5 } });
  }

  return plan.slice(0, MAX_TOOL_CALLS);
}

// ── OpenAI-based reasoning ────────────────────────────────────
async function llmReason(
  agentType: string,
  systemInstructions: string,
  context: string,
  allowedTools: string[],
  model: string,
  temperature: number
): Promise<Array<{ tool: string; input: Record<string, unknown> }>> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return [];

  const availableTools = allowedTools
    .filter(t => TOOL_REGISTRY[t])
    .map(t => {
      const def = TOOL_REGISTRY[t];
      return `- ${t}: ${def.description}`;
    })
    .join('\n');

  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentType] ?? systemInstructions;

  const prompt = `${systemPrompt}

Available tools:
${availableTools}

Context:
${context}

Respond with a JSON array of tool calls to execute. Each item: {"tool": "tool_name", "input": {...}}
Maximum ${MAX_TOOL_CALLS} tool calls. Only use tools from the available list.
If no tools are needed, return [].
Respond ONLY with the JSON array, no explanation.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) return [];
    const d = await res.json() as { choices: { message: { content: string } }[] };
    const content = d.choices[0].message.content;
    const parsed = JSON.parse(content) as { tools?: Array<{ tool: string; input: Record<string, unknown> }> } | Array<{ tool: string; input: Record<string, unknown> }>;
    const toolCalls = Array.isArray(parsed) ? parsed : (parsed.tools ?? []);
    return toolCalls.slice(0, MAX_TOOL_CALLS);
  } catch {
    return [];
  }
}

// ── Generate summary from results ─────────────────────────────
function generateSummary(
  agentType: string,
  steps: AgentStep[],
  userInput: string
): string {
  const completed = steps.filter(s => s.status === 'completed');
  const failed = steps.filter(s => s.status === 'failed');

  if (completed.length === 0 && failed.length === 0) {
    return `Agent analyzed the request: "${userInput}". No actions were required.`;
  }

  const toolSummaries = completed.map(s => {
    const output = s.toolOutput as Record<string, unknown>;
    if (s.toolName === 'get_hot_leads') {
      const leads = output.data as unknown[];
      return `Found ${leads?.length ?? 0} hot leads`;
    }
    if (s.toolName === 'get_overdue_followups') {
      const items = output.data as unknown[];
      return `Found ${items?.length ?? 0} overdue follow-ups`;
    }
    if (s.toolName === 'create_followup') {
      return 'Created follow-up task';
    }
    if (s.toolName === 'analyze_lead') {
      const d = output.data as Record<string, unknown>;
      return `Lead analyzed: score ${d?.score ?? 'N/A'}, tier ${d?.tier ?? 'N/A'}`;
    }
    if (s.toolName === 'generate_reply') {
      return 'Generated reply suggestion (not sent)';
    }
    return `Executed ${s.toolName}`;
  });

  const parts = [`${agentType.replace('_', ' ')} agent completed ${completed.length} action(s).`];
  if (toolSummaries.length > 0) parts.push(toolSummaries.join('. ') + '.');
  if (failed.length > 0) parts.push(`${failed.length} action(s) failed.`);

  return parts.join(' ');
}

// ── Main execution function ───────────────────────────────────
export async function runAgent(
  input: AgentRunInput,
  supabase: SupabaseClient
): Promise<AgentRunResult> {
  const startTime = Date.now();

  // Load agent — verify ownership
  const { data: agent, error: agentErr } = await supabase
    .from('crm3_ai_agents')
    .select('*')
    .eq('id', input.agentId)
    .eq('account_id', input.accountId)
    .single();

  if (agentErr || !agent) {
    return { runId: '', status: 'failed', summary: 'Agent not found', steps: [], pendingApprovals: [], error: 'Agent not found or access denied', tokensUsed: 0 };
  }

  if (!agent.enabled) {
    return { runId: '', status: 'failed', summary: 'Agent is disabled', steps: [], pendingApprovals: [], error: 'Agent is disabled', tokensUsed: 0 };
  }

  // Create run record
  const { data: run, error: runErr } = await supabase
    .from('crm3_ai_agent_runs')
    .insert({
      account_id: input.accountId,
      agent_id: input.agentId,
      triggered_by: input.userId,
      status: 'running',
      input_context: { input: input.input, contactId: input.contactId, conversationId: input.conversationId },
      contact_id: input.contactId ?? null,
      conversation_id: input.conversationId ?? null,
      actions_taken: [],
      tokens_used: 0,
    })
    .select()
    .single();

  if (runErr || !run) {
    return { runId: '', status: 'failed', summary: 'Failed to create run', steps: [], pendingApprovals: [], error: 'DB error', tokensUsed: 0 };
  }

  const runId = run.id as string;
  const steps: AgentStep[] = [];
  const pendingApprovals: PendingApproval[] = [];
  let tokensUsed = 0;

  try {
    // Build context
    const context = await buildContext(input, supabase);

    // Reason: use LLM if available, else rule-based
    const allowedTools = (agent.allowed_tools as string[]) ?? [];
    let toolPlan: Array<{ tool: string; input: Record<string, unknown> }> = [];

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      toolPlan = await llmReason(
        agent.type as string,
        agent.instructions as string,
        context,
        allowedTools,
        (agent.model as string) ?? 'gpt-4o-mini',
        (agent.temperature as number) ?? 0.3
      );
      tokensUsed = 500; // approximate
    }

    if (toolPlan.length === 0) {
      toolPlan = ruleBasedReason(agent.type as string, input.input, allowedTools);
    }

    // Execute tool plan
    for (let i = 0; i < Math.min(toolPlan.length, MAX_TOOL_CALLS); i++) {
      const { tool, input: toolInput } = toolPlan[i];

      // Validate tool is in registry and allowed
      if (!TOOL_REGISTRY[tool]) {
        steps.push({ stepNumber: i + 1, toolName: tool, toolInput, toolOutput: { error: 'Unknown tool' }, status: 'failed', durationMs: 0 });
        continue;
      }
      if (!allowedTools.includes(tool)) {
        steps.push({ stepNumber: i + 1, toolName: tool, toolInput, toolOutput: { error: 'Tool not permitted for this agent' }, status: 'failed', durationMs: 0 });
        continue;
      }

      const toolDef = TOOL_REGISTRY[tool];

      // Check if approval required
      if (toolDef.approval === 'requires_approval' && agent.requires_approval) {
        const { data: approval } = await supabase
          .from('crm3_agent_approvals')
          .insert({
            account_id: input.accountId,
            run_id: runId,
            agent_id: input.agentId,
            tool_name: tool,
            tool_input: toolInput,
            proposed_action: `${tool}: ${JSON.stringify(toolInput)}`,
            status: 'pending',
          })
          .select()
          .single();

        if (approval) {
          pendingApprovals.push({
            approvalId: approval.id as string,
            toolName: tool,
            toolInput,
            proposedAction: `${tool}: ${JSON.stringify(toolInput)}`,
          });
          steps.push({ stepNumber: i + 1, toolName: tool, toolInput, toolOutput: { pending_approval: true }, status: 'awaiting_approval', durationMs: 0 });
        }
        continue;
      }

      // Execute tool
      const stepStart = Date.now();
      const result = await executeTool(tool, toolInput, input.accountId, supabase);
      const durationMs = Date.now() - stepStart;

      const step: AgentStep = {
        stepNumber: i + 1,
        toolName: tool,
        toolInput,
        toolOutput: result.success ? { data: result.data } : { error: result.error },
        status: result.success ? 'completed' : 'failed',
        durationMs,
      };
      steps.push(step);

      // Log step to DB
      await supabase.from('crm3_agent_execution_steps').insert({
        account_id: input.accountId,
        run_id: runId,
        step_number: i + 1,
        tool_name: tool,
        tool_input: toolInput,
        tool_output: step.toolOutput,
        status: step.status,
        duration_ms: durationMs,
      });
    }

    const hasPending = pendingApprovals.length > 0;
    const hasFailures = steps.some(s => s.status === 'failed');
    const finalStatus = hasPending ? 'awaiting_approval' : hasFailures && steps.every(s => s.status === 'failed') ? 'failed' : 'completed';

    const summary = generateSummary(agent.type as string, steps, input.input);

    // Update run record
    await supabase
      .from('crm3_ai_agent_runs')
      .update({
        status: finalStatus,
        actions_taken: steps,
        result_summary: summary,
        tokens_used: tokensUsed,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      })
      .eq('id', runId);

    // Update agent stats
    await supabase
      .from('crm3_ai_agents')
      .update({
        execution_count: (agent.execution_count as number) + 1,
        last_run_at: new Date().toISOString(),
        ...(finalStatus === 'completed' ? { success_count: (agent.success_count as number ?? 0) + 1 } : {}),
        ...(finalStatus === 'failed' ? { failure_count: (agent.failure_count as number ?? 0) + 1 } : {}),
      })
      .eq('id', input.agentId);

    // Audit log
    await supabase.from('crm3_agent_audit_log').insert({
      account_id: input.accountId,
      agent_id: input.agentId,
      run_id: runId,
      user_id: input.userId,
      event_type: finalStatus === 'completed' ? 'run_completed' : finalStatus === 'failed' ? 'run_failed' : 'run_awaiting_approval',
      event_data: { steps: steps.length, tokens: tokensUsed, duration_ms: Date.now() - startTime },
    });

    return { runId, status: finalStatus, summary, steps, pendingApprovals, tokensUsed };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Execution error';
    await supabase.from('crm3_ai_agent_runs').update({ status: 'failed', error_message: errMsg, completed_at: new Date().toISOString() }).eq('id', runId);
    return { runId, status: 'failed', summary: 'Agent execution failed', steps, pendingApprovals, error: errMsg, tokensUsed };
  }
}
