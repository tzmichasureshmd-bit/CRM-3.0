-- ============================================================
-- CRM 3.0 Migration 015 — Smart Customer Segments Extension
-- Extends crm3_segments (from migration 001) with:
--   segment_conditions      — rule conditions for rule_based segments
--   static_segment_memberships — manual contact memberships
--   segment_calculation_log   — audit trail for dynamic recalcs
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ── Segment Conditions ─────────────────────────────────────────
-- Individual rule conditions belonging to a rule_based segment.
-- A segment can have multiple conditions grouped by condition_group
-- with AND/OR logic between groups and within groups.
CREATE TABLE IF NOT EXISTS segment_conditions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  segment_id        uuid NOT NULL REFERENCES crm3_segments(id) ON DELETE CASCADE,
  condition_group   integer NOT NULL DEFAULT 1,
  field             text NOT NULL,
  operator          text NOT NULL,
  value             text,
  field_type        text NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text','number','date','boolean','array')),
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sc_segment_idx ON segment_conditions(segment_id);
CREATE INDEX IF NOT EXISTS sc_account_idx ON segment_conditions(account_id);

ALTER TABLE segment_conditions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sc_rls ON segment_conditions;
CREATE POLICY sc_rls ON segment_conditions
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));


-- ── Static Segment Memberships ─────────────────────────────────
-- Manual contact memberships for static segments.
-- Each (segment_id, contact_id) pair is unique within an account.
CREATE TABLE IF NOT EXISTS static_segment_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  segment_id      uuid NOT NULL REFERENCES crm3_segments(id) ON DELETE CASCADE,
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_by        uuid REFERENCES auth.users(id),
  added_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(segment_id, contact_id)
);

CREATE INDEX IF NOT EXISTS ssm_segment_idx ON static_segment_memberships(segment_id);
CREATE INDEX IF NOT EXISTS ssm_contact_idx ON static_segment_memberships(contact_id);
CREATE INDEX IF NOT EXISTS ssm_account_idx ON static_segment_memberships(account_id);

ALTER TABLE static_segment_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ssm_rls ON static_segment_memberships;
CREATE POLICY ssm_rls ON static_segment_memberships
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));


-- ── Segment Calculation Log ────────────────────────────────────
-- Audit trail for dynamic segment membership recalculations.
CREATE TABLE IF NOT EXISTS segment_calculation_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  segment_id        uuid NOT NULL REFERENCES crm3_segments(id) ON DELETE CASCADE,
  contact_count     integer NOT NULL DEFAULT 0,
  previous_count    integer NOT NULL DEFAULT 0,
  added_count       integer NOT NULL DEFAULT 0,
  removed_count     integer NOT NULL DEFAULT 0,
  triggered_by      text NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual','api','scheduler')),
  status            text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success','failed','partial')),
  error_message     text,
  calculated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scl_segment_idx ON segment_calculation_log(segment_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS scl_account_idx ON segment_calculation_log(account_id);

ALTER TABLE segment_calculation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scl_rls ON segment_calculation_log;
CREATE POLICY scl_rls ON segment_calculation_log
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));


-- ── Realtime ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'segment_conditions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE segment_conditions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'static_segment_memberships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE static_segment_memberships;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'segment_calculation_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE segment_calculation_log;
  END IF;
END $$;

