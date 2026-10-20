-- ============================================================
-- CRM 3.0 Migration 011 — AI Agent Engine Hardening
-- 1. Enforces true idempotency for agent runs (safe retries / webhook redelivery)
--    via a unique index on the run's idempotency key (stored in input_context).
-- 2. Fixes the crm3_ai_agents.type CHECK constraint so the agent types
--    advertised by the API (appointment, customer_success) are accepted.
-- Safe to run multiple times.
-- ============================================================

-- ── 1. Idempotency for agent runs ─────────────────────────────
-- The engine stores the caller-supplied key in input_context.idempotency_key.
-- This partial unique index guarantees one terminal run per (account, key).
CREATE UNIQUE INDEX IF NOT EXISTS crm3_agent_runs_idempotency_uidx
  ON crm3_ai_agent_runs (account_id, (input_context ->> 'idempotency_key'))
  WHERE input_context ? 'idempotency_key';

-- ── 2. Align agent type constraint with the API ───────────────
ALTER TABLE crm3_ai_agents DROP CONSTRAINT IF EXISTS crm3_ai_agents_type_check;
ALTER TABLE crm3_ai_agents ADD CONSTRAINT crm3_ai_agents_type_check
  CHECK (type IN (
    'lead_qualification','sales_assistant','followup','customer_support',
    'content','campaign','reporting','knowledge','appointment','customer_success'
  ));
