/**
 * CRM 3.0 — Contact Detail API
 * GET    /api/v3/contacts/[id] — fetch contact (tenant-scoped)
 * DELETE /api/v3/contacts/[id] — delete contact (tenant-scoped)
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 * account_id always from verified token — never from request.
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
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'Invalid contact UUID' }, { status: 400 });

    const { data, error } = await db
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[contacts GET id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'Invalid contact UUID' }, { status: 400 });

    const { error } = await db
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('account_id', user.account_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    console.error('[contacts DELETE id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
