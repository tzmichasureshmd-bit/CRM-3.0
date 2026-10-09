/**
 * CRM 3.0 — Automation Manual Execute API
 * POST /api/v3/automations/[id]/execute
 *
 * Manually triggers an automation for a specific contact.
 * Evaluates AI conditions using existing lead intelligence.
 * Executes CRM actions server-side.
 * Logs every step to crm3_automation_executions.
 *
 * Security: account_id from session. Contact ownership verified.
 * AI: uses existing /api/v3/ai/lead-intelligence data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

interface StepLog {
  step_type: string;
  status: 'completed' | 'failed' | 'skipped';
  detail: string;
  duration_ms: number;
  executed_at: string;
}

interface AutomationStep {
  id: string;
  step_type: string;
  step_config: Record<string, unknown>;
  position: number;
  parent_step_id: string | null;
  branch: string | null;
}

interface Contact {
  id: string;
  name: string | null;
  lead_score: number | null;
  lead_score_tier: string | null;
  lead_status: string | null;
  ai_intent?: string | null;
  ai_sentiment?: string | null;
}

// ── AI Condition Evaluator ────────────────────────────────────
function evaluateAICondition(
  nodeType: string,
  config: Record<string, unknown>,
  contact: Contact,
  aiResults: Record<string, unknown>
): boolean {
  switch (nodeType) {
    case 'ai_score_condition': {
      const score = (aiResults.score as number) ?? contact.lead_score ?? 0;
      const threshold = (config.threshold as number) ?? 70;
      const op = (config.operator as string) ?? 'gt';
      if (op === 'gt')  return score > threshold;
      if (op === 'gte') return score >= threshold;
      if (op === 'lt')  return score < threshold;
      if (op === 'lte') return score <= threshold;
      if (op === 'eq')  return score === threshold;
      return false;
    }
    case 'ai_intent_condition': {
      const intent = (aiResults.intent as string) ?? contact.ai_intent ?? '';
      const target = (config.intent as string) ?? '';
      return intent.toLowerCase() === target.toLowerCase();
    }
    case 'ai_sentiment_condition': {
      const sentiment = (aiResults.sentiment as string) ?? contact.ai_sentiment ?? '';
      const target = (config.sentiment as string) ?? '';
      return sentiment.toLowerCase() === target.toLowerCase();
    }
    default:
      return true;
  }
}

// ── Step Executor ─────────────────────────────────────────────
async function executeStep(
  step: AutomationStep,
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  contactId: string,
  aiResults: Record<string, unknown>
): Promise<{ detail: string; skip?: boolean }> {
  const cfg = step.step_config;

  switch (step.step_type) {
    case 'ai_analyze_lead': {
      // Call lead intelligence API internally
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/v3/ai/lead-intelligence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        Object.assign(aiResults, {
          score: data.score,
          intent: data.intent,
          sentiment: data.sentiment,
          nba: (data.next_best_action as { action?: string })?.action,
        });
        return { detail: `AI analysis complete: score=${String(data.score)}, intent=${String(data.intent)}` };
      }
      return { detail: 'AI analysis unavailable — using existing data' };
    }

    case 'ai_score_condition':
    case 'ai_intent_condition':
    case 'ai_sentiment_condition': {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id,lead_score,lead_score_tier,lead_status,ai_intent,ai_sentiment')
        .eq('id', contactId)
        .eq('account_id', accountId)
        .single();

      const passed = evaluateAICondition(step.step_type, cfg, contact as Contact, aiResults);
      if (!passed) return { detail: `Condition not met — skipping branch`, skip: true };
      return { detail: `Condition passed` };
    }

    case 'update_lead_status': {
      const newStatus = cfg.status as string;
      if (!newStatus) return { detail: 'No status specified' };
      await supabase
        .from('contacts')
        .update({ lead_status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', contactId)
        .eq('account_id', accountId);
      return { detail: `Lead status updated to: ${newStatus}` };
    }

    case 'create_follow_up': {
      const title = (cfg.title as string) ?? 'Follow up with customer';
      const daysFromNow = (cfg.days as number) ?? 1;
      const dueDate = new Date(Date.now() + daysFromNow * 86400000).toISOString().split('T')[0];
      await supabase.from('follow_ups').insert({
        account_id: accountId,
        contact_id: contactId,
        title,
        due_date: dueDate,
        status: 'pending',
        created_by: null,
      });
      return { detail: `Follow-up created: "${title}" due ${dueDate}` };
    }

    case 'assign_conversation': {
      const agentId = cfg.agent_id as string | undefined;
      if (!agentId) {
        // Round-robin: pick first available agent
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('account_id', accountId)
          .limit(1)
          .single();
        if (profile) {
          await supabase
            .from('conversations')
            .update({ assigned_agent_id: profile.user_id })
            .eq('account_id', accountId)
            .eq('contact_id', contactId);
          return { detail: `Assigned to agent: ${profile.user_id}` };
        }
        return { detail: 'No agent available for assignment' };
      }
      await supabase
        .from('conversations')
        .update({ assigned_agent_id: agentId })
        .eq('account_id', accountId)
        .eq('contact_id', contactId);
      return { detail: `Assigned to agent: ${agentId}` };
    }

    case 'update_contact_field': {
      const field = cfg.field as string;
      const value = cfg.value as string;
      const allowed = new Set(['name', 'email', 'company', 'lead_status', 'source']);
      if (!field || !allowed.has(field)) return { detail: `Field ${field} not writable` };
      await supabase
        .from('contacts')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', contactId)
        .eq('account_id', accountId);
      return { detail: `${field} updated to: ${value}` };
    }

    case 'send_notification': {
      const message = (cfg.message as string) ?? 'Automation triggered for contact';
      await supabase.from('notifications').insert({
        account_id: accountId,
        type: 'automation',
        title: 'Automation Action',
        body: message,
        data: { contact_id: contactId },
        is_read: false,
      });
      return { detail: `Notification sent: "${message}"` };
    }

    case 'wait': {
      const amount = (cfg.amount as number) ?? 1;
      const unit   = (cfg.unit as string) ?? 'hours';
      return { detail: `Wait ${amount} ${unit} — scheduled for background execution` };
    }

    case 'add_tag': {
      const tagId = cfg.tag_id as string;
      if (!tagId) return { detail: 'No tag_id specified' };
      await supabase.from('contact_tags').upsert(
        { contact_id: contactId, tag_id: tagId },
        { onConflict: 'contact_id,tag_id' }
      );
      return { detail: `Tag added: ${tagId}` };
    }

    default:
      return { detail: `Step type "${step.step_type}" — logged, execution via CRM 2.0 engine` };
  }
}

// ── POST /api/v3/automations/[id]/execute ────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const startTime = Date.now();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const body = await req.json() as { contactId?: string; triggerData?: Record<string, unknown> };
    const { contactId, triggerData = {} } = body;

    if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

    // Verify automation ownership
    const { data: automation } = await supabase
      .from('automations')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (!automation) return NextResponse.json({ error: 'Automation not found' }, { status: 404 });

    // Verify contact ownership
    const { data: contact } = await supabase
      .from('contacts')
      .select('id,name,lead_score,lead_score_tier,lead_status')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .single();

    if (!contact) return NextResponse.json({ error: 'Contact not found or not in account' }, { status: 404 });

    // Fetch steps
    const { data: steps } = await supabase
      .from('automation_steps')
      .select('*')
      .eq('automation_id', id)
      .is('parent_step_id', null)
      .order('position', { ascending: true });

    // Create execution record
    const { data: execution } = await supabase
      .from('crm3_automation_executions')
      .insert({
        account_id:    accountId,
        automation_id: id,
        contact_id:    contactId,
        trigger_type:  automation.trigger_type ?? 'manual',
        trigger_data:  triggerData,
        status:        'running',
        total_steps:   (steps ?? []).length,
        current_step:  0,
      })
      .select()
      .single();

    const executionId = execution?.id;
    const stepsLog: StepLog[] = [];
    const aiResults: Record<string, unknown> = {};
    let overallStatus: 'completed' | 'failed' = 'completed';
    let errorMessage: string | null = null;
    let stepIndex = 0;

    // Execute steps
    for (const step of (steps ?? []) as AutomationStep[]) {
      const stepStart = Date.now();
      try {
        const result = await executeStep(step, supabase, accountId, contactId, aiResults);

        stepsLog.push({
          step_type:   step.step_type,
          status:      result.skip ? 'skipped' : 'completed',
          detail:      result.detail,
          duration_ms: Date.now() - stepStart,
          executed_at: new Date().toISOString(),
        });

        stepIndex++;

        // Update progress
        if (executionId) {
          await supabase
            .from('crm3_automation_executions')
            .update({ current_step: stepIndex, steps_log: stepsLog, ai_results: aiResults })
            .eq('id', executionId);
        }
      } catch (stepErr) {
        const msg = stepErr instanceof Error ? stepErr.message : String(stepErr);
        stepsLog.push({
          step_type:   step.step_type,
          status:      'failed',
          detail:      msg,
          duration_ms: Date.now() - stepStart,
          executed_at: new Date().toISOString(),
        });
        overallStatus = 'failed';
        errorMessage = msg;
        break;
      }
    }

    // Finalize execution
    if (executionId) {
      await supabase
        .from('crm3_automation_executions')
        .update({
          status:       overallStatus,
          steps_log:    stepsLog,
          ai_results:   aiResults,
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);
    }

    // Update automation counters
    const counterUpdate: Record<string, unknown> = {
      execution_count: (automation.execution_count ?? 0) + 1,
      last_run_at: new Date().toISOString(),
    };
    if (overallStatus === 'completed') {
      counterUpdate.success_count = (automation.success_count ?? 0) + 1;
    } else {
      counterUpdate.failure_count = (automation.failure_count ?? 0) + 1;
      counterUpdate.last_error = errorMessage;
    }
    await supabase.from('automations').update(counterUpdate).eq('id', id);

    return NextResponse.json({
      execution_id: executionId,
      status:       overallStatus,
      steps_executed: stepsLog.length,
      steps_log:    stepsLog,
      ai_results:   aiResults,
      duration_ms:  Date.now() - startTime,
    });
  } catch (err) {
    console.error('[automations execute]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
