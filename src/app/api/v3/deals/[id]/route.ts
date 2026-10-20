/**
 * CRM 3.0 — Deal Detail API
 * GET    /api/v3/deals/[id] — fetch deal (tenant-scoped)
 * DELETE /api/v3/deals/[id] — delete deal (tenant-scoped)
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { isUuid } from '@/lib/crm-pipeline-store';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'Invalid deal UUID' }, { status: 400 });

    const { data, error } = await db
      .from('deals')
      .select('*, contacts(name)')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[deals GET id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'Invalid deal UUID' }, { status: 400 });

    const { error } = await db
      .from('deals')
      .delete()
      .eq('id', id)
      .eq('account_id', user.account_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    console.error('[deals DELETE id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
