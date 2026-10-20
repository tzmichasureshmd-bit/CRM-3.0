/**
 * CRM 3.0 — Smart Automations API
 * GET  /api/v3/automations  — list automations for the account (+ summary)
 * POST /api/v3/automations  — create automation (draft or active)
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 * DB:   Service-role client — account_id always from verified token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { ACTION_MAP, TRIGGER_MAP } from '@/lib/ai/automation-catalog';

const LIST_COLUMNS = `
  id, name, description, trigger_type, trigger_config,
  is_active, status, ai_enabled, ai_model,
  execution_count, success_count, failure_count,
  last_run_at, last_error, last_error_at, next_run_at,
  workflow_version, created_by, created_at, updated_at
`;

interface IncomingStep {
  step_type?: string;
  action?: string;
  config?: Record<string, unknown>;
  position?: number;
}

function normaliseSteps(raw: unknown): { step_type: string; config: Record<string, unknown>; position: number }[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingStep[])
    .filter(s => s && typeof s === 'object')
    .map((s, i) => {
      const stepType = s.step_type ?? s.action ?? 'action';
      const config = { ...(s.config ?? {}) };
      if (s.action) config.action = s.action;
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

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const trigger = url.searchParams.get('trigger');
    const search = url.searchParams.get('search');
    const sort = url.searchParams.get('sort') ?? 'created_at';
    const order = url.searchParams.get('order') === 'asc';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 200);

    let query = db
      .from('automations')
      .select(LIST_COLUMNS)
      .eq('account_id', user.account_id)
      .order(sort, { ascending: order })
      .limit(limit);

    if (status && status !== 'all') query = query.eq('status', status);
    if (trigger && trigger !== 'all') query = query.eq('trigger_type', trigger);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const automations = data ?? [];
    const summary = {
      total: automations.length,
      active: automations.filter(a => a.status === 'active').length,
      draft: automations.filter(a => a.status === 'draft').length,
      paused: automations.filter(a => a.status === 'paused').length,
      archived: automations.filter(a => a.status === 'archived').length,
      executions: automations.reduce((s, a) => s + (a.execution_count ?? 0), 0),
      successes: automations.reduce((s, a) => s + (a.success_count ?? 0), 0),
      failures: automations.reduce((s, a) => s + (a.failure_count ?? 0), 0),
    };

    return NextResponse.json({ automations, summary, total: automations.length });
  } catch (err) {
    console.error('[automations GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as {
      name?: string;
      description?: string | null;
      trigger_type?: string;
      trigger_config?: Record<string, unknown>;
      steps?: unknown[];
      ai_enabled?: boolean;
      activate?: boolean;
      status?: string;
    };

    if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!body.trigger_type || !TRIGGER_MAP[body.trigger_type]) {
      return NextResponse.json({ error: 'A valid trigger is required' }, { status: 400 });
    }

    const steps = normaliseSteps(body.steps);
    const stepsError = validateSteps(steps);
    if (stepsError) return NextResponse.json({ error: stepsError }, { status: 400 });

    const activate = body.activate === true || body.status === 'active';
    const status = activate ? 'active' : (body.status === 'paused' ? 'paused' : 'draft');

    const { data: automation, error: autoErr } = await db
      .from('automations')
      .insert({
        account_id: user.account_id,
        created_by: user.user_id,
        name: body.name.trim(),
        description: body.description ?? null,
        trigger_type: body.trigger_type,
        trigger_config: body.trigger_config ?? {},
        is_active: status === 'active',
        status,
        ai_enabled: body.ai_enabled ?? false,
        execution_count: 0,
        success_count: 0,
        failure_count: 0,
        workflow_version: 1,
      })
      .select()
      .single();

    if (autoErr || !automation) {
      return NextResponse.json({ error: autoErr?.message ?? 'Failed to create automation' }, { status: 500 });
    }

    if (steps.length > 0) {
      const rows = steps.map(s => ({ automation_id: automation.id, step_type: s.step_type, config: s.config, position: s.position }));
      const { error: stepsErr } = await db.from('automation_steps').insert(rows);
      if (stepsErr) {
        await db.from('automations').delete().eq('id', automation.id);
        return NextResponse.json({ error: `Failed to save steps: ${stepsErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ automation }, { status: 201 });
  } catch (err) {
    console.error('[automations POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
