CREATE TABLE IF NOT EXISTS account_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL,
  key         text NOT NULL,
  value       jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (account_id, key)
);
