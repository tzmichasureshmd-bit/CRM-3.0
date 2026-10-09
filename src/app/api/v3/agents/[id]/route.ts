/**
 * CRM 3.0 — Agent Detail API
 * GET    /api/v3/agents/[id]
 * PATCH  /api/v3/agents/[id]
 * DELETE /api/v3/agents/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).single();
  return (data?.account_id as string) ?? null;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const { data, error } = await supabase
      .from('crm3_ai_agents')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    return NextResponse.json({ agent: data });
  } catch (err) {
    console.error('[agents GET id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    // Verify ownership
    const { data: existing } = await supabase
      .from('crm3_ai_agents')
      .select('id')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;

    // Whitelist updatable fields
    const allowed = ['name', 'description', 'instructions', 'allowed_tools', 'requires_approval', 'max_actions_per_run', 'model', 'provider', 'temperature', 'enabled', 'status'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }
    if (updates.max_actions_per_run) {
      updates.max_actions_per_run = Math.min(updates.max_actions_per_run as number, 10);
    }

    const { data, error } = await supabase
      .from('crm3_ai_agents')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit log
    const eventType = 'enabled' in body ? (body.enabled ? 'agent_enabled' : 'agent_disabled') : 'agent_updated';
    await supabase.from('crm3_agent_audit_log').insert({
      account_id: accountId,
      agent_id: id,
      user_id: user.id,
      event_type: eventType,
      event_data: updates,
    });

    return NextResponse.json({ agent: data });
  } catch (err) {
    console.error('[agents PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const { error } = await supabase
      .from('crm3_ai_agents')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from('crm3_agent_audit_log').insert({
      account_id: accountId,
      agent_id: id,
      user_id: user.id,
      event_type: 'agent_deleted',
      event_data: { agent_id: id },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[agents DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
