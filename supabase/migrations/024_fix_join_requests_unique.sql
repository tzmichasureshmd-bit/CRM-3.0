-- ============================================================
-- Migration 024 — Fix join_requests unique constraint
-- Problem: UNIQUE(account_id, requester_id, status) in migration 023
--   prevents a user from re-applying to a company after a previous
--   request was approved, rejected, or cancelled, because the
--   combination (account_id, requester_id, 'approved') would already
--   exist and block a new 'pending' request.
--
-- Fix: Drop the full unique constraint and replace with a partial
--   unique index that only enforces uniqueness for 'pending' requests.
--   This allows multiple historical requests while preventing duplicate
--   pending requests.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Drop the existing full unique constraint (if it exists)
ALTER TABLE join_requests
  DROP CONSTRAINT IF EXISTS join_requests_account_id_requester_id_status_key;

-- Add a partial unique index: only one PENDING request per user per company
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_pending_unique
  ON join_requests (account_id, requester_id)
  WHERE status = 'pending';

-- Add index for historical lookups (non-pending requests)
CREATE INDEX IF NOT EXISTS join_requests_history_idx
  ON join_requests (account_id, requester_id, created_at DESC);
