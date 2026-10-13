-- ============================================================
-- CRM 3.0 Migration 007 — Journey Wait-Node Scheduler Support
-- Adds retry/idempotency columns to crm3_journey_contact_state.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ── Scheduler columns on contact state ───────────────────────
ALTER TABLE crm3_journey_contact_state
  ADD COLUMN IF NOT EXISTS attempt_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminal_error   TEXT,
  ADD COLUMN IF NOT EXISTS scheduler_lock   TIMESTAMPTZ;
  -- scheduler_lock: set to now()+30s when a scheduler picks up this row.
  -- Prevents concurrent schedulers from processing the same row.
  -- Cleared on completion or failure. Expires automatically after 30s.

-- ── Index for scheduler query ─────────────────────────────────
-- Finds rows that are: waiting, due, not locked (or lock expired), not terminal.
CREATE INDEX IF NOT EXISTS crm3_jcs_scheduler_idx
  ON crm3_journey_contact_state (wait_until, account_id)
  WHERE status = 'waiting' AND terminal_error IS NULL;

-- ── crm3_journey_scheduler_log — audit trail ─────────────────
CREATE TABLE IF NOT EXISTS crm3_journey_scheduler_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  journey_id      UUID NOT NULL REFERENCES crm3_journeys(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_state_id UUID REFERENCES crm3_journey_contact_state(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  -- 'resumed', 'failed', 'dead_lettered', 'skipped_locked', 'skipped_not_due'
  attempt_number  INTEGER NOT NULL DEFAULT 1,
  result          JSONB,
  error_message   TEXT,
  duration_ms     INTEGER,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_jsl_account_idx  ON crm3_journey_scheduler_log(account_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS crm3_jsl_journey_idx  ON crm3_journey_scheduler_log(journey_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS crm3_jsl_contact_idx  ON crm3_journey_scheduler_log(contact_id)
  WHERE contact_id IS NOT NULL;

ALTER TABLE crm3_journey_scheduler_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_jsl_rls ON crm3_journey_scheduler_log;
CREATE POLICY crm3_jsl_rls ON crm3_journey_scheduler_log
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
