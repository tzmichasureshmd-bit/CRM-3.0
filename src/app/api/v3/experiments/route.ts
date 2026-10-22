/**
 * CRM 3.0 — A/B Testing & Experiments API
 * GET  /api/v3/experiments — list experiments for account
 * POST /api/v3/experiments — create an experiment
 *
 * Auth: FastAPI JWT verified via verifyRequest().
 * account_id always from verified token.
 *
 * Scope: Experiment metadata management only.
 * Exposure/conversion events are recorded via POST /api/v3/experiments/[id]/events.
 * Statistical significance is computed server-side — never auto-conclude from
 * insufficient data (minimum 100 exposures per variant required).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const VALID_STATUSES = ['draft', 'running', 'paused', 'completed'];
const VALID_METRICS = ['click_rate', 'conversion_rate', 'open_rate', 'reply_rate', 'revenue'];
const MIN_EXPOSURES_FOR_SIGNIFICANCE = 100;

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    let q = db
      .from('crm3_experiments')
      .select('id, name, description, status, metric, variants, started_at, ended_at, winner_variant, created_at, updated_at', { count: 'exact' })
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) q = q.eq('status', status);

    const { data, error, count } = await q;
    if (error) throw error;

    // Attach computed stats to each experiment
    const experiments = await Promise.all((data ?? []).map(async (exp: Record<string, unknown>) => {
      const { data: events } = await db
        .from('crm3_experiment_events')
        .select('variant, event_type')
        .eq('experiment_id', exp.id as string)
        .eq('account_id', user.account_id);

      const stats: Record<string, { exposures: number; conversions: number; rate: number }> = {};
      for (const ev of (events ?? [])) {
        const v = ev.variant as string;
        if (!stats[v]) stats[v] = { exposures: 0, conversions: 0, rate: 0 };
        if (ev.event_type === 'exposure') stats[v].exposures++;
        if (ev.event_type === 'conversion') stats[v].conversions++;
      }
      for (const v of Object.keys(stats)) {
        stats[v].rate = stats[v].exposures > 0
          ? Math.round((stats[v].conversions / stats[v].exposures) * 10000) / 100
          : 0;
      }

      const hasEnoughData = Object.values(stats).every(s => s.exposures >= MIN_EXPOSURES_FOR_SIGNIFICANCE);

      return { ...exp, stats, has_enough_data: hasEnoughData, min_exposures_required: MIN_EXPOSURES_FOR_SIGNIFICANCE };
    }));

    return NextResponse.json({ data: experiments, total: count ?? 0 });
  } catch (err) {
    console.error('[experiments GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as {
      name?: string;
      description?: string;
      metric?: string;
      variants?: { name: string; description?: string }[];
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const metric = body.metric ?? 'conversion_rate';
    if (!VALID_METRICS.includes(metric)) {
      return NextResponse.json({ error: `metric must be one of: ${VALID_METRICS.join(', ')}` }, { status: 400 });
    }
    const variants = body.variants ?? [{ name: 'control' }, { name: 'variant_a' }];
    if (!Array.isArray(variants) || variants.length < 2) {
      return NextResponse.json({ error: 'At least 2 variants are required (e.g. control + variant_a)' }, { status: 400 });
    }
    if (variants.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 variants per experiment' }, { status: 400 });
    }
    for (const v of variants) {
      if (!v.name?.trim()) return NextResponse.json({ error: 'Each variant must have a name' }, { status: 400 });
    }

    const { data, error } = await db
      .from('crm3_experiments')
      .insert({
        account_id: user.account_id,
        created_by: user.user_id,
        name: body.name.trim(),
        description: body.description ?? null,
        metric,
        variants: variants.map(v => ({ name: v.name.trim(), description: v.description ?? null })),
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ experiment: data }, { status: 201 });
  } catch (err) {
    console.error('[experiments POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
