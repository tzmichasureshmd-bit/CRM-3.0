import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;
    const { data, error } = await db.from('crm3_content').select('*').eq('id', id).eq('account_id', user.account_id).single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[content GET id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const { data: existing } = await db.from('crm3_content').select('id').eq('id', id).eq('account_id', user.account_id).single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const allowed = [
      'title', 'caption', 'cta', 'hashtags', 'platform', 'content_type',
      'status', 'scheduled_at', 'published_at', 'failure_reason',
      'reach', 'impressions', 'engagement', 'clicks', 'views', 'shares',
      'messages_generated', 'leads_generated', 'qualified_leads',
      'deals_attributed', 'revenue_attributed', 'currency', 'source', 'channel',
    ];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }
    if (updates.status === 'published' && !updates.published_at) {
      updates.published_at = new Date().toISOString();
    }

    const { data, error } = await db.from('crm3_content').update(updates).eq('id', id).eq('account_id', user.account_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[content PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;
    const { data: existing } = await db.from('crm3_content').select('id').eq('id', id).eq('account_id', user.account_id).single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { error } = await db.from('crm3_content').delete().eq('id', id).eq('account_id', user.account_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[content DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
