/**
 * CRM 3.0 — Journey Wait-Node Scheduler
 * POST /api/v3/journeys/scheduler
 *
 * Resumes journey executions whose wait nodes have become due.
 *
 * INVOCATION:
 *   - Vercel Cron: add to vercel.json → { "crons": [{ "path": "/api/v3/journeys/scheduler", "schedule": "* * * * *" }] }
 *   - External HTTP scheduler: POST with Authorization: Bearer <SCHEDULER_SECRET>
 *   - Manual test: POST with valid Supabase session (owner/admin only)
 *
 * IDEMPOTENCY:
 *   - Each due row is locked with scheduler_lock = now()+30s before processing.
 *   - Concurrent invocations skip rows that are already locked.
 *   - Lock expires automatically after 30s, allowing retry on crash.
 *
 * RETRY POLICY:
 *   - Max 3 attempts per contact state row.
 *   - Exponential backoff: attempt 1 → immediate, 2 → +5min, 3 → +15min.
 *   - After 3 failures: status → 'failed', terminal_error set, no further retries.
 *
 * SECURITY:
 *   - Accepts SCHEDULER_SECRET bearer token (for cron invocations).
 *   - Also accepts authenticated Supabase session (for manual/admin invocations).
 *   - Never logs the secret value.
 *   - account_id always from DB, never from request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeJourney } from '@/lib/ai/journey-engine';

const MAX_ATTEMPTS   = 3;
const BATCH_SIZE     = 20;
const LOCK_DURATION  = 30_000; // 30 seconds in ms

// Backoff delays per attempt (ms)
const BACKOFF_MS: Record<number, number> = {
  1: 0,
  2: 5 * 60_000,   // 5 min
  3: 15 * 60_000,  // 15 min
};

// ── Auth: accept scheduler secret OR valid session ────────────
async function authorize(req: NextRequest): Promise<{ ok: boolean; userId?: string; isService: boolean }> {
  const authHeader = req.headers.get('authorization') ?? '';
  const schedulerSecret = process.env.SCHEDULER_SECRET;

  // Service-level auth via bearer token
  if (schedulerSecret && authHeader === `Bearer ${schedulerSecret}`) {
    return { ok: true, isService: true };
  }

  // Session-level auth (manual invocation by owner/admin)
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { ok: true, userId: user.id, isService: false };
  } catch {
    // fall through
  }

  return { ok: false, isService: false };
}

// ── Main handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();
  const now = new Date();
  const lockExpiry = new Date(now.getTime() + LOCK_DURATION).toISOString();

  // ── Find due rows ─────────────────────────────────────────
  // Rows that are: waiting, wait_until <= now, not locked (or lock expired),
  // not terminal, attempt_count < MAX_ATTEMPTS.
  const { data: dueRows, error: fetchErr } = await supabase
    .from('crm3_journey_contact_state')
    .select(`
      id, account_id, journey_id, contact_id, current_node_id,
      attempt_count, metadata, wait_until,
      scheduler_lock, terminal_error
    `)
    .eq('status', 'waiting')
    .lte('wait_until', now.toISOString())
    .is('terminal_error', null)
    .lt('attempt_count', MAX_ATTEMPTS)
    .or(`scheduler_lock.is.null,scheduler_lock.lte.${now.toISOString()}`)
    .order('wait_until', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error('[scheduler] fetch error:', fetchErr.message);
    return NextResponse.json({ error: 'Failed to fetch due rows', detail: fetchErr.message }, { status: 500 });
  }

  const rows = dueRows ?? [];
  if (rows.length === 0) {
    return NextResponse.json({
      processed: 0,
      resumed: 0,
      failed: 0,
      duration_ms: Date.now() - startTime,
      message: 'No due wait nodes',
    });
  }

  // ── Lock all rows atomically before processing ────────────
  const rowIds = rows.map((r) => r.id as string);
  await supabase
    .from('crm3_journey_contact_state')
    .update({ scheduler_lock: lockExpiry })
    .in('id', rowIds)
    .eq('status', 'waiting')
    .or(`scheduler_lock.is.null,scheduler_lock.lte.${now.toISOString()}`);

  // ── Process each row ──────────────────────────────────────
  let resumed = 0;
  let failed  = 0;

  for (const row of rows) {
    const rowStart = Date.now();
    const attempt  = (row.attempt_count as number) + 1;
    const stateId  = row.id as string;
    const journeyId  = row.journey_id as string;
    const contactId  = row.contact_id as string;
    const accountId  = row.account_id as string;
    const meta       = (row.metadata as Record<string, unknown>) ?? {};
    const userId     = (meta.user_id as string) ?? auth.userId ?? 'scheduler';

    try {
      // Verify journey is still active
      const { data: journey } = await supabase
        .from('crm3_journeys')
        .select('status')
        .eq('id', journeyId)
        .eq('account_id', accountId)
        .single();

      if (!journey || !['active'].includes(journey.status as string)) {
        // Journey paused/archived/deleted — exit this contact
        await supabase
          .from('crm3_journey_contact_state')
          .update({
            status: 'exited',
            scheduler_lock: null,
            terminal_error: `Journey status: ${journey?.status ?? 'not found'}`,
          })
          .eq('id', stateId);

        await logSchedulerAction(supabase, {
          accountId, journeyId, contactId, stateId,
          action: 'skipped_locked',
          attempt,
          result: { reason: `journey_${journey?.status ?? 'not_found'}` },
          durationMs: Date.now() - rowStart,
        });
        continue;
      }

      // Resume the journey from the next node after the wait node
      const result = await executeJourney(
        journeyId, contactId, accountId, userId, supabase, 'scheduler'
      );

      if (result.status === 'failed') {
        throw new Error(result.error ?? 'Journey execution failed');
      }

      // Success — clear lock, update attempt count
      await supabase
        .from('crm3_journey_contact_state')
        .update({
          scheduler_lock: null,
          attempt_count: attempt,
          last_attempt_at: now.toISOString(),
          next_attempt_at: null,
        })
        .eq('id', stateId);

      await logSchedulerAction(supabase, {
        accountId, journeyId, contactId, stateId,
        action: 'resumed',
        attempt,
        result: { execution_id: result.executionId, nodes: result.nodesExecuted.length, status: result.status },
        durationMs: Date.now() - rowStart,
      });

      resumed++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const isTerminal = attempt >= MAX_ATTEMPTS;
      const nextAttempt = isTerminal
        ? null
        : new Date(now.getTime() + (BACKOFF_MS[attempt + 1] ?? BACKOFF_MS[MAX_ATTEMPTS])).toISOString();

      await supabase
        .from('crm3_journey_contact_state')
        .update({
          scheduler_lock: null,
          attempt_count: attempt,
          last_attempt_at: now.toISOString(),
          next_attempt_at: nextAttempt,
          // On terminal failure: mark failed + set terminal_error
          ...(isTerminal ? {
            status: 'failed',
            terminal_error: errMsg,
            error_message: errMsg,
          } : {
            // Not terminal: reschedule via next_attempt_at
            wait_until: nextAttempt,
          }),
        })
        .eq('id', stateId);

      await logSchedulerAction(supabase, {
        accountId, journeyId, contactId, stateId,
        action: isTerminal ? 'dead_lettered' : 'failed',
        attempt,
        error: errMsg,
        durationMs: Date.now() - rowStart,
      });

      console.error(`[scheduler] row ${stateId} attempt ${attempt} failed:`, errMsg);
      failed++;
    }
  }

  return NextResponse.json({
    processed: rows.length,
    resumed,
    failed,
    duration_ms: Date.now() - startTime,
  });
}

// ── GET — health/status endpoint ─────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const now = new Date();

  const { count: dueCount } = await supabase
    .from('crm3_journey_contact_state')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'waiting')
    .lte('wait_until', now.toISOString())
    .is('terminal_error', null)
    .lt('attempt_count', MAX_ATTEMPTS);

  const { count: waitingCount } = await supabase
    .from('crm3_journey_contact_state')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'waiting')
    .is('terminal_error', null);

  const { count: deadCount } = await supabase
    .from('crm3_journey_contact_state')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .not('terminal_error', 'is', null);

  return NextResponse.json({
    status: 'healthy',
    due_now: dueCount ?? 0,
    waiting_total: waitingCount ?? 0,
    dead_lettered: deadCount ?? 0,
    checked_at: now.toISOString(),
    config: {
      max_attempts: MAX_ATTEMPTS,
      batch_size: BATCH_SIZE,
      lock_duration_ms: LOCK_DURATION,
      backoff_ms: BACKOFF_MS,
    },
  });
}

// ── Audit log helper ──────────────────────────────────────────
async function logSchedulerAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    accountId: string;
    journeyId: string;
    contactId: string;
    stateId: string;
    action: string;
    attempt: number;
    result?: Record<string, unknown>;
    error?: string;
    durationMs: number;
  }
) {
  try {
    await supabase.from('crm3_journey_scheduler_log').insert({
      account_id:       opts.accountId,
      journey_id:       opts.journeyId,
      contact_id:       opts.contactId,
      contact_state_id: opts.stateId,
      action:           opts.action,
      attempt_number:   opts.attempt,
      result:           opts.result ?? null,
      error_message:    opts.error ?? null,
      duration_ms:      opts.durationMs,
    });
  } catch (logErr) {
    // Never let logging failure break the scheduler
    console.error('[scheduler] log write failed:', logErr);
  }
}
