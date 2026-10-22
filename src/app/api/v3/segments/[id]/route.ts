/**
 * CRM 3.0 — Segment Detail API
 * GET    /api/v3/segments/[id]     — get segment with conditions
 * PATCH  /api/v3/segments/[id]     — update segment
 * DELETE /api/v3/segments/[id]     — delete segment
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

    const { data: segment, error } = await db
      .from('crm3_segments')
      .select('*')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();

    if (error || !segment) return NextResponse.json({ error: 'Segment not found' }, { status: 404 });

    let conditions: any[] = [];
    if (segment.type === 'rule_based' && segment.rules) {
      try {
        const parsed = typeof segment.rules === 'string' ? JSON.parse(segment.rules) : segment.rules;
        conditions = Array.isArray(parsed) ? parsed : [];
      } catch {
        conditions = [];
      }
    }

    let staticMemberCount = 0;
    if (segment.type === 'manual') {
      const { count } = await db
        .from('static_segment_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('segment_id', id);
      staticMemberCount = count ?? 0;
    }

    return NextResponse.json({
      segment: { ...segment, conditions, static_member_count: staticMemberCount },
    });
  } catch (err) {
    console.error('[segments GET id]', err);
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
      .from('crm3_segments')
      .select('id')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const allowed = ['name', 'description', 'type', 'rules', 'ai_criteria'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (updates.type && !['manual', 'rule_based', 'ai_assisted'].includes(updates.type as string)) {
      return NextResponse.json({ error: 'Invalid segment type' }, { status: 400 });
    }
    if (updates.type === 'rule_based' && !updates.rules) {
      return NextResponse.json({ error: 'Rules are required for rule_based segments' }, { status: 400 });
    }

    const { data, error } = await db
      .from('crm3_segments')
      .update(updates)
      .eq('id', id)
      .eq('account_id', user.account_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ segment: data });
  } catch (err) {
    console.error('[segments PATCH]', err);
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
      .from('crm3_segments')
      .select('id')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { error } = await db.from('crm3_segments').delete().eq('id', id).eq('account_id', user.account_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[segments DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
