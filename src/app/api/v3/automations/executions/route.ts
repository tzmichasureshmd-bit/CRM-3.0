/**
 * CRM 3.0 — Automation Execution History
 * GET /api/v3/automations/executions
 * Query: automation_id, status, from, to, execution_id, limit
 *
 * Security: account_id from session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const url = new URL(req.url);
    const automationId = url.searchParams.get('automation_id');
    const status = url.searchParams.get('status');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const executionId = url.searchParams.get('execution_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

    let query = supabase
      .from('crm3_automation_executions')
      .select('id,automation_id,contact_id,conversation_id,trigger_type,status,current_step,total_steps,steps_log,error_message,started_at,completed_at,wait_until,automation:automations(name)')
      .eq('account_id', accountId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (automationId) query = query.eq('automation_id', automationId);
    if (status && status !== 'all') query = query.eq('status', status);
    if (executionId) query = query.eq('id', executionId);
    if (from) query = query.gte('started_at', from);
    if (to) query = query.lte('started_at', to);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const executions = (data ?? []).map(e => {
      const start = e.started_at ? new Date(e.started_at).getTime() : null;
      const end = e.completed_at ? new Date(e.completed_at).getTime() : null;
      return { ...e, duration_ms: start && end ? end - start : null, automation_name: (e.automation as { name?: string } | null)?.name ?? null };
    });

    return NextResponse.json({ executions, total: executions.length });
  } catch (err) {
    console.error('[automations executions]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
