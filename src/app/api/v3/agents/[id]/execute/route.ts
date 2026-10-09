/**
 * CRM 3.0 — Agent Execute API
 * POST /api/v3/agents/[id]/execute
 *
 * Runs the agent execution engine.
 * account_id always from session — never from body.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runAgent } from '@/lib/ai/agent-engine';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .single();
    if (!profile?.account_id) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const accountId = profile.account_id as string;

    const body = await req.json() as {
      input?: string;
      contact_id?: string;
      conversation_id?: string;
    };

    if (!body.input?.trim()) {
      return NextResponse.json({ error: 'input is required' }, { status: 400 });
    }

    const result = await runAgent(
      {
        agentId: id,
        accountId,
        userId: user.id,
        input: body.input.trim(),
        contactId: body.contact_id,
        conversationId: body.conversation_id,
      },
      supabase
    );

    const httpStatus = result.status === 'failed' && !result.runId ? 400 : 200;
    return NextResponse.json(result, { status: httpStatus });
  } catch (err) {
    console.error('[agents execute]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
