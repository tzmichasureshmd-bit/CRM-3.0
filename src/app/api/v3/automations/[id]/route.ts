/**
 * CRM 3.0 — Automation Detail API
 * GET    /api/v3/automations/[id]  — get automation + steps + executions
 * PATCH  /api/v3/automations/[id]  — update automation
 * DELETE /api/v3/automations/[id]  — delete automation
 *
 * Security: account_id always from session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

async function verifyOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  automationId: string,
  accountId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('automations')
    .select('id')
    .eq('id', automationId)
    .eq('account_id', accountId)
    .single();
  return !!data;
}

// ── GET /api/v3/automations/[id] ─────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    // Fetch automation
    const { data: automation, error } = await supabase
      .from('automations')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !automation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Fetch steps
    const { data: steps } = await supabase
      .from('automation_steps')
      .select('*')
      .eq('automation_id', id)
      .order('position', { ascending: true });

    // Fetch AI nodes
    const { data: aiNodes } = await supabase
      .from('crm3_automation_ai_nodes')
      .select('*')
      .eq('automation_id', id);

    // Fetch recent executions
    const { data: executions } = await supabase
      .from('crm3_automation_executions')
      .select('id,status,trigger_type,started_at,completed_at,error_message,contact_id')
      .eq('automation_id', id)
      .eq('account_id', accountId)
      .order('started_at', { ascending: false })
      .limit(20);

    // Fetch recent execution logs
    const { data: logs } = await supabase
      .from('crm3_automation_executions')
      .select('id,status,trigger_type,started_at,completed_at,error_message,contact_id')
      .eq('automation_id', id)
      .eq('account_id', accountId)
      .order('started_at', { ascending: false })
      .limit(20);

    return NextResponse.json({
      automation,
      steps: steps ?? [],
      ai_nodes: aiNodes ?? [],
      executions: executions ?? [],
      logs: logs ?? [],
    });
  } catch (err) {
    console.error('[automations GET id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── PATCH /api/v3/automations/[id] ───────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    if (!(await verifyOwnership(supabase, id, accountId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await req.json() as Record<string, unknown>;

    // Whitelist updatable fields
    const allowed = ['name','description','trigger_type','trigger_config','is_active','status','ai_enabled','ai_model'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Sync is_active → status
    if ('is_active' in updates) {
      if (updates.is_active === true && !('status' in updates)) updates.status = 'active';
      if (updates.is_active === false && !('status' in updates)) updates.status = 'paused';
    }

    const { data, error } = await supabase
      .from('automations')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ automation: data });
  } catch (err) {
    console.error('[automations PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── DELETE /api/v3/automations/[id] ──────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    if (!(await verifyOwnership(supabase, id, accountId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cascade deletes steps, logs, ai_nodes via FK
    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[automations DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
