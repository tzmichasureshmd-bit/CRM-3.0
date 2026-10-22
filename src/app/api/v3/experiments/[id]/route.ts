/**
 * CRM 3.0 — A/B Testing Experiment [id] API
 * GET    /api/v3/experiments/[id]
 * PATCH  /api/v3/experiments/[id] — update name/description/status/winner
 * DELETE /api/v3/experiments/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const VALID_STATUSES = ['draft', 'running', 'paused', 'completed'];
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['running'],
  running: ['paused', 'completed'],
  paused: ['running', 'completed'],
  completed: [],
};

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('crm3_experiments')
    .select('*')
    .eq('id', id)
    .eq('account_id', user.account_id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
  return NextResponse.json({ experiment: data });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  try {
    const body = await req.json() as {
      name?: string;
      description?: string;
      status?: string;
      winner_variant?: string;
    };

    // Load current experiment to validate transitions
    const { data: current } = await db
      .from('crm3_experiments')
      .select('status, variants, started_at')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();

    if (!current) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) {
      if (!body.name.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      update.name = body.name.trim();
    }
    if (body.description !== undefined) update.description = body.description;

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
      }
      const allowed = VALID_TRANSITIONS[current.status as string] ?? [];
      if (!allowed.includes(body.status)) {
        return NextResponse.json({
          error: `Cannot transition from '${current.status}' to '${body.status}'. Allowed: ${allowed.join(', ') || 'none'}`,
        }, { status: 400 });
      }
      update.status = body.status;
      if (body.status === 'running' && !current.started_at) {
        update.started_at = new Date().toISOString();
      }
      if (body.status === 'completed') {
        update.ended_at = new Date().toISOString();
      }
    }

    if (body.winner_variant !== undefined) {
      const variants = (current.variants as { name: string }[]) ?? [];
      const validNames = variants.map(v => v.name);
      if (!validNames.includes(body.winner_variant)) {
        return NextResponse.json({ error: `winner_variant must be one of: ${validNames.join(', ')}` }, { status: 400 });
      }
      update.winner_variant = body.winner_variant;
    }

    const { data, error } = await db
      .from('crm3_experiments')
      .update(update)
      .eq('id', id)
      .eq('account_id', user.account_id)
      .select()
      .single();

    if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    return NextResponse.json({ experiment: data });
  } catch (err) {
    console.error('[experiments PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  // Only allow deleting draft experiments
  const { data: current } = await db
    .from('crm3_experiments')
    .select('status')
    .eq('id', id)
    .eq('account_id', user.account_id)
    .single();

  if (!current) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
  if (current.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft experiments can be deleted' }, { status: 400 });
  }

  const { error } = await db
    .from('crm3_experiments')
    .delete()
    .eq('id', id)
    .eq('account_id', user.account_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
