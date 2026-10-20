/**
 * CRM 3.0 — Automation Detail API
 * GET    /api/v3/automations/[id]  — automation + steps + executions
 * PATCH  /api/v3/automations/[id]  — update automation (and optionally steps)
 * DELETE /api/v3/automations/[id]  — delete automation
 *
 * Security: account_id always from session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ACTION_MAP, TRIGGER_MAP } from '@/lib/ai/automation-catalog';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

async function verifyOwnership(supabase: Awaited<ReturnType<typeof createClient>>, id: string, accountId: string) {
  const { data } = await supabase.from('automations').select('id').eq('id', id).eq('account_id', accountId).single();
  return !!data;
}

interface IncomingStep { step_type?: string; action?: string; config?: Record<string, unknown>; position?: number }

function normaliseSteps(raw: unknown): { step_type: string; config: Record<string, unknown>; position: number }[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingStep[]).filter(s => s && typeof s === 'object').map((s, i) => {
    const stepType = s.step_type ?? s.action ?? 'action';
    const config = { ...(s.config ?? {}) };
    if (stepType !== 'condition' && stepType !== 'wait' && stepType !== 'end') config.action = config.action ?? stepType;
    return { step_type: stepType, config, position: s.position ?? i };
  });
}

function validateSteps(steps: { step_type: string; config: Record<string, unknown> }[]): string | null {
  for (const step of steps) {
    if (step.step_type === 'condition') {
      const cfg = step.config as { conditions?: unknown[]; field?: string };
      if (!Array.isArray(cfg.conditions) && !cfg.field) return 'A condition step is missing its configuration.';
    } else if (step.step_type === 'wait') {
      const cfg = step.config as { amount?: unknown; unit?: unknown };
      if (!cfg.amount || !cfg.unit) return 'A wait step is missing its delay.';
    } else if (step.step_type === 'end') {
      continue;
    } else {
      const actionType = String(step.config.action ?? step.step_type);
      const def = ACTION_MAP[actionType];
      if (!def) return `Unknown action "${actionType}".`;
      for (const f of def.fields) {
        if (f.required && (step.config[f.key] === undefined || step.config[f.key] === '')) {
          return `Action "${def.label}" is missing required field: ${f.label}.`;
        }
      }
    }
  }
  return null;
}

// ── GET ───────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const { data: automation, error } = await supabase.from('automations').select('*').eq('id', id).eq('account_id', accountId).single();
    if (error || !automation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: steps } = await supabase
      .from('automation_steps')
      .select('id,step_type,position,config,parent_step_id,branch')
      .eq('automation_id', id)
      .order('position', { ascending: true });

    const { data: executions } = await supabase
      .from('crm3_automation_executions')
      .select('id,status,trigger_type,started_at,completed_at,error_message,contact_id,duration:completed_at,steps_log,current_step,total_steps')
      .eq('automation_id', id)
      .eq('account_id', accountId)
      .order('started_at', { ascending: false })
      .limit(25);

    return NextResponse.json({ automation, steps: steps ?? [], executions: executions ?? [] });
  } catch (err) {
    console.error('[automations GET id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });
    if (!(await verifyOwnership(supabase, id, accountId))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const allowed = ['name', 'description', 'trigger_type', 'trigger_config', 'is_active', 'status', 'ai_enabled', 'ai_model', 'next_run_at'];
    for (const key of allowed) if (key in body) updates[key] = body[key];

    if ('trigger_type' in updates && !TRIGGER_MAP[String(updates.trigger_type)]) {
      return NextResponse.json({ error: 'Invalid trigger_type' }, { status: 400 });
    }

    // Sync is_active ↔ status
    if ('is_active' in updates && !('status' in updates)) {
      updates.status = updates.is_active ? 'active' : 'paused';
    }

    const activating = updates.status === 'active';

    // Validate steps (incoming or existing) before activation
    let incomingSteps: { step_type: string; config: Record<string, unknown>; position: number }[] | null = null;
    if ('steps' in body) {
      incomingSteps = normaliseSteps(body.steps);
      const err = validateSteps(incomingSteps);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    if (activating) {
      let stepsToCheck = incomingSteps;
      if (!stepsToCheck) {
        const { data: existing } = await supabase
          .from('automation_steps')
          .select('step_type,config,position')
          .eq('automation_id', id)
          .order('position', { ascending: true });
        stepsToCheck = (existing ?? []) as { step_type: string; config: Record<string, unknown>; position: number }[];
      }
      if (!stepsToCheck || stepsToCheck.length === 0) {
        return NextResponse.json({ error: 'Cannot activate an automation with no steps.' }, { status: 400 });
      }
      const err = validateSteps(stepsToCheck);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      if (!updates.trigger_type) {
        const { data: existingAuto } = await supabase.from('automations').select('trigger_type').eq('id', id).single();
        if (!existingAuto?.trigger_type) return NextResponse.json({ error: 'Trigger is required to activate.' }, { status: 400 });
      }
    }

    const { data: automation, error } = await supabase.from('automations').update(updates).eq('id', id).eq('account_id', accountId).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Replace steps if provided
    if (incomingSteps) {
      await supabase.from('automation_steps').delete().eq('automation_id', id);
      if (incomingSteps.length > 0) {
        const rows = incomingSteps.map(s => ({ automation_id: id, step_type: s.step_type, config: s.config, position: s.position }));
        const { error: stepErr } = await supabase.from('automation_steps').insert(rows);
        if (stepErr) return NextResponse.json({ error: `Failed to save steps: ${stepErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ automation });
  } catch (err) {
    console.error('[automations PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });
    if (!(await verifyOwnership(supabase, id, accountId))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cancel pending scheduled jobs, then delete (steps/executions cascade via FK)
    await supabase.from('crm3_automation_scheduled_jobs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('automation_id', id).eq('status', 'pending');

    const { error } = await supabase.from('automations').delete().eq('id', id).eq('account_id', accountId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[automations DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
