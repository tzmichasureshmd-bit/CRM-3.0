/**
 * CRM 3.0 — Smart Automations API
 * GET  /api/v3/automations  — list automations for account
 * POST /api/v3/automations  — create automation
 *
 * Security: account_id always from session, never from body.
 * Reuses existing CRM 2.0 automations table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .single();
  return (data?.account_id as string) ?? null;
}

// ── GET /api/v3/automations ───────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');
    const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);

    let query = supabase
      .from('automations')
      .select(`
        id, name, description, trigger_type, trigger_config,
        is_active, status, ai_enabled,
        execution_count, success_count, failure_count,
        last_run_at, last_error, created_at, updated_at
      `)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ automations: data ?? [], total: data?.length ?? 0 });
  } catch (err) {
    console.error('[automations GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── POST /api/v3/automations ──────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const body = await req.json() as {
      name?: string;
      description?: string;
      trigger_type?: string;
      trigger_config?: Record<string, unknown>;
      steps?: unknown[];
      ai_enabled?: boolean;
      ai_nodes?: unknown[];
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!body.trigger_type) {
      return NextResponse.json({ error: 'trigger_type is required' }, { status: 400 });
    }

    // Create automation
    const { data: automation, error: autoErr } = await supabase
      .from('automations')
      .insert({
        account_id:     accountId,
        user_id:        user.id,
        name:           body.name.trim(),
        description:    body.description ?? null,
        trigger_type:   body.trigger_type,
        trigger_config: body.trigger_config ?? {},
        is_active:      false,
        status:         'draft',
        ai_enabled:     body.ai_enabled ?? false,
        execution_count: 0,
        success_count:  0,
        failure_count:  0,
      })
      .select()
      .single();

    if (autoErr || !automation) {
      return NextResponse.json({ error: autoErr?.message ?? 'Failed to create' }, { status: 500 });
    }

    // Insert steps if provided
    if (body.steps && Array.isArray(body.steps) && body.steps.length > 0) {
      const stepRows = (body.steps as Array<{
        step_type: string;
        step_config?: Record<string, unknown>;
        position?: number;
        parent_step_id?: string;
        branch?: string;
      }>).map((s, i) => ({
        automation_id:  automation.id,
        step_type:      s.step_type,
        step_config:    s.step_config ?? {},
        position:       s.position ?? i,
        parent_step_id: s.parent_step_id ?? null,
        branch:         s.branch ?? null,
      }));

      const { error: stepsErr } = await supabase
        .from('automation_steps')
        .insert(stepRows);

      if (stepsErr) {
        console.error('[automations POST] steps insert failed:', stepsErr);
      }
    }

    // Insert AI nodes if provided
    if (body.ai_nodes && Array.isArray(body.ai_nodes) && body.ai_nodes.length > 0) {
      const aiRows = (body.ai_nodes as Array<{
        node_type: string;
        config?: Record<string, unknown>;
        step_id?: string;
      }>).map(n => ({
        account_id:   accountId,
        automation_id: automation.id,
        node_type:    n.node_type,
        config:       n.config ?? {},
        step_id:      n.step_id ?? null,
      }));

      await supabase.from('crm3_automation_ai_nodes').insert(aiRows);
    }

    return NextResponse.json({ automation }, { status: 201 });
  } catch (err) {
    console.error('[automations POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
