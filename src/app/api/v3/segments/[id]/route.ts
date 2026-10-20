/**
 * CRM 3.0 — Segment Detail API
 * GET    /api/v3/segments/[id]     — get segment with conditions
 * PATCH  /api/v3/segments/[id]     — update segment
 * DELETE /api/v3/segments/[id]     — delete segment
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Ctx = { params: Promise<{ id: string }> };

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const { data: segment, error } = await supabase
      .from('crm3_segments')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !segment) return NextResponse.json({ error: 'Segment not found' }, { status: 404 });

    // Load conditions for rule_based segments
    let conditions: any[] = [];
    if (segment.type === 'rule_based' && segment.rules) {
      try {
        const parsed = typeof segment.rules === 'string' ? JSON.parse(segment.rules) : segment.rules;
        conditions = Array.isArray(parsed) ? parsed : [];
      } catch {
        conditions = [];
      }
    }

    // Load static membership count
    let staticMemberCount = 0;
    if (segment.type === 'manual') {
      const { count } = await supabase
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
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const { data: existing } = await supabase
      .from('crm3_segments')
      .select('id')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const allowed = ['name', 'description', 'type', 'rules', 'ai_criteria'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Validate type
    if (updates.type && !['manual', 'rule_based', 'ai_assisted'].includes(updates.type as string)) {
      return NextResponse.json({ error: 'Invalid segment type' }, { status: 400 });
    }

    // If switching to rule_based, require rules
    if (updates.type === 'rule_based' && !updates.rules) {
      return NextResponse.json({ error: 'Rules are required for rule_based segments' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('crm3_segments')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ segment: data });
  } catch (err) {
    console.error('[segments PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const { error } = await supabase.from('crm3_segments').delete().eq('id', id).eq('account_id', accountId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[segments DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
