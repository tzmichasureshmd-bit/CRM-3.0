-- ============================================================
-- CRM 3.0 Migration 004 — AI Agents Full Framework
-- Extends crm3_ai_agents + crm3_ai_agent_runs (created in 001)
-- Adds: execution steps, approvals, audit log, tool registry
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================================

-- ── Extend crm3_ai_agents with missing columns ────────────────
ALTER TABLE crm3_ai_agents
  ADD COLUMN IF NOT EXISTS enabled          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS model            TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS provider         TEXT NOT NULL DEFAULT 'openai'
    CHECK (provider IN ('openai','anthropic','rule_based')),
  ADD COLUMN IF NOT EXISTS temperature      NUMERIC(3,2) NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS success_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS config           JSONB NOT NULL DEFAULT '{}';

-- ── Extend crm3_ai_agent_runs with missing columns ────────────
ALTER TABLE crm3_ai_agent_runs
  ADD COLUMN IF NOT EXISTS input_context    JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_ms      INTEGER;

-- ── Agent Execution Steps ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_agent_execution_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES crm3_ai_agent_runs(id) ON DELETE CASCADE,
  step_number     INTEGER NOT NULL,
  tool_name       TEXT NOT NULL,
  tool_input      JSONB NOT NULL DEFAULT '{}',
  tool_output     JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','skipped','awaiting_approval')),
  error_message   TEXT,
  duration_ms     INTEGER,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON crm3_agent_execution_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_steps_account ON crm3_agent_execution_steps(account_id);

ALTER TABLE crm3_agent_execution_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_steps_rls ON crm3_agent_execution_steps;
CREATE POLICY agent_steps_rls ON crm3_agent_execution_steps
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Agent Approvals ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_agent_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES crm3_ai_agent_runs(id) ON DELETE CASCADE,
  step_id         UUID REFERENCES crm3_agent_execution_steps(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES crm3_ai_agents(id) ON DELETE CASCADE,
  tool_name       TEXT NOT NULL,
  tool_input      JSONB NOT NULL DEFAULT '{}',
  proposed_action TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_account ON crm3_agent_approvals(account_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_run ON crm3_agent_approvals(run_id);

ALTER TABLE crm3_agent_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_approvals_rls ON crm3_agent_approvals;
CREATE POLICY agent_approvals_rls ON crm3_agent_approvals
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Agent Audit Log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_agent_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES crm3_ai_agents(id) ON DELETE SET NULL,
  run_id          UUID REFERENCES crm3_ai_agent_runs(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id),
  event_type      TEXT NOT NULL,
  -- event_type: agent_created, agent_updated, agent_enabled, agent_disabled,
  --             agent_deleted, run_started, run_completed, run_failed,
  --             tool_executed, tool_failed, approval_requested,
  --             approval_approved, approval_rejected
  event_data      JSONB NOT NULL DEFAULT '{}',
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_account ON crm3_agent_audit_log(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_agent ON crm3_agent_audit_log(agent_id, created_at DESC);

ALTER TABLE crm3_agent_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_audit_rls ON crm3_agent_audit_log;
CREATE POLICY agent_audit_rls ON crm3_agent_audit_log
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Indexes for performance ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_crm3_agents_enabled ON crm3_ai_agents(account_id, enabled);
CREATE INDEX IF NOT EXISTS idx_crm3_agent_runs_status ON crm3_ai_agent_runs(account_id, status);
CREATE INDEX IF NOT EXISTS idx_crm3_agent_runs_contact ON crm3_ai_agent_runs(contact_id) WHERE contact_id IS NOT NULL;

-- ── Realtime ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_agent_approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_agent_approvals;
  END IF;
END $$;
