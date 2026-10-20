-- 054_whatsapp_config_diagnostics.sql
--
-- Adds diagnostics columns to whatsapp_config so the Connection Diagnostics
-- section can show real lifecycle data:
--   * last_webhook_at      — last time this number's webhook received an event
--   * last_inbound_at      — last time an inbound customer message was stored
--   * webhook_verified_at  — last time the webhook GET challenge succeeded
--   * last_api_error / last_api_error_at — most recent safe Meta API error
--
-- Existing rows are unaffected (columns nullable, no default backfill).

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_api_error TEXT,
  ADD COLUMN IF NOT EXISTS last_api_error_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_last_inbound
  ON whatsapp_config (last_inbound_at)
  WHERE last_inbound_at IS NOT NULL;
