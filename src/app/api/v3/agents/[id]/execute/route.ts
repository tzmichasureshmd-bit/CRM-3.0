/**
 * CRM 3.0 — Agent Execute API
 * POST /api/v3/agents/[id]/execute
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 * account_id always from verified token — never from body.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { runAgent } from '@/lib/ai/agent-engine';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const body = await req.json() as {
      input?: string;
      contact_id?: string;
      conversation_id?: string;
      idempotency_key?: string;
    };

    if (!body.input?.trim()) {
      return NextResponse.json({ error: 'input is required' }, { status: 400 });
    }

    const idempotencyKey = req.headers.get('Idempotency-Key') ?? body.idempotency_key;

    const result = await runAgent(
      {
        agentId: id,
        accountId: user.account_id,
        userId: user.user_id,
        input: body.input.trim(),
        contactId: body.contact_id,
        conversationId: body.conversation_id,
        idempotencyKey: idempotencyKey ?? undefined,
      },
      db
    );

    const httpStatus = result.status === 'failed' && !result.runId ? 400 : 200;
    return NextResponse.json(result, { status: httpStatus });
  } catch (err) {
    console.error('[agents execute]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
