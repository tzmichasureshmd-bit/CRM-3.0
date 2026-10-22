/**
 * CRM 3.0 — Journey Detail API
 * GET    /api/v3/journeys/[id]
 * PATCH  /api/v3/journeys/[id]
 * DELETE /api/v3/journeys/[id]
 *
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

    const { data, error } = await db
      .from('crm3_journeys')
      .select('*')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ journey: data });
  } catch (err) {
    console.error('[journeys GET id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const { data: existing } = await db
      .from('crm3_journeys')
      .select('id')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const allowed = ['name', 'description', 'status', 'trigger_type', 'trigger_config', 'nodes', 'edges'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await db
      .from('crm3_journeys')
      .update(updates)
      .eq('id', id)
      .eq('account_id', user.account_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ journey: data });
  } catch (err) {
    console.error('[journeys PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const { data: existing } = await db
      .from('crm3_journeys')
      .select('id')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { error } = await db
      .from('crm3_journeys')
      .delete()
      .eq('id', id)
      .eq('account_id', user.account_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[journeys DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
