-- Migration 020: Profile preferences + API keys table
-- Adds timezone/language to profiles, creates crm3_api_keys table.
-- Idempotent — safe to run multiple times.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

CREATE TABLE IF NOT EXISTS crm3_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id      uuid,
  name         text NOT NULL,
  key_prefix   text NOT NULL,
  key_hash     text NOT NULL,
  scopes       text[] NOT NULL DEFAULT '{"read"}',
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm3_api_keys_account ON crm3_api_keys(account_id);

ALTER TABLE crm3_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_api_keys_rls ON crm3_api_keys;
CREATE POLICY crm3_api_keys_rls ON crm3_api_keys
  USING (account_id = public.get_my_account_id());
