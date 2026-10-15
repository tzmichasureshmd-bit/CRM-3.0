-- ============================================================
-- 071_channel_integrations.sql
--
-- Generic channel_integrations table.
--
-- Provides a unified, platform-agnostic store for all channel
-- credentials (WhatsApp, Instagram, Facebook, Telegram and any
-- future channel). Does NOT replace whatsapp_config or
-- meta_page_connections — those tables remain untouched and
-- WhatsApp continues to work exactly as before.
--
-- This table is the canonical home for NEW channel connections
-- (Instagram DMs, Facebook Messenger, Telegram bots). The
-- existing WhatsApp path reads from whatsapp_config; the new
-- multi-channel send/receive paths read from this table.
--
-- Credentials are stored AES-256-GCM encrypted (same key as
-- whatsapp_config.access_token). Tokens are NEVER returned to
-- the frontend — the API routes decrypt server-side only.
-- ============================================================

CREATE TABLE IF NOT EXISTS channel_integrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy
  account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Channel identity
  platform              TEXT NOT NULL
    CHECK (platform IN ('whatsapp', 'instagram', 'facebook', 'telegram')),

  -- Human-readable name shown in the UI (page name, bot name, etc.)
  account_name          TEXT,

  -- Connection state
  status                TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'error')),

  -- Encrypted credentials (AES-256-GCM, same ENCRYPTION_KEY as whatsapp_config)
  -- For Instagram/Facebook: Page access token
  -- For Telegram: Bot token
  -- For WhatsApp (future): Cloud API access token
  access_token          TEXT,

  -- Platform-specific identifiers
  -- Facebook/Instagram: Facebook Page id
  page_id               TEXT,
  -- Instagram: linked Instagram Professional account id
  instagram_account_id  TEXT,
  -- Instagram: @username
  instagram_username    TEXT,
  -- Telegram: bot username
  telegram_bot_username TEXT,
  -- Generic external account id (PSID, channel user id, etc.)
  external_account_id   TEXT,

  -- Webhook state
  verify_token          TEXT,          -- encrypted, per-connection verify token
  webhook_verified_at   TIMESTAMPTZ,
  webhook_status        TEXT DEFAULT 'pending'
    CHECK (webhook_status IN ('active', 'pending', 'error')),

  -- Token expiry (for OAuth tokens that expire)
  access_token_expires_at TIMESTAMPTZ,

  -- Arbitrary platform-specific metadata (JSON)
  metadata              JSONB,

  -- Diagnostics
  last_webhook_at       TIMESTAMPTZ,
  last_inbound_at       TIMESTAMPTZ,
  last_error            TEXT,

  connected_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- One connection per platform per account (for platforms that
  -- support multiple connections, use page_id as the discriminator)
  UNIQUE (account_id, platform, page_id)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_channel_integrations_account
  ON channel_integrations (account_id);

CREATE INDEX IF NOT EXISTS idx_channel_integrations_platform
  ON channel_integrations (account_id, platform);

CREATE INDEX IF NOT EXISTS idx_channel_integrations_status
  ON channel_integrations (account_id, platform, status);

CREATE INDEX IF NOT EXISTS idx_channel_integrations_instagram_account
  ON channel_integrations (instagram_account_id)
  WHERE instagram_account_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE channel_integrations ENABLE ROW LEVEL SECURITY;

-- Account members can read their own integrations
CREATE POLICY channel_integrations_select ON channel_integrations
  FOR SELECT USING (is_account_member(account_id));

-- Account admins/owners can insert
CREATE POLICY channel_integrations_insert ON channel_integrations
  FOR INSERT WITH CHECK (is_account_member(account_id));

-- Account admins/owners can update
CREATE POLICY channel_integrations_update ON channel_integrations
  FOR UPDATE USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

-- Account admins/owners can delete
CREATE POLICY channel_integrations_delete ON channel_integrations
  FOR DELETE USING (is_account_member(account_id));

-- ── updated_at trigger ───────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at ON channel_integrations;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON channel_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
