/**
 * CRM 3.0 — Journey Wait-Node Background Scheduler
 * Called by Vercel Cron every 5 minutes to resume waiting journeys.
 *
 * Security:
 * - Requires CRON_SECRET header (never expose publicly)
 * - Idempotent with scheduler locks
 * - 3-attempt retry with exponential backoff
 * - Dead letter state after max retries
 *
 * POST /api/v3/journeys/scheduler
 * Headers: { "authorization": "Bearer <CRON_SECRET>" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeJourney } from '@/lib/ai/journey-engine';

const CRON_SECRET = process.env.CRON_SECRET ?? 'dev-cron-secret';
const MAX_ATTEMPTS = 3;
const LOCK_DURATION_SECONDS = 30;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  // 1️⃣ Auth: Verify cron secret
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (token !== CRON_SECRET) {
    console.error('[scheduler] Unauthorized request - invalid CRON_SECRET');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  try {
    // 2️⃣ Find all waiting contacts that are due and not locked
    const now = new Date().toISOString();
    const lockExpiry = new Date(Date.now() - LOCK_DURATION_SECONDS * 1000).toISOString();

    const { data: waitingContacts, error: fetchError } = await supabase
      .from('crm3_journey_contact_state')
      .select(`
        id,
        account_id,
        journey_id,
        contact_id,
        current_node_id,
        wait_until,
        attempt_count,
        last_attempt_at,
        scheduler_lock
      `)
      .eq('status', 'waiting')
      .lte('wait_until', now)
      .is('terminal_error', null)
      .or(`scheduler_lock.is.null,scheduler_lock.lt.${lockExpiry}`)
      .limit(50); // Process max 50 per run

    if (fetchError) {
      console.error('[scheduler] Failed to fetch waiting contacts:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch waiting contacts', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!waitingContacts || waitingContacts.length === 0) {
      return NextResponse.json({
        processed: 0,
        resumed: 0,
        failed: 0,
        deadLettered: 0,
        durationMs: Date.now() - startTime,
        message: 'No contacts ready to resume',
      });
    }

    console.warn(`[scheduler] Found ${waitingContacts.length} contacts to process`);

    // 3️⃣ Process each contact
    let resumed = 0;
    let failed = 0;
    let deadLettered = 0;
    let skippedLocked = 0;

    for (const contact of waitingContacts) {
      const { id: stateId, account_id, journey_id, contact_id, attempt_count } = contact;

      try {
        // 3.1 Acquire lock (optimistic)
        const lockUntil = new Date(Date.now() + LOCK_DURATION_SECONDS * 1000).toISOString();
        const { error: lockError } = await supabase
          .from('crm3_journey_contact_state')
          .update({
            scheduler_lock: lockUntil,
            attempt_count: attempt_count + 1,
            last_attempt_at: now,
          })
          .eq('id', stateId)
          .is('scheduler_lock', null); // Only update if not already locked

        if (lockError) {
          console.warn(`[scheduler] Failed to acquire lock for state ${stateId}:`, lockError);
          skippedLocked++;
          await logSchedulerAction(supabase, account_id, journey_id, contact_id, stateId, 'skipped_locked', attempt_count + 1, { reason: lockError.message });
          continue;
        }

        // 3.2 Load journey
        const { data: journey } = await supabase
          .from('crm3_journeys')
          .select('id, nodes, edges')
          .eq('id', journey_id)
          .single();

        if (!journey) {
          await logSchedulerAction(supabase, account_id, journey_id, contact_id, stateId, 'failed', attempt_count + 1, { error: 'Journey not found' });
          await supabase
            .from('crm3_journey_contact_state')
            .update({ terminal_error: 'Journey not found', scheduler_lock: null })
            .eq('id', stateId);
          deadLettered++;
          continue;
        }

        // 3.3 Resume execution from current node
        const nodeStart = Date.now();
        
        // Create a system service role client for execution (no user context)
        const serviceSupabase = await createClient();
        
        const result = await executeJourney(
          journey_id,
          contact_id,
          account_id,
          'scheduler', // system user
          serviceSupabase,
          'scheduler_resume'
        );

        const nodeDuration = Date.now() - nodeStart;

        // 3.4 Handle result
        if (result.status === 'completed') {
          // Journey completed successfully
          await supabase
            .from('crm3_journey_contact_state')
            .update({
              status: 'completed',
              scheduler_lock: null,
              next_attempt_at: null,
            })
            .eq('id', stateId);

          await logSchedulerAction(supabase, account_id, journey_id, contact_id, stateId, 'resumed', attempt_count + 1, { nodes: result.nodesExecuted.length }, null, nodeDuration);
          resumed++;
        } else if (result.status === 'waiting') {
          // Journey hit another wait node
          await supabase
            .from('crm3_journey_contact_state')
            .update({
              status: 'waiting',
              scheduler_lock: null,
              next_attempt_at: null, // Will be set by journey engine
            })
            .eq('id', stateId);

          await logSchedulerAction(supabase, account_id, journey_id, contact_id, stateId, 'resumed', attempt_count + 1, { status: 'waiting_again' }, null, nodeDuration);
          resumed++;
        } else if (result.status === 'failed') {
          // Execution failed
          if (attempt_count + 1 >= MAX_ATTEMPTS) {
            // Dead letter after max retries
            await supabase
              .from('crm3_journey_contact_state')
              .update({
                status: 'failed',
                terminal_error: result.error ?? 'Max retries exceeded',
                scheduler_lock: null,
              })
              .eq('id', stateId);

            await logSchedulerAction(supabase, account_id, journey_id, contact_id, stateId, 'dead_lettered', attempt_count + 1, null, `Max retries (${MAX_ATTEMPTS}) exceeded: ${result.error}`);
            deadLettered++;
          } else {
            // Retry with exponential backoff
            const backoffMinutes = Math.pow(2, attempt_count + 1); // 2, 4, 8 minutes
            const nextAttempt = new Date(Date.now() + backoffMinutes * 60000).toISOString();

            await supabase
              .from('crm3_journey_contact_state')
              .update({
                scheduler_lock: null,
                next_attempt_at: nextAttempt,
              })
              .eq('id', stateId);

            await logSchedulerAction(supabase, account_id, journey_id, contact_id, stateId, 'failed', attempt_count + 1, { next_attempt: nextAttempt, backoff_minutes: backoffMinutes }, result.error, nodeDuration);
            failed++;
          }
        }
      } catch (error) {
        console.error(`[scheduler] Error processing state ${stateId}:`, error);

        // Release lock on error
        await supabase
          .from('crm3_journey_contact_state')
          .update({ scheduler_lock: null })
          .eq('id', stateId);

        await logSchedulerAction(supabase, account_id, journey_id, contact_id, stateId, 'failed', attempt_count + 1, null, error instanceof Error ? error.message : 'Unknown error');
        failed++;
      }
    }

    const durationMs = Date.now() - startTime;

    console.warn(`[scheduler] Completed: ${resumed} resumed, ${failed} failed, ${deadLettered} dead-lettered, ${skippedLocked} skipped (locked)`);

    return NextResponse.json({
      processed: waitingContacts.length,
      resumed,
      failed,
      deadLettered,
      skippedLocked,
      durationMs,
      message: `Successfully processed ${waitingContacts.length} contacts`,
    });

  } catch (error) {
    console.error('[scheduler] Fatal error:', error);
    return NextResponse.json(
      { 
        error: 'Scheduler failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// ── Log scheduler action to audit table ─────────────────────────
async function logSchedulerAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  journeyId: string,
  contactId: string,
  contactStateId: string,
  action: string,
  attemptNumber: number,
  result?: Record<string, unknown> | null,
  errorMessage?: string | null,
  durationMs?: number
) {
  try {
    await supabase.from('crm3_journey_scheduler_log').insert({
      account_id: accountId,
      journey_id: journeyId,
      contact_id: contactId,
      contact_state_id: contactStateId,
      action,
      attempt_number: attemptNumber,
      result: result ?? {},
      error_message: errorMessage ?? null,
      duration_ms: durationMs ?? null,
    });
  } catch (err) {
    console.error('[scheduler] Failed to log action:', err);
  }
}
