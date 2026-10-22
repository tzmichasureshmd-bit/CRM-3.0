-- ============================================================
-- APPLY THIS IN SUPABASE SQL EDITOR TO FIX GOOGLE SIGN-IN
-- Migration: Drop auth.users FKs + add all missing auth columns
-- This is the root cause of the 500 error on Google sign-in.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- 1. Drop the FK that blocks custom UUID inserts into profiles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- 2. Drop other auth.users FKs that block custom user_id references
ALTER TABLE conversations   DROP CONSTRAINT IF EXISTS conversations_assigned_agent_id_fkey;
ALTER TABLE follow_ups      DROP CONSTRAINT IF EXISTS follow_ups_user_id_fkey;

-- 3. Add all auth columns needed by FastAPI (idempotent)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS password_hash  TEXT,
  ADD COLUMN IF NOT EXISTS google_id      TEXT,
  ADD COLUMN IF NOT EXISTS email          TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url     TEXT,
  ADD COLUMN IF NOT EXISTS totp_secret    TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS token_version  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS timezone       TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS language       TEXT NOT NULL DEFAULT 'en';

-- 4. Add google_id unique index (safe if already exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_google_id ON profiles(google_id)
  WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- 5. OTP table for email-based password reset
CREATE TABLE IF NOT EXISTS email_otps (
  email           TEXT PRIMARY KEY,
  code            TEXT NOT NULL,
  code_hash       TEXT,
  expires_at      TIMESTAMP NOT NULL,
  used            BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);

-- 6. Add email uniqueness constraint (only if no duplicates exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_email_unique'
  ) THEN
    IF NOT EXISTS (
      SELECT email FROM profiles
      WHERE email IS NOT NULL
      GROUP BY email HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
    ELSE
      RAISE NOTICE 'Duplicate emails exist — UNIQUE constraint NOT added. Resolve duplicates first.';
    END IF;
  END IF;
END $$;

-- 7. API keys table
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

-- 8. Normalize existing emails
UPDATE profiles SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL;
