/**
 * CRM 3.0 — Journey Detail API
 * GET    /api/v3/journeys/[id]
 * PATCH  /api/v3/journeys/[id]
 * DELETE /api/v3/journeys/[id]
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

    const { data, error } = await supabase
      .from('crm3_journeys')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ journey: data });
  } catch (err) {
    console.error('[journeys GET id]', err);
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

    const { data: existing } = await supabase.from('crm3_journeys').select('id').eq('id', id).eq('account_id', accountId).single();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;
    const allowed = ['name', 'description', 'status', 'trigger_type', 'trigger_config', 'nodes', 'edges'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await supabase
      .from('crm3_journeys')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ journey: data });
  } catch (err) {
    console.error('[journeys PATCH]', err);
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

    const { error } = await supabase.from('crm3_journeys').delete().eq('id', id).eq('account_id', accountId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[journeys DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
