-- 055_whatsapp_config_registration_state.sql
--
-- Adds a machine-readable registration state to whatsapp_config so the
-- UI can render the REAL registration status (determined by a live probe
-- of Meta's /register endpoint) instead of guessing "PIN required" from a
-- missing `registered_at` timestamp.
--
-- Values:
--   REGISTRATION_UNKNOWN    — not yet determined (fresh row / probe pending)
--   REGISTERED              — confirmed registered to THIS app
--   REGISTRATION_REQUIRED   — /register + 2FA PIN genuinely needed
--   REGISTERED_ELSEWHERE    — number registered under another WABA/app
--   REGISTRATION_ERROR      — Meta returned an error while probing
--
-- Existing rows: NULL is backfilled to REGISTRATION_UNKNOWN so reads never
-- trip on a missing value.

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS registration_state TEXT;

UPDATE whatsapp_config
  SET registration_state = 'REGISTERED'
  WHERE registered_at IS NOT NULL AND registration_state IS NULL;

UPDATE whatsapp_config
  SET registration_state = 'REGISTRATION_UNKNOWN'
  WHERE registration_state IS NULL;
