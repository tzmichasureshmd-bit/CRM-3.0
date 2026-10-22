/**
 * CRM 3.0 — Automation Trigger Event Ingestion
 * POST /api/v3/automations/events
 *
 * Auth (either):
 *   - Authorization: Bearer <CRON_SECRET>  + body.accountId  (system/webhook calls)
 *   - FastAPI JWT via verifyRequest()                         (user calls)
 *
 * Idempotent via event_key (crm3_automation_events unique index).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { getServiceClient } from '@/lib/supabase/service';
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

    let accountId: string;
    let supabase: ReturnType<typeof getServiceClient>;

    if (isSystem) {
      if (!body.accountId) return NextResponse.json({ error: 'accountId is required for system calls' }, { status: 400 });
      accountId = body.accountId;
      supabase = getServiceClient();
    } else {
      // User call — verify FastAPI JWT
      const auth = await verifyRequest(req);
      if (isAuthError(auth)) return auth;
      accountId = auth.user.account_id;
      supabase = auth.db;
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
