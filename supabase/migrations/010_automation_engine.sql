-- ============================================================
-- CRM 3.0 Migration 010 — Automation Engine
-- Durable execution, idempotency, scheduling for Automations tab.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Does NOT duplicate existing automation tables or the journey engine.
-- ============================================================

-- ── automations: engine + lifecycle columns ──────────────────
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS execution_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_run_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workflow_version  INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_automations_next_run
  ON automations(next_run_at)
  WHERE is_active = true AND next_run_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automations_trigger
  ON automations(account_id, trigger_type)
  WHERE is_active = true;

-- ── automation_steps: branching + timestamps ─────────────────
ALTER TABLE automation_steps
  ADD COLUMN IF NOT EXISTS parent_step_id UUID REFERENCES automation_steps(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS branch         TEXT,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_automation_steps_order
  ON automation_steps(automation_id, position);

-- ── crm3_automation_events — idempotency ledger ──────────────
-- Deduplicates trigger delivery. One row per (account, event_key).
CREATE TABLE IF NOT EXISTS crm3_automation_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_key           TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  automation_id       UUID REFERENCES automations(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  payload             JSONB NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'processed'
    CHECK (status IN ('received','processed','duplicate','failed','skipped')),
  executions_created  INTEGER NOT NULL DEFAULT 0,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm3_automation_events_key_uidx
  ON crm3_automation_events(account_id, event_key);
CREATE INDEX IF NOT EXISTS idx_crm3_automation_events_account
  ON crm3_automation_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm3_automation_events_automation
  ON crm3_automation_events(automation_id, created_at DESC);

ALTER TABLE crm3_automation_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_automation_events_rls ON crm3_automation_events;
CREATE POLICY crm3_automation_events_rls ON crm3_automation_events
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

-- ── crm3_automation_scheduled_jobs — durable wait/delay ──────
-- One row per pending delayed step. Processed by the cron scheduler.
CREATE TABLE IF NOT EXISTS crm3_automation_scheduled_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  execution_id    UUID REFERENCES crm3_automation_executions(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  job_type        TEXT NOT NULL DEFAULT 'resume_automation',
  run_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','locked','done','failed','cancelled')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  lock_until      TIMESTAMPTZ,
  next_step_index INTEGER NOT NULL DEFAULT 0,
  payload         JSONB NOT NULL DEFAULT '{}',
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm3_automation_jobs_due
  ON crm3_automation_scheduled_jobs(run_at, account_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crm3_automation_jobs_execution
  ON crm3_automation_scheduled_jobs(execution_id);

ALTER TABLE crm3_automation_scheduled_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_automation_jobs_rls ON crm3_automation_scheduled_jobs;
CREATE POLICY crm3_automation_jobs_rls ON crm3_automation_scheduled_jobs
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

-- ── Realtime for execution monitoring ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_automation_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_automation_executions;
  END IF;
END $$;
