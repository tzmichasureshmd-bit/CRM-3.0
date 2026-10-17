/**
 * CRM 3.0 — Automation Trigger Event Ingestion
 * POST /api/v3/automations/events
 *
 * Entry point for real-time triggers. Inbound systems (message webhooks, CRM
 * mutations, integrations) post here and matching active automations run.
 *
 * Auth (either):
 *   - Authorization: Bearer <CRON_SECRET>  + body.accountId
 *   - Supabase session (uses the signed-in user's account)
 *
 * Idempotent via event_key (crm3_automation_events unique index).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dispatchAutomationEvent } from '@/lib/ai/automation-engine';

const CRON_SECRET = process.env.CRON_SECRET ?? 'dev-cron-secret';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      accountId?: string;
      eventType?: string;
      payload?: Record<string, unknown>;
      eventKey?: string;
    };

    if (!body.eventType) return NextResponse.json({ error: 'eventType is required' }, { status: 400 });

    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    const isSystem = token === CRON_SECRET;

    const supabase = await createClient();
    let accountId: string | null = null;

    if (isSystem) {
      accountId = body.accountId ?? null;
      if (!accountId) return NextResponse.json({ error: 'accountId is required for system calls' }, { status: 400 });
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
      accountId = (profile?.account_id as string) ?? null;
      if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });
    }

    const result = await dispatchAutomationEvent(supabase, {
      accountId,
      eventType: body.eventType,
      payload: body.payload ?? {},
      eventKey: body.eventKey,
    });

    if (result.duplicate) return NextResponse.json({ duplicate: true, executions: 0 });
    return NextResponse.json({
      eventId: result.eventId,
      executions: result.executions,
      results: result.results.map(r => ({ status: r.status, executionId: r.executionId, error: r.error ?? null })),
    });
  } catch (err) {
    console.error('[automation events]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
