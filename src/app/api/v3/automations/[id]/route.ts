/**
 * CRM 3.0 — Automation Detail API
 * GET    /api/v3/automations/[id]  — automation + steps + executions
 * PATCH  /api/v3/automations/[id]  — update automation (and optionally steps)
 * DELETE /api/v3/automations/[id]  — delete automation
 *
 * Auth: FastAPI JWT via verifyRequest(). account_id always from token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { ACTION_MAP, TRIGGER_MAP } from '@/lib/ai/automation-catalog';

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
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await params;

    const { data: automation, error } = await db.from('automations').select('*').eq('id', id).eq('account_id', user.account_id).single();
    if (error || !automation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: steps } = await db
      .from('automation_steps')
      .select('id,step_type,position,config,parent_step_id,branch')
      .eq('automation_id', id)
      .order('position', { ascending: true });

    const { data: executions } = await db
      .from('crm3_automation_executions')
      .select('id,status,trigger_type,started_at,completed_at,error_message,contact_id,duration:completed_at,steps_log,current_step,total_steps')
      .eq('automation_id', id)
      .eq('account_id', user.account_id)
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
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await params;

    const { data: existing } = await db.from('automations').select('id').eq('id', id).eq('account_id', user.account_id).single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const allowed = ['name', 'description', 'trigger_type', 'trigger_config', 'is_active', 'status', 'ai_enabled', 'ai_model', 'next_run_at'];
    for (const key of allowed) if (key in body) updates[key] = body[key];

    if ('trigger_type' in updates && !TRIGGER_MAP[String(updates.trigger_type)]) {
      return NextResponse.json({ error: 'Invalid trigger_type' }, { status: 400 });
    }

    if ('is_active' in updates && !('status' in updates)) {
      updates.status = updates.is_active ? 'active' : 'paused';
    }

    const activating = updates.status === 'active';
    let incomingSteps: { step_type: string; config: Record<string, unknown>; position: number }[] | null = null;
    if ('steps' in body) {
      incomingSteps = normaliseSteps(body.steps);
      const err = validateSteps(incomingSteps);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    if (activating) {
      let stepsToCheck = incomingSteps;
      if (!stepsToCheck) {
        const { data: existingSteps } = await db
          .from('automation_steps')
          .select('step_type,config,position')
          .eq('automation_id', id)
          .order('position', { ascending: true });
        stepsToCheck = (existingSteps ?? []) as { step_type: string; config: Record<string, unknown>; position: number }[];
      }
      if (!stepsToCheck || stepsToCheck.length === 0) {
        return NextResponse.json({ error: 'Cannot activate an automation with no steps.' }, { status: 400 });
      }
      const err = validateSteps(stepsToCheck);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    const { data: automation, error } = await db.from('automations').update(updates).eq('id', id).eq('account_id', user.account_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (incomingSteps) {
      await db.from('automation_steps').delete().eq('automation_id', id);
      if (incomingSteps.length > 0) {
        const rows = incomingSteps.map(s => ({ automation_id: id, step_type: s.step_type, config: s.config, position: s.position }));
        const { error: stepErr } = await db.from('automation_steps').insert(rows);
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
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await params;

    const { data: existing } = await db.from('automations').select('id').eq('id', id).eq('account_id', user.account_id).single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.from('crm3_automation_scheduled_jobs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('automation_id', id).eq('status', 'pending');

    const { error } = await db.from('automations').delete().eq('id', id).eq('account_id', user.account_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[automations DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
