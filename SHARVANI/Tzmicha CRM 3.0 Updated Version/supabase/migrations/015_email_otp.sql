-- Migration: Email OTP table
CREATE TABLE IF NOT EXISTS email_otps (
  email      TEXT PRIMARY KEY,
  code       TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
