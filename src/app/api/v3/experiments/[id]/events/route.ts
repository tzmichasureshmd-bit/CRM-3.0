/**
 * CRM 3.0 — A/B Testing Experiment Events API
 * POST /api/v3/experiments/[id]/events — record exposure or conversion
 *
 * Deduplication: one exposure per contact per experiment.
 * Conversions only counted if exposure was previously recorded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const VALID_EVENT_TYPES = ['exposure', 'conversion'];

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  try {
    const body = await req.json() as {
      variant?: string;
      event_type?: string;
      contact_id?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.variant?.trim()) {
      return NextResponse.json({ error: 'variant is required' }, { status: 400 });
    }
    if (!body.event_type || !VALID_EVENT_TYPES.includes(body.event_type)) {
      return NextResponse.json({ error: `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}` }, { status: 400 });
    }

    // Verify experiment exists and is running
    const { data: experiment } = await db
      .from('crm3_experiments')
      .select('id, status, variants')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .single();

    if (!experiment) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    if (experiment.status !== 'running') {
      return NextResponse.json({ error: `Experiment is not running (status: ${experiment.status})` }, { status: 400 });
    }

    const variants = (experiment.variants as { name: string }[]) ?? [];
    const validNames = variants.map(v => v.name);
    if (!validNames.includes(body.variant)) {
      return NextResponse.json({ error: `variant must be one of: ${validNames.join(', ')}` }, { status: 400 });
    }

    // Deduplication: one exposure per contact per experiment
    if (body.event_type === 'exposure' && body.contact_id) {
      const { data: existing } = await db
        .from('crm3_experiment_events')
        .select('id')
        .eq('experiment_id', id)
        .eq('account_id', user.account_id)
        .eq('contact_id', body.contact_id)
        .eq('event_type', 'exposure')
        .limit(1)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ skipped: true, reason: 'Contact already exposed to this experiment' });
      }
    }

    // Conversion requires prior exposure
    if (body.event_type === 'conversion' && body.contact_id) {
      const { data: exposure } = await db
        .from('crm3_experiment_events')
        .select('id')
        .eq('experiment_id', id)
        .eq('account_id', user.account_id)
        .eq('contact_id', body.contact_id)
        .eq('event_type', 'exposure')
        .limit(1)
        .maybeSingle();

      if (!exposure) {
        return NextResponse.json({ error: 'Cannot record conversion without prior exposure' }, { status: 400 });
      }
    }

    const { data, error } = await db
      .from('crm3_experiment_events')
      .insert({
        account_id: user.account_id,
        experiment_id: id,
        variant: body.variant,
        event_type: body.event_type,
        contact_id: body.contact_id ?? null,
        metadata: body.metadata ?? {},
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ event: data }, { status: 201 });
  } catch (err) {
    console.error('[experiments events POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
