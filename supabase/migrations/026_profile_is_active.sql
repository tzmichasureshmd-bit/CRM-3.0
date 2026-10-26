-- ============================================================
-- Migration 026 — Profile is_active for session revocation
-- Idempotent — safe to run multiple times
-- ============================================================

-- Add is_active to profiles if not already present.
-- Default true so all existing accounts remain active.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS profiles_active_idx ON profiles(user_id) WHERE is_active = false;
