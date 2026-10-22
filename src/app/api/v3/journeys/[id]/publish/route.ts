/**
 * POST /api/v3/journeys/[id]/publish
 * Validates and activates a journey.
 * Auth: FastAPI JWT via verifyRequest(). account_id always from token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const { data: journey } = await db
      .from('crm3_journeys')
      .select('id, nodes, edges, status')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();

    if (!journey) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const nodes = (journey.nodes as { type: string }[]) ?? [];
    if (nodes.length < 2) {
      return NextResponse.json({ error: 'Journey must have at least 2 nodes to publish' }, { status: 400 });
    }
    const hasTrigger = nodes.some(n => n.type === 'trigger');
    if (!hasTrigger) {
      return NextResponse.json({ error: 'Journey must have a trigger node' }, { status: 400 });
    }

    const { data, error } = await db
      .from('crm3_journeys')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', user.account_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ journey: data });
  } catch (err) {
    console.error('[journeys publish]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
