/**
 * CRM 3.0 — Agent Executions History
 * GET /api/v3/agents/[id]/executions
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    // Verify agent ownership
    const { data: agent } = await db
      .from('crm3_ai_agents')
      .select('id')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50);

    const { data, error } = await db
      .from('crm3_ai_agent_runs')
      .select('id, status, result_summary, error_message, tokens_used, started_at, completed_at, duration_ms, input_context, actions_taken')
      .eq('agent_id', id)
      .eq('account_id', user.account_id)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ executions: data ?? [] });
  } catch (err) {
    console.error('[agents executions]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
