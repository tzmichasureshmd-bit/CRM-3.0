-- Migration 014_email_password_totp.sql
-- Adds auth columns to profiles table required by FastAPI auth system.
-- All IF NOT EXISTS — safe to run multiple times.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS password_hash  TEXT,
  ADD COLUMN IF NOT EXISTS google_id      TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS email          TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url     TEXT,
  ADD COLUMN IF NOT EXISTS totp_secret    TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_google_id ON profiles(google_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email     ON profiles(email);

-- OTP table for email-based password reset
CREATE TABLE IF NOT EXISTS email_otps (
  email       TEXT PRIMARY KEY,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
