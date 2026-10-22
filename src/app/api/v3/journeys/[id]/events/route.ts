/**
 * GET /api/v3/journeys/[id]/events
 * Auth: FastAPI JWT via verifyRequest(). account_id always from token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const { data: journey } = await db
      .from('crm3_journeys')
      .select('id')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();
    if (!journey) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);

    const { data, error } = await db
      .from('crm3_journey_events')
      .select('id, contact_id, stage, event_type, event_description, source_type, metadata, created_at')
      .eq('journey_id', id)
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ events: data ?? [] });
  } catch (err) {
    console.error('[journeys events]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
