-- ============================================================
-- Migration 023 — Company Profile Fields & Join Requests
-- Idempotent — safe to run multiple times
-- ============================================================

-- ── Extra columns on accounts (company profile) ───────────────
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email       text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone       text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS website     text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS industry    text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS logo_url    text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address     text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','suspended','trial'));

-- ── Join Requests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS join_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  requester_id     uuid NOT NULL,
  requester_name   text NOT NULL DEFAULT '',
  requester_email  text NOT NULL DEFAULT '',
  message          text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, requester_id, status)
);
CREATE INDEX IF NOT EXISTS join_requests_account_idx    ON join_requests(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS join_requests_requester_idx  ON join_requests(requester_id);
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS join_requests_rls ON join_requests;
CREATE POLICY join_requests_rls ON join_requests
  USING (account_id = get_my_account_id() OR requester_id = auth.uid());
