-- ============================================================
-- Migration 025 — Billing plan columns on account_settings
-- Idempotent — safe to run multiple times
-- ============================================================

-- Ensure account_settings table exists (may already exist from 017)
CREATE TABLE IF NOT EXISTS account_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  key         text NOT NULL,
  value       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, key)
);
CREATE INDEX IF NOT EXISTS account_settings_account_idx ON account_settings(account_id);

-- Add plan columns to accounts table (used by super admin)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plan          text NOT NULL DEFAULT 'growth'
  CHECK (plan IN ('free','starter','growth','scale','enterprise'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plan_started_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS currency      text NOT NULL DEFAULT 'USD';

-- Seed default plan row in account_settings for existing accounts
-- (only inserts if no plan row exists yet)
INSERT INTO account_settings (account_id, key, value)
SELECT id, 'plan', to_jsonb('growth'::text)
FROM accounts
WHERE NOT EXISTS (
  SELECT 1 FROM account_settings
  WHERE account_settings.account_id = accounts.id
    AND account_settings.key = 'plan'
)
ON CONFLICT (account_id, key) DO NOTHING;
