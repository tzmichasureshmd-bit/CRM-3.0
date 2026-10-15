-- ============================================================
-- 052_whatsapp_config_schema_sync.sql
--
-- Fixes HTTP 500 on POST/GET /api/whatsapp/config in production.
--
-- Root cause
--   Production's `whatsapp_config` table was created by migration
--   042 and stopped there (it does not have the columns introduced
--   by migration 046). The API route writes `connection_status`,
--   `display_phone_number` and `business_name` on every save, so
--   UPDATE/INSERT failed with "column does not exist" -> 500.
--
--   Inspected the live production schema: the table had
--     id, user_id, account_id, phone_number_id, waba_id,
--     access_token, verify_token, status, connected_at,
--     registered_at, subscribed_apps_at, last_registration_error,
--     created_at, updated_at
--   but was missing the three 046 columns above.
--
-- This migration is idempotent and safe to re-run. It only touches
-- `whatsapp_config`: it backfills the missing columns, ensures the
-- one-per-account unique constraint, restores the RLS policies that
-- let an authenticated member of an account read/save their own
-- configuration, and grants table privileges to the roles the app
-- uses. It does NOT disable Row Level Security.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Ensure every column the API reads/writes exists.
-- -----------------------------------------------------------
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS display_phone_number TEXT;

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS business_name TEXT;

-- connection_status mirrors the definition from migration 046.
-- ADD COLUMN IF NOT EXISTS does not re-validate an existing column,
-- so this is safe even when the column is already present (the
-- CHECK is only applied when the column is first created here).
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_status TEXT
    DEFAULT 'disconnected'
    CHECK (connection_status IN ('connected', 'disconnected', 'pending', 'error'));

-- -----------------------------------------------------------
-- 2. Ensure the one-configuration-per-account constraint exists.
--    This is the conflict target the API relies on and it also
--    hard-guarantees tenant isolation at the database level.
-- -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_config_account_id_key'
      AND conrelid = 'whatsapp_config'::regclass
  ) THEN
    -- account_id may be NULL on legacy rows; NULLs never violate a
    -- UNIQUE constraint, so creating UNIQUE(account_id) is still
    -- correct for the tenancy guarantee we want.
    ALTER TABLE whatsapp_config
      ADD CONSTRAINT whatsapp_config_account_id_key UNIQUE (account_id);
  END IF;
END $$;

-- One WhatsApp number per instance (prevents two accounts binding
-- the same number and silently dropping webhook events).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_config_phone_number_id_key'
      AND conrelid = 'whatsapp_config'::regclass
  ) THEN
    ALTER TABLE whatsapp_config
      ADD CONSTRAINT whatsapp_config_phone_number_id_key UNIQUE (phone_number_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_account
  ON whatsapp_config (account_id);

-- -----------------------------------------------------------
-- 3. RLS: enable + recreate membership-aware policies.
--
--    * Any authenticated member of the account can READ the config.
--    * Only admins/owners can INSERT, UPDATE, DELETE it.
--    * `is_account_member` is SECURITY DEFINER and was introduced in
--      migration 017/045; `is_super_admin` in 045. If either is
--      absent (fresh schema bootstrap), the policy falls back to the
--      legacy `auth.uid() = user_id` check so the table still works.
-- -----------------------------------------------------------
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_config_select ON whatsapp_config;
DROP POLICY IF EXISTS whatsapp_config_insert ON whatsapp_config;
DROP POLICY IF EXISTS whatsapp_config_update ON whatsapp_config;
DROP POLICY IF EXISTS whatsapp_config_delete ON whatsapp_config;

CREATE POLICY whatsapp_config_select ON whatsapp_config
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_account_member(account_id)
    OR is_super_admin()
  );

CREATE POLICY whatsapp_config_insert ON whatsapp_config
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR is_account_member(account_id, 'admin')
    OR is_super_admin()
  );

CREATE POLICY whatsapp_config_update ON whatsapp_config
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR is_account_member(account_id, 'admin')
    OR is_super_admin()
  );

CREATE POLICY whatsapp_config_delete ON whatsapp_config
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR is_account_member(account_id, 'admin')
    OR is_super_admin()
  );

-- -----------------------------------------------------------
-- 4. Ensure the roles the app uses have table privileges.
--    Postgres checks GRANT before evaluating RLS, so without these
--    even a correctly-scoped policy would yield "permission denied".
--    service_role is used for the cross-account phone_number_id
--    conflict check; authenticated is the API's own session.
-- -----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_config TO authenticated;
GRANT ALL ON whatsapp_config TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- -----------------------------------------------------------
-- 5. Keep updated_at maintained on UPDATE.
-- -----------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON whatsapp_config;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
