-- ============================================================
-- 053_whatsapp_config_multiple_numbers.sql
--
-- Enables MULTIPLE WhatsApp phone numbers per account.
--
-- WHY
--   Production enforces `UNIQUE(account_id)` on whatsapp_config
--   (added by migration 052). That makes it structurally impossible
--   to connect a second WhatsApp number to the same account: saving
--   Number 2 trips the unique constraint, Postgres raises 23505, and
--   POST /api/whatsapp/config returns HTTP 500.
--
--   This was the root cause of the reported "Add Number 2 -> 500".
--   It is NOT a problem with re-using one Meta System User access
--   token across numbers (that is valid — the token authenticates
--   app + WABA access and every phone_number_id routes independently;
--   Meta's own docs use the same token across numbers). See the
--   companion report for the Meta-side evidence.
--
-- WHAT CHANGES
--   1. Drop the one-row-per-account unique constraint so an account
--      can hold many config rows (one per phone_number_id).
--   2. KEEP `UNIQUE(phone_number_id)`: each phone number can only be
--      connected to one account/instance — this is what lets the
--      webhook map an inbound number 1:1 to an account.
--   3. Add `is_primary BOOLEAN` so each account can flag its default
--      OUTBOUND number. A partial unique index guarantees at most one
--      primary per account. Outbound send sites use the primary (or
--      fall back to the most recently updated config).
--   4. Backfill: the existing single row becomes primary.
--   5. Re-assert grants + updated_at trigger (idempotent).
--
-- Idempotent and safe to re-run. RLS stays enabled; existing
-- membership-aware policies from 052 already cover the new shape.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Remove the one-config-per-account constraint.
--    (Dropping the constraint drops its backing unique index.)
-- -----------------------------------------------------------
ALTER TABLE whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;

-- -----------------------------------------------------------
-- 2. Add the primary (default outbound) marker.
-- -----------------------------------------------------------
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- At most one primary per account (partial unique index).
DROP INDEX IF EXISTS whatsapp_config_one_primary_idx;
CREATE UNIQUE INDEX whatsapp_config_one_primary_idx
  ON whatsapp_config (account_id)
  WHERE is_primary;

-- -----------------------------------------------------------
-- 3. Backfill — the account's existing (oldest) config becomes
--    the primary outbound number. On a fresh/multi-row table this is
--    a no-op for rows already primary and safe on the first run.
-- -----------------------------------------------------------
UPDATE whatsapp_config
   SET is_primary = TRUE
 WHERE is_primary IS NOT TRUE
   AND id = (
     SELECT id FROM whatsapp_config
      ORDER BY created_at ASC
      LIMIT 1
   );

-- -----------------------------------------------------------
-- 4. Re-assert the per-number unique constraint + index + trigger
--    and grants (idempotent, defensive re-runs).
-- -----------------------------------------------------------
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

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_config TO authenticated;
GRANT ALL ON whatsapp_config TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

DROP TRIGGER IF EXISTS set_updated_at ON whatsapp_config;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
