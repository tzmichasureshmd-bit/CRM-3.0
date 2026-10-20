-- ============================================================
-- 060_whatsapp_embedded_signup.sql
--
-- Additive support for Meta Embedded Signup / WhatsApp Business
-- App coexistence. Adds ONLY new nullable columns to whatsapp_config
-- so an Embedded-Signup-connected number can be traced separately
-- from an existing manual Cloud API connection.
--
-- SAFETY: nothing here drops or alters existing columns, values, or
-- rows. The existing manual Cloud API connection keeps working
-- unchanged. All new columns are nullable and opt-in per row.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_method TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS onboarding_source TEXT,
  ADD COLUMN IF NOT EXISTS embedded_signup_status TEXT,
  ADD COLUMN IF NOT EXISTS coexistence_status TEXT,
  ADD COLUMN IF NOT EXISTS meta_business_id TEXT,
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_type TEXT,
  ADD COLUMN IF NOT EXISTS is_on_biz_app BOOLEAN,
  ADD COLUMN IF NOT EXISTS platform_type TEXT,
  ADD COLUMN IF NOT EXISTS coexistence_confirmed_at TIMESTAMPTZ;

-- Backfill: any pre-existing row is a manual Cloud API connection.
UPDATE whatsapp_config
   SET connection_method = 'manual'
 WHERE connection_method IS NULL OR connection_method = '';

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_connection_method
  ON whatsapp_config (account_id, connection_method);
