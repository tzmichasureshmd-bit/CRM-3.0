/**
 * CRM 3.0 — Automation Background Scheduler
 * Called by Vercel Cron (see vercel.json). Resumes delayed automation steps
 * and runs due scheduled automations.
 *
 * Security: requires CRON_SECRET bearer token.
 * Idempotent: jobs are locked before processing and retried with backoff.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeAutomation, processScheduledJob, type AutomationRow } from '@/lib/ai/automation-engine';

const CRON_SECRET = process.env.CRON_SECRET ?? 'dev-cron-secret';
const LOCK_SECONDS = 60;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const started = Date.now();
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const lockExpiry = new Date(Date.now() - LOCK_SECONDS * 1000).toISOString();

  let resumed = 0, failed = 0, retried = 0, skipped = 0;

  try {
    // ── 1. Delayed automation jobs ──
    const { data: jobs, error } = await supabase
      .from('crm3_automation_scheduled_jobs')
      .select('id,account_id,automation_id,execution_id,contact_id,conversation_id,next_step_index,attempts,max_attempts,payload')
      .eq('status', 'pending')
      .lte('run_at', nowIso)
      .or(`lock_until.is.null,lock_until.lt.${lockExpiry}`)
      .order('run_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[automation scheduler] fetch jobs failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const job of jobs ?? []) {
      const lockUntil = new Date(Date.now() + LOCK_SECONDS * 1000).toISOString();
      const { data: locked } = await supabase
        .from('crm3_automation_scheduled_jobs')
        .update({ status: 'locked', lock_until: lockUntil, attempts: (job.attempts ?? 0) + 1, updated_at: nowIso })
        .eq('id', job.id)
        .eq('status', 'pending')
        .select('id');

      if (!locked || locked.length === 0) { skipped++; continue; }

      try {
        const result = await processScheduledJob(supabase, job);
        if (result.ok) {
          await supabase.from('crm3_automation_scheduled_jobs')
            .update({ status: 'done', lock_until: null, last_error: null, updated_at: new Date().toISOString() })
            .eq('id', job.id);
          resumed++;
        } else if ((job.attempts ?? 0) + 1 >= (job.max_attempts ?? 5)) {
          await supabase.from('crm3_automation_scheduled_jobs')
            .update({ status: 'failed', lock_until: null, last_error: result.detail, updated_at: new Date().toISOString() })
            .eq('id', job.id);
          failed++;
        } else {
          const backoff = Math.pow(2, job.attempts ?? 1);
          await supabase.from('crm3_automation_scheduled_jobs')
            .update({ status: 'pending', lock_until: null, run_at: new Date(Date.now() + backoff * 60000).toISOString(), last_error: result.detail, updated_at: new Date().toISOString() })
            .eq('id', job.id);
          retried++;
        }
      } catch (e) {
        await supabase.from('crm3_automation_scheduled_jobs')
          .update({ status: 'pending', lock_until: null, last_error: e instanceof Error ? e.message : 'error', updated_at: new Date().toISOString() })
          .eq('id', job.id);
        retried++;
      }
    }

    // ── 2. Recurring scheduled automations ──
    let scheduledRuns = 0;
    const { data: scheduled } = await supabase
      .from('automations')
      .select('*')
      .eq('trigger_type', 'schedule')
      .eq('status', 'active')
      .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
      .limit(20);

    for (const automation of (scheduled ?? []) as AutomationRow[]) {
      const cfg = (automation.trigger_config ?? {}) as { interval_minutes?: number; contact_ids?: string[]; run_all?: boolean };

      let targets: string[] = Array.isArray(cfg.contact_ids) ? cfg.contact_ids : [];
      if (targets.length === 0 && cfg.run_all) {
        const { data: contacts } = await supabase
          .from('contacts').select('id').eq('account_id', automation.account_id).limit(100);
        targets = (contacts ?? []).map(c => (c as { id: string }).id);
      }

      for (const contactId of targets) {
        await executeAutomation({ supabase, automation, contactId, triggerType: 'schedule', mode: 'live' });
        scheduledRuns++;
      }

      const interval = Math.max(5, Number(cfg.interval_minutes ?? 60));
      await supabase.from('automations')
        .update({ next_run_at: new Date(Date.now() + interval * 60000).toISOString(), last_run_at: new Date().toISOString() })
        .eq('id', automation.id);
    }

    return NextResponse.json({
      processedJobs: jobs?.length ?? 0,
      resumed, failed, retried, skipped, scheduledRuns,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    console.error('[automation scheduler] fatal:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'scheduler failed' }, { status: 500 });
  }
}
