/**
 * POST /api/v3/journeys/[id]/execute
 * Runs the journey execution engine for a contact.
 * Auth: FastAPI JWT via verifyRequest(). account_id always from token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { executeJourney } from '@/lib/ai/journey-engine';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const body = await req.json() as { contact_id?: string };
    if (!body.contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

    const result = await executeJourney(id, body.contact_id, user.account_id, user.user_id, db, 'manual');

    const status = result.status === 'failed' && !result.executionId ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    console.error('[journeys execute]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
