/**
 * CRM 3.0 — Journey Execution Engine
 * Evaluates journey nodes for a contact.
 * Reuses P4 automation actions and P3 AI lead intelligence.
 * Does NOT duplicate automation or agent engines.
 *
 * Security: account_id always from session. All entity ownership verified.
 * Limits: max 20 nodes per execution, no infinite loops.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface JourneyNode {
  id: string;
  type: 'trigger' | 'condition' | 'ai_decision' | 'action' | 'wait' | 'stage' | 'end';
  data: {
    label: string;
    config: Record<string, unknown>;
  };
}

export interface JourneyEdge {
  id: string;
  source: string;
  target: string;
  label?: string; // 'yes' | 'no' | undefined
}

export interface NodeExecutionResult {
  nodeId: string;
  nodeType: string;
  status: 'completed' | 'failed' | 'waiting' | 'branched';
  result: Record<string, unknown>;
  nextNodeId: string | null;
  durationMs: number;
  executedAt: string;
}

const MAX_NODES = 20;

// ── Find next node from edges ─────────────────────────────────
function findNextNode(
  edges: JourneyEdge[],
  currentNodeId: string,
  branch?: string
): string | null {
  const matching = edges.filter(e => e.source === currentNodeId);
  if (matching.length === 0) return null;
  if (branch) {
    const branchEdge = matching.find(e => e.label?.toLowerCase() === branch.toLowerCase());
    if (branchEdge) return branchEdge.target;
  }
  return matching[0].target;
}

// ── Evaluate a single node ────────────────────────────────────
async function evaluateNode(
  node: JourneyNode,
  edges: JourneyEdge[],
  contactId: string,
  accountId: string,
  supabase: SupabaseClient,
  context: Record<string, unknown>
): Promise<NodeExecutionResult> {
  const start = Date.now();
  const cfg = node.data.config;

  try {
    switch (node.type) {
      case 'trigger':
      case 'stage': {
        // Stage nodes update the contact's journey stage
        const stage = (cfg.stage as string) ?? node.data.label.toLowerCase();
        if (stage && contactId) {
          await supabase.from('crm3_journey_events').insert({
            account_id: accountId,
            contact_id: contactId,
            stage: mapToValidStage(stage),
            event_type: node.type === 'stage' ? 'stage_entered' : 'journey_triggered',
            event_description: `${node.data.label}`,
            source_type: 'automation',
            metadata: { node_id: node.id, journey_id: context.journeyId },
          });
        }
        return {
          nodeId: node.id, nodeType: node.type, status: 'completed',
          result: { stage },
          nextNodeId: findNextNode(edges, node.id),
          durationMs: Date.now() - start, executedAt: new Date().toISOString(),
        };
      }

      case 'condition': {
        const field   = (cfg.field as string) ?? 'lead_score';
        const op      = (cfg.operator as string) ?? 'gt';
        const value   = cfg.value;

        const { data: contact } = await supabase
          .from('contacts')
          .select('lead_score, lead_score_tier, lead_status, source')
          .eq('id', contactId)
          .eq('account_id', accountId)
          .single();

        const fieldValue = contact?.[field as keyof typeof contact];
        const passed = evaluateCondition(fieldValue, op, value);
        const branch = passed ? 'yes' : 'no';

        return {
          nodeId: node.id, nodeType: node.type, status: 'branched',
          result: { field, op, value, fieldValue, passed, branch },
          nextNodeId: findNextNode(edges, node.id, branch),
          durationMs: Date.now() - start, executedAt: new Date().toISOString(),
        };
      }

      case 'ai_decision': {
        // Reuse existing lead intelligence data
        const { data: contact } = await supabase
          .from('contacts')
          .select('lead_score, lead_score_tier, lead_status')
          .eq('id', contactId)
          .eq('account_id', accountId)
          .single();

        const score = (contact?.lead_score as number) ?? 0;
        const tier  = (contact?.lead_score_tier as string) ?? 'cold';
        const threshold = (cfg.score_threshold as number) ?? 70;
        const passed = score >= threshold;
        const branch = passed ? 'yes' : 'no';

        // Store AI decision in context
        context.aiScore = score;
        context.aiTier  = tier;

        return {
          nodeId: node.id, nodeType: node.type, status: 'branched',
          result: { score, tier, threshold, passed, branch },
          nextNodeId: findNextNode(edges, node.id, branch),
          durationMs: Date.now() - start, executedAt: new Date().toISOString(),
        };
      }

      case 'action': {
        const actionType = (cfg.action_type as string) ?? 'create_followup';
        const result = await executeAction(actionType, cfg, contactId, accountId, supabase);
        return {
          nodeId: node.id, nodeType: node.type, status: 'completed',
          result,
          nextNodeId: findNextNode(edges, node.id),
          durationMs: Date.now() - start, executedAt: new Date().toISOString(),
        };
      }

      case 'wait': {
        const amount = (cfg.amount as number) ?? 1;
        const unit   = (cfg.unit as string) ?? 'hours';
        const ms = unit === 'minutes' ? amount * 60000
          : unit === 'hours' ? amount * 3600000
          : amount * 86400000;
        const waitUntil = new Date(Date.now() + ms).toISOString();

        // Update contact state to waiting
        await supabase
          .from('crm3_journey_contact_state')
          .update({ status: 'waiting', wait_until: waitUntil, current_node_id: node.id })
          .eq('journey_id', context.journeyId as string)
          .eq('contact_id', contactId);

        return {
          nodeId: node.id, nodeType: node.type, status: 'waiting',
          result: { wait_until: waitUntil, amount, unit },
          nextNodeId: findNextNode(edges, node.id),
          durationMs: Date.now() - start, executedAt: new Date().toISOString(),
        };
      }

      case 'end': {
        // Mark contact as completed in this journey
        await supabase
          .from('crm3_journey_contact_state')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('journey_id', context.journeyId as string)
          .eq('contact_id', contactId);

        return {
          nodeId: node.id, nodeType: node.type, status: 'completed',
          result: { completed: true },
          nextNodeId: null,
          durationMs: Date.now() - start, executedAt: new Date().toISOString(),
        };
      }

      default:
        return {
          nodeId: node.id, nodeType: node.type, status: 'completed',
          result: { skipped: true, reason: `Unknown node type: ${node.type}` },
          nextNodeId: findNextNode(edges, node.id),
          durationMs: Date.now() - start, executedAt: new Date().toISOString(),
        };
    }
  } catch (err) {
    return {
      nodeId: node.id, nodeType: node.type, status: 'failed',
      result: { error: err instanceof Error ? err.message : 'Node execution failed' },
      nextNodeId: null,
      durationMs: Date.now() - start, executedAt: new Date().toISOString(),
    };
  }
}

// ── Condition evaluator ───────────────────────────────────────
function evaluateCondition(
  fieldValue: unknown,
  op: string,
  value: unknown
): boolean {
  const fv = fieldValue as number | string | null;
  const v  = value as number | string | null;
  switch (op) {
    case 'gt':       return (fv as number) > (v as number);
    case 'gte':      return (fv as number) >= (v as number);
    case 'lt':       return (fv as number) < (v as number);
    case 'lte':      return (fv as number) <= (v as number);
    case 'eq':       return fv === v;
    case 'neq':      return fv !== v;
    case 'contains': return String(fv ?? '').toLowerCase().includes(String(v ?? '').toLowerCase());
    case 'is_null':  return fv === null || fv === undefined;
    case 'is_not_null': return fv !== null && fv !== undefined;
    default:         return false;
  }
}

// ── Action executor (reuses P4 action types) ──────────────────
async function executeAction(
  actionType: string,
  cfg: Record<string, unknown>,
  contactId: string,
  accountId: string,
  supabase: SupabaseClient
): Promise<Record<string, unknown>> {
  switch (actionType) {
    case 'create_followup': {
      const title = (cfg.title as string) ?? 'Journey follow-up';
      const days  = (cfg.days as number) ?? 1;
      const due   = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
      const { data } = await supabase.from('follow_ups').insert({
        account_id: accountId, contact_id: contactId,
        title, due_date: due, status: 'pending',
      }).select('id').single();
      return { created: true, followup_id: data?.id, due };
    }

    case 'update_lead_status': {
      const status = cfg.lead_status as string;
      const valid = ['new','contacted','qualified','proposal','negotiation','won','lost'];
      if (!valid.includes(status)) return { error: `Invalid status: ${status}` };
      await supabase.from('contacts').update({ lead_status: status }).eq('id', contactId).eq('account_id', accountId);
      return { updated: true, lead_status: status };
    }

    case 'create_task': {
      const title = (cfg.title as string) ?? 'Journey task';
      const { data } = await supabase.from('follow_ups').insert({
        account_id: accountId, contact_id: contactId,
        title, due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], status: 'pending',
      }).select('id').single();
      return { created: true, task_id: data?.id };
    }

    case 'send_notification': {
      const message = (cfg.message as string) ?? 'Journey action triggered';
      await supabase.from('notifications').insert({
        account_id: accountId, type: 'journey',
        title: 'Journey Action', body: message,
        data: { contact_id: contactId }, is_read: false,
      });
      return { sent: true, message };
    }

    case 'add_journey_event': {
      const stage = mapToValidStage((cfg.stage as string) ?? 'engagement');
      await supabase.from('crm3_journey_events').insert({
        account_id: accountId, contact_id: contactId,
        stage, event_type: (cfg.event_type as string) ?? 'journey_action',
        event_description: (cfg.description as string) ?? 'Journey action executed',
        source_type: 'automation',
      });
      return { logged: true, stage };
    }

    default:
      return { skipped: true, action_type: actionType };
  }
}

// ── Map free-text stage to valid enum ─────────────────────────
function mapToValidStage(stage: string): string {
  const valid = ['discovery','engagement','conversation','qualification','sales','conversion','retention','expansion'];
  const lower = stage.toLowerCase();
  if (valid.includes(lower)) return lower;
  const map: Record<string, string> = {
    lead: 'qualification', deal: 'sales', won: 'conversion',
    customer: 'retention', repeat: 'expansion', visitor: 'discovery',
  };
  return map[lower] ?? 'engagement';
}

// ── Main journey execution function ──────────────────────────
export async function executeJourney(
  journeyId: string,
  contactId: string,
  accountId: string,
  userId: string,
  supabase: SupabaseClient,
  triggeredBy = 'manual'
): Promise<{
  executionId: string;
  status: string;
  nodesExecuted: NodeExecutionResult[];
  summary: string;
  error?: string;
}> {
  const startTime = Date.now();

  // Load journey — verify ownership
  const { data: journey, error: jErr } = await supabase
    .from('crm3_journeys')
    .select('id, name, nodes, edges, status, entry_count, active_count, completed_count')
    .eq('id', journeyId)
    .eq('account_id', accountId)
    .single();

  if (jErr || !journey) {
    return { executionId: '', status: 'failed', nodesExecuted: [], summary: 'Journey not found', error: 'Journey not found or access denied' };
  }

  // Verify contact ownership
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .single();

  if (!contact) {
    return { executionId: '', status: 'failed', nodesExecuted: [], summary: 'Contact not found', error: 'Contact not found or access denied' };
  }

  const nodes = (journey.nodes as JourneyNode[]) ?? [];
  const edges = (journey.edges as JourneyEdge[]) ?? [];

  if (nodes.length === 0) {
    return { executionId: '', status: 'failed', nodesExecuted: [], summary: 'Journey has no nodes', error: 'No nodes configured' };
  }

  // Create execution record
  const { data: execution } = await supabase
    .from('crm3_journey_executions')
    .insert({
      account_id: accountId, journey_id: journeyId,
      contact_id: contactId, triggered_by: triggeredBy,
      status: 'running', nodes_executed: [],
    })
    .select('id')
    .single();

  const executionId = (execution?.id as string) ?? '';

  // Upsert contact state
  await supabase.from('crm3_journey_contact_state').upsert({
    account_id: accountId, journey_id: journeyId,
    contact_id: contactId, status: 'active',
    entered_at: new Date().toISOString(),
    metadata: { triggered_by: triggeredBy, execution_id: executionId },
  }, { onConflict: 'journey_id,contact_id' });

  const context: Record<string, unknown> = { journeyId, executionId, userId };
  const nodesExecuted: NodeExecutionResult[] = [];

  // Find start node (trigger or first node)
  let currentNodeId: string | null = nodes.find(n => n.type === 'trigger')?.id ?? nodes[0]?.id ?? null;
  let stepCount = 0;
  let finalStatus = 'completed';
  let errorMessage: string | undefined;

  while (currentNodeId && stepCount < MAX_NODES) {
    const node = nodes.find(n => n.id === currentNodeId);
    if (!node) break;

    const result = await evaluateNode(node, edges, contactId, accountId, supabase, context);
    nodesExecuted.push(result);
    stepCount++;

    // Update execution progress
    if (executionId) {
      await supabase.from('crm3_journey_executions')
        .update({ nodes_executed: nodesExecuted, current_node_id: currentNodeId })
        .eq('id', executionId);
    }

    if (result.status === 'failed') {
      finalStatus = 'failed';
      errorMessage = result.result.error as string;
      break;
    }

    if (result.status === 'waiting') {
      finalStatus = 'waiting';
      break;
    }

    currentNodeId = result.nextNodeId;
  }

  const durationMs = Date.now() - startTime;
  const summary = buildSummary(journey.name as string, nodesExecuted, finalStatus);

  // Finalize execution
  if (executionId) {
    await supabase.from('crm3_journey_executions').update({
      status: finalStatus, nodes_executed: nodesExecuted,
      error_message: errorMessage ?? null,
      completed_at: finalStatus !== 'waiting' ? new Date().toISOString() : null,
      duration_ms: durationMs,
    }).eq('id', executionId);
  }

  // Update journey counters
  await supabase.from('crm3_journeys').update({
    entry_count: journey.entry_count as number + 1,
    ...(finalStatus === 'completed' ? { completed_count: (journey.completed_count as number ?? 0) + 1 } : {}),
    ...(finalStatus === 'waiting' ? { active_count: (journey.active_count as number ?? 0) + 1 } : {}),
  }).eq('id', journeyId);

  return { executionId, status: finalStatus, nodesExecuted, summary, error: errorMessage };
}

function buildSummary(journeyName: string, nodes: NodeExecutionResult[], status: string): string {
  const completed = nodes.filter(n => n.status === 'completed').length;
  const actions   = nodes.filter(n => n.nodeType === 'action' && n.status === 'completed').length;
  if (status === 'waiting') return `Journey "${journeyName}" paused at wait node after ${completed} steps.`;
  if (status === 'failed')  return `Journey "${journeyName}" failed after ${completed} steps.`;
  return `Journey "${journeyName}" completed: ${completed} nodes, ${actions} action(s) executed.`;
}
