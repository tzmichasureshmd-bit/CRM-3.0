/**
 * CRM 3.0 — Agent Executions History
 * GET /api/v3/agents/[id]/executions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const accountId = profile.account_id as string;

    // Verify agent ownership
    const { data: agent } = await supabase
      .from('crm3_ai_agents')
      .select('id')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50);

    const { data, error } = await supabase
      .from('crm3_ai_agent_runs')
      .select('id, status, result_summary, error_message, tokens_used, started_at, completed_at, duration_ms, input_context, actions_taken')
      .eq('agent_id', id)
      .eq('account_id', accountId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ executions: data ?? [] });
  } catch (err) {
    console.error('[agents executions]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
