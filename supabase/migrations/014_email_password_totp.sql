-- Migration: Add email/password auth + TOTP fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS totp_secret   TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled  BOOLEAN DEFAULT FALSE;
