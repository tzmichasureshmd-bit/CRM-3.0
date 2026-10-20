-- Migration 018: Auth security hardening
-- Adds token_version for session invalidation after password reset,
-- email uniqueness constraint with duplicate guard,
-- and attempt_count on email_otps for server-side rate limiting.
--
-- DO NOT apply to production without reviewing existing data first.
-- Run the preflight queries below before applying.

-- ── Preflight: check for duplicate emails ─────────────────────
-- Run this query first. If it returns rows, resolve duplicates before
-- applying the UNIQUE constraint below.
--
-- SELECT email, COUNT(*) FROM profiles WHERE email IS NOT NULL
-- GROUP BY email HAVING COUNT(*) > 1;

-- ── 1. token_version for session invalidation ─────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- ── 2. Email uniqueness (safe: only adds if no duplicates exist) ─
-- The DO block checks for duplicates before adding the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'profiles'
      AND constraint_name = 'profiles_email_unique'
  ) THEN
    IF NOT EXISTS (
      SELECT email FROM profiles
      WHERE email IS NOT NULL
      GROUP BY email HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE profiles
        ADD CONSTRAINT profiles_email_unique UNIQUE (email);
    ELSE
      RAISE NOTICE 'Duplicate emails exist — UNIQUE constraint NOT added. Resolve duplicates first.';
    END IF;
  END IF;
END $$;

-- ── 3. OTP hardening columns ──────────────────────────────────
-- Replace plaintext code with hashed code, add attempt tracking.
ALTER TABLE email_otps
  ADD COLUMN IF NOT EXISTS code_hash  TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- Index for fast email lookup
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);

-- ── 4. Normalize existing email values ───────────────────────
-- Lowercase all existing emails for consistency.
UPDATE profiles SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL;
UPDATE email_otps SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL;
