/**
 * CRM 3.0 — Agent Approval API
 * POST /api/v3/agents/[id]/approve
 *
 * Approve or reject a pending agent action.
 * Only the account owner can approve.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeTool } from '@/lib/ai/agent-tools';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
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
    const { data: approval } = await supabase
      .from('crm3_agent_approvals')
      .select('*')
      .eq('id', body.approval_id)
      .eq('account_id', accountId)
      .eq('agent_id', id)
      .eq('status', 'pending')
      .single();

    if (!approval) return NextResponse.json({ error: 'Approval not found or already processed' }, { status: 404 });

    // Check expiry
    if (new Date(approval.expires_at as string) < new Date()) {
      await supabase.from('crm3_agent_approvals').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: 'Expired' }).eq('id', body.approval_id);
      return NextResponse.json({ error: 'Approval has expired' }, { status: 410 });
    }

    // Update approval record
    await supabase
      .from('crm3_agent_approvals')
      .update({
        status: body.decision,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: body.note ?? null,
      })
      .eq('id', body.approval_id);

    let executionResult = null;

    // If approved, execute the tool now
    if (body.decision === 'approved') {
      executionResult = await executeTool(
        approval.tool_name as string,
        approval.tool_input as Record<string, unknown>,
        accountId,
        supabase
      );

      // Update the step record
      if (approval.step_id) {
        await supabase
          .from('crm3_agent_execution_steps')
          .update({
            status: executionResult.success ? 'completed' : 'failed',
            tool_output: executionResult.success ? { data: executionResult.data } : { error: executionResult.error },
          })
          .eq('id', approval.step_id as string);
      }
    }

    // Audit log
    await supabase.from('crm3_agent_audit_log').insert({
      account_id: accountId,
      agent_id: id,
      run_id: approval.run_id,
      user_id: user.id,
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
