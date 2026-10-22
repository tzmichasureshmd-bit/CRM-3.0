/**
 * CRM 3.0 — Media Asset [id] API
 * GET    /api/v3/media/[id]
 * PATCH  /api/v3/media/[id]
 * DELETE /api/v3/media/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('media_assets')
    .select('*')
    .eq('id', id)
    .eq('account_id', user.account_id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  return NextResponse.json({ asset: data });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  try {
    const body = await req.json() as {
      name?: string;
      alt_text?: string;
      tags?: string[];
      thumbnail_url?: string;
    };

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      if (!body.name.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      update.name = body.name.trim();
    }
    if (body.alt_text !== undefined) update.alt_text = body.alt_text;
    if (body.tags !== undefined) update.tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.thumbnail_url !== undefined) update.thumbnail_url = body.thumbnail_url;

    const { data, error } = await db
      .from('media_assets')
      .update(update)
      .eq('id', id)
      .eq('account_id', user.account_id)
      .select()
      .single();

    if (error || !data) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    return NextResponse.json({ asset: data });
  } catch (err) {
    console.error('[media PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  const { error } = await db
    .from('media_assets')
    .delete()
    .eq('id', id)
    .eq('account_id', user.account_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
