-- Migration: Add Google OAuth fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_google_id ON profiles(google_id);
