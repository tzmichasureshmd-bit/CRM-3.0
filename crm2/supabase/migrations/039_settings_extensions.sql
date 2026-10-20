-- ============================================================
-- 039_settings_extensions.sql — Company info, email, notifications
--
-- Adds:
--   - company fields to accounts (address, phone, website, industry)
--   - email_config table for SMTP settings
--   - notification_preferences table for per-user notification settings
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Company info on accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS industry TEXT;

-- Email configuration (one row per account)
CREATE TABLE IF NOT EXISTS email_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'smtp',
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_username TEXT,
  smtp_password TEXT,
  smtp_secure BOOLEAN DEFAULT true,
  from_email TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id)
);

ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_config_select ON email_config;
CREATE POLICY email_config_select ON email_config FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS email_config_insert ON email_config;
CREATE POLICY email_config_insert ON email_config FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS email_config_update ON email_config;
CREATE POLICY email_config_update ON email_config FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

-- Notification preferences (one row per user per account)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_messages BOOLEAN DEFAULT true,
  email_broadcasts BOOLEAN DEFAULT true,
  email_automations BOOLEAN DEFAULT true,
  email_deals BOOLEAN DEFAULT true,
  push_messages BOOLEAN DEFAULT true,
  push_broadcasts BOOLEAN DEFAULT true,
  push_automations BOOLEAN DEFAULT true,
  push_deals BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, user_id)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_select ON notification_preferences;
CREATE POLICY notification_preferences_select ON notification_preferences FOR SELECT
  USING (is_account_member(account_id) AND auth.uid() = user_id);

DROP POLICY IF EXISTS notification_preferences_insert ON notification_preferences;
CREATE POLICY notification_preferences_insert ON notification_preferences FOR INSERT
  WITH CHECK (is_account_member(account_id) AND auth.uid() = user_id);

DROP POLICY IF EXISTS notification_preferences_update ON notification_preferences;
CREATE POLICY notification_preferences_update ON notification_preferences FOR UPDATE
  USING (is_account_member(account_id) AND auth.uid() = user_id);
