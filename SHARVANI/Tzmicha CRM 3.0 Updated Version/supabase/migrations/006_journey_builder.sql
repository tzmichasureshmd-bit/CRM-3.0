-- ============================================================
-- CRM 3.0 Migration 006 — Customer Journey Builder
-- crm3_journey_events already exists from migration 001.
-- This adds: journey definitions, executions, contact state.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================

-- ── Journey Definitions ───────────────────────────────────────
-- Stores the journey template: nodes, edges, trigger, config.
CREATE TABLE IF NOT EXISTS crm3_journeys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES auth.users(id),
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','archived')),
  trigger_type    TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN (
      'manual','contact_created','lead_created','conversation_started',
      'message_received','deal_created','deal_stage_changed',
      'deal_won','appointment_created','customer_inactive',
      'ai_score_threshold','intent_detected','content_interaction'
    )),
  trigger_config  JSONB NOT NULL DEFAULT '{}',
  nodes           JSONB NOT NULL DEFAULT '[]',
  -- Each node: { id, type, position:{x,y}, data:{label,config} }
  -- node types: trigger, condition, ai_decision, action, wait, stage, end
  edges           JSONB NOT NULL DEFAULT '[]',
  -- Each edge: { id, source, target, label? }
  entry_count     INTEGER NOT NULL DEFAULT 0,
  active_count    INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  conversion_rate NUMERIC(5,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_journeys_account_idx ON crm3_journeys(account_id);
CREATE INDEX IF NOT EXISTS crm3_journeys_status_idx  ON crm3_journeys(account_id, status);

ALTER TABLE crm3_journeys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_journeys_rls ON crm3_journeys;
CREATE POLICY crm3_journeys_rls ON crm3_journeys
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Journey Contact State ─────────────────────────────────────
-- Tracks where each contact is in a journey.
CREATE TABLE IF NOT EXISTS crm3_journey_contact_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  journey_id      UUID NOT NULL REFERENCES crm3_journeys(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  current_node_id TEXT,
  current_stage   TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','waiting','completed','failed','exited')),
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  wait_until      TIMESTAMPTZ,
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  UNIQUE(journey_id, contact_id)
);

CREATE INDEX IF NOT EXISTS crm3_jcs_journey_idx  ON crm3_journey_contact_state(journey_id, status);
CREATE INDEX IF NOT EXISTS crm3_jcs_contact_idx  ON crm3_journey_contact_state(contact_id);
CREATE INDEX IF NOT EXISTS crm3_jcs_account_idx  ON crm3_journey_contact_state(account_id);
CREATE INDEX IF NOT EXISTS crm3_jcs_waiting_idx  ON crm3_journey_contact_state(wait_until)
  WHERE status = 'waiting';

ALTER TABLE crm3_journey_contact_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_jcs_rls ON crm3_journey_contact_state;
CREATE POLICY crm3_jcs_rls ON crm3_journey_contact_state
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Journey Executions ────────────────────────────────────────
-- Full execution log per contact per journey run.
CREATE TABLE IF NOT EXISTS crm3_journey_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  journey_id      UUID NOT NULL REFERENCES crm3_journeys(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  triggered_by    TEXT NOT NULL DEFAULT 'manual',
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed','waiting','cancelled')),
  nodes_executed  JSONB NOT NULL DEFAULT '[]',
  -- Each entry: { node_id, node_type, status, result, duration_ms, executed_at }
  current_node_id TEXT,
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER
);

CREATE INDEX IF NOT EXISTS crm3_je_journey_idx  ON crm3_journey_executions(journey_id, started_at DESC);
CREATE INDEX IF NOT EXISTS crm3_je_account_idx  ON crm3_journey_executions(account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS crm3_je_contact_idx  ON crm3_journey_executions(contact_id)
  WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm3_je_status_idx   ON crm3_journey_executions(account_id, status)
  WHERE status IN ('running','waiting');

ALTER TABLE crm3_journey_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_je_rls ON crm3_journey_executions;
CREATE POLICY crm3_je_rls ON crm3_journey_executions
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Extend crm3_journey_events with journey_id ────────────────
ALTER TABLE crm3_journey_events
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES crm3_journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_id UUID REFERENCES crm3_journey_executions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm3_je_events_journey_idx
  ON crm3_journey_events(journey_id)
  WHERE journey_id IS NOT NULL;

-- ── Realtime ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_journey_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_journey_executions;
  END IF;
END $$;
