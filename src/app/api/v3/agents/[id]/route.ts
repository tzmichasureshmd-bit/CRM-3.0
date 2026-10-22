/**
 * CRM 3.0 — Agent Detail API
 * GET    /api/v3/agents/[id]
 * PATCH  /api/v3/agents/[id]
 * DELETE /api/v3/agents/[id]
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 * account_id always from verified token — never from request body or headers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const { data, error } = await db
      .from('crm3_ai_agents')
      .select('*')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    return NextResponse.json({ agent: data });
  } catch (err) {
    console.error('[agents GET id]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    // Verify ownership
    const { data: existing } = await db
      .from('crm3_ai_agents')
      .select('id')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const body = await req.json() as Record<string, unknown>;

    const allowed = ['name', 'description', 'instructions', 'allowed_tools', 'requires_approval', 'max_actions_per_run', 'model', 'provider', 'temperature', 'enabled', 'status'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }
    if (updates.max_actions_per_run) {
      updates.max_actions_per_run = Math.min(updates.max_actions_per_run as number, 10);
    }

    const { data, error } = await db
      .from('crm3_ai_agents')
      .update(updates)
      .eq('id', id)
      .eq('account_id', user.account_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const eventType = 'enabled' in body ? (body.enabled ? 'agent_enabled' : 'agent_disabled') : 'agent_updated';
    await db.from('crm3_agent_audit_log').insert({
      account_id: user.account_id,
      agent_id: id,
      user_id: user.user_id,
      event_type: eventType,
      event_data: updates,
    });

    return NextResponse.json({ agent: data });
  } catch (err) {
    console.error('[agents PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const { error } = await db
      .from('crm3_ai_agents')
      .delete()
      .eq('id', id)
      .eq('account_id', user.account_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await db.from('crm3_agent_audit_log').insert({
      account_id: user.account_id,
      agent_id: id,
      user_id: user.user_id,
      event_type: 'agent_deleted',
      event_data: { agent_id: id },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[agents DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
