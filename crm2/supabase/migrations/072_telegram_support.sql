-- ============================================================
-- 072: Telegram support
-- ============================================================
-- Adds 'telegram' to the conversations.platform CHECK constraint,
-- adds contacts.telegram_chat_id for deduplication, and creates
-- the telegram_bots table for storing bot credentials.
-- ============================================================

-- ── Widen conversations.platform to include telegram ─────────
DO $$
BEGIN
  -- Drop the existing CHECK constraint (name varies by Postgres version)
  -- and recreate it with telegram included.
  ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS conversations_platform_check;

  ALTER TABLE conversations
    ADD CONSTRAINT conversations_platform_check
    CHECK (platform IN ('whatsapp', 'facebook', 'instagram', 'telegram'));

  RAISE NOTICE '072: conversations.platform CHECK widened to include telegram';
EXCEPTION WHEN others THEN
  RAISE NOTICE '072: conversations.platform CHECK update skipped: %', SQLERRM;
END $$;

-- ── contacts.telegram_chat_id ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND column_name = 'telegram_chat_id'
  ) THEN
    ALTER TABLE contacts ADD COLUMN telegram_chat_id TEXT;
    RAISE NOTICE '072: Added contacts.telegram_chat_id';
  ELSE
    RAISE NOTICE '072: contacts.telegram_chat_id already exists, skipping';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_telegram_chat_id
  ON contacts (account_id, telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- ── telegram_bots table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_bots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Encrypted bot token (AES-256-GCM, same ENCRYPTION_KEY as whatsapp_config)
  bot_token     TEXT NOT NULL,

  -- Bot identity from Telegram getMe
  bot_id        BIGINT,
  bot_username  TEXT,
  bot_name      TEXT,

  -- Connection state
  status        TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'error')),

  -- Webhook state
  webhook_url      TEXT,
  webhook_set_at   TIMESTAMPTZ,
  -- Encrypted webhook secret (AES-256-GCM) used to verify incoming
  -- Telegram updates via X-Telegram-Bot-Api-Secret-Token header.
  webhook_secret   TEXT,

  -- Diagnostics
  last_webhook_at  TIMESTAMPTZ,
  last_inbound_at  TIMESTAMPTZ,
  last_error       TEXT,

  connected_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  -- One bot per account
  UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_bots_account
  ON telegram_bots (account_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE telegram_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_bots_select ON telegram_bots
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY telegram_bots_insert ON telegram_bots
  FOR INSERT WITH CHECK (is_account_member(account_id));

CREATE POLICY telegram_bots_update ON telegram_bots
  FOR UPDATE USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY telegram_bots_delete ON telegram_bots
  FOR DELETE USING (is_account_member(account_id));

-- ── updated_at trigger ────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at ON telegram_bots;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON telegram_bots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
