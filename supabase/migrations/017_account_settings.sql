CREATE TABLE IF NOT EXISTS account_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL,
  key         text NOT NULL,
  value       text NOT NULL DEFAULT '',
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (account_id, key)
);
-- NOTE: value is text (not jsonb) because all stored values are plain strings
-- (tokens, IDs, secrets). The ai_keys setting stores JSON as a text string
-- and is read/written via ai_settings.py which handles the jsonb column separately.
