/**
 * CRM 3.0 — Agent Approval API
 * POST /api/v3/agents/[id]/approve
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 * account_id always from verified token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { executeTool } from '@/lib/ai/agent-tools';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
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

    const body = await req.json() as {
      approval_id?: string;
      decision?: 'approved' | 'rejected';
      note?: string;
    };

    if (!body.approval_id) return NextResponse.json({ error: 'approval_id required' }, { status: 400 });
    if (!body.decision || !['approved', 'rejected'].includes(body.decision)) {
      return NextResponse.json({ error: 'decision must be approved or rejected' }, { status: 400 });
    }

    // Load approval — verify it belongs to this account
    const { data: approval } = await db
      .from('crm3_agent_approvals')
      .select('*')
      .eq('id', body.approval_id)
      .eq('account_id', user.account_id)
      .eq('agent_id', id)
      .eq('status', 'pending')
      .single();

    if (!approval) return NextResponse.json({ error: 'Approval not found or already processed' }, { status: 404 });

    if (new Date(approval.expires_at as string) < new Date()) {
      await db.from('crm3_agent_approvals').update({ status: 'rejected', reviewed_by: user.user_id, reviewed_at: new Date().toISOString(), review_note: 'Expired' }).eq('id', body.approval_id);
      return NextResponse.json({ error: 'Approval has expired' }, { status: 410 });
    }

    await db
      .from('crm3_agent_approvals')
      .update({
        status: body.decision,
        reviewed_by: user.user_id,
        reviewed_at: new Date().toISOString(),
        review_note: body.note ?? null,
      })
      .eq('id', body.approval_id);

    let executionResult = null;

    if (body.decision === 'approved') {
      executionResult = await executeTool(
        approval.tool_name as string,
        approval.tool_input as Record<string, unknown>,
        user.account_id,
        db
      );

      if (approval.step_id) {
        await db
          .from('crm3_agent_execution_steps')
          .update({
            status: executionResult.success ? 'completed' : 'failed',
            tool_output: executionResult.success ? { data: executionResult.data } : { error: executionResult.error },
          })
          .eq('id', approval.step_id as string);
      }
    }

    await db.from('crm3_agent_audit_log').insert({
      account_id: user.account_id,
      agent_id: id,
      run_id: approval.run_id,
      user_id: user.user_id,
      event_type: body.decision === 'approved' ? 'approval_approved' : 'approval_rejected',
      event_data: { approval_id: body.approval_id, tool: approval.tool_name, note: body.note },
    });

    return NextResponse.json({
      decision: body.decision,
      executed: body.decision === 'approved',
      result: executionResult,
    });
  } catch (err) {
    console.error('[agents approve]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
