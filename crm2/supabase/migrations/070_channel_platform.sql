-- ============================================================
-- 070: Unified channel platform for conversations
-- ============================================================
-- Turns the CRM into a multi-channel inbox. Every conversation
-- now carries which channel it lives on (whatsapp / facebook /
-- instagram) plus the channel-scoped ids needed to send and
-- thread replies on Meta's Graph API:
--
--   conversations.channel_recipient_id   — PSID (facebook) or
--                                          IG-scoped user id
--   conversations.channel_page_id        — Facebook Page id or
--                                          Instagram account id
--   conversations.channel_username       — display name on channel
--
-- The old UNIQUE (account_id, contact_id) index is widened to
-- (account_id, contact_id, platform): a contact can now have one
-- conversation per channel instead of exactly one conversation
-- regardless of channel (which would have forced a contact to be
-- "either WhatsApp or Messenger").
--
-- Contacts gain messenger_psid / instagram_user_id. Partial
-- unique indexes make webhook ingest + send race-safe: a returning
-- Messenger/IG user maps back to the same contact (dedupe), and
-- the upsert cannot double-create.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- conversations.platform
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'platform'
  ) THEN
    ALTER TABLE conversations
      ADD COLUMN platform TEXT NOT NULL DEFAULT 'whatsapp'
      CHECK (platform IN ('whatsapp', 'facebook', 'instagram'));
    RAISE NOTICE 'Added conversations.platform';
  ELSE
    RAISE NOTICE 'conversations.platform already exists, skipping';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- conversations channel ids
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'channel_recipient_id'
  ) THEN
    ALTER TABLE conversations
      ADD COLUMN channel_recipient_id TEXT,
      ADD COLUMN channel_page_id TEXT,
      ADD COLUMN channel_username TEXT;
    RAISE NOTICE 'Added conversations.channel_* columns';
  ELSE
    RAISE NOTICE 'conversations.channel_* columns already exist, skipping';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- Widen the unique conversation index to include platform
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_conversations_account_contact_platform_unique'
  ) THEN
    -- All pre-existing rows are 'whatsapp'; the legacy index already
    -- guarantees (account_id, contact_id) uniqueness, so (account_id,
    -- contact_id, 'whatsapp') is trivially unique — safe to swap.
    DROP INDEX IF EXISTS idx_conversations_account_contact_unique;

    CREATE UNIQUE INDEX idx_conversations_account_contact_platform_unique
      ON conversations (account_id, contact_id, platform);

    RAISE NOTICE 'Created unique index idx_conversations_account_contact_platform_unique';
  ELSE
    RAISE NOTICE 'idx_conversations_account_contact_platform_unique already exists, skipping';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- Channel indexes (platform list filter + status ordering)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_platform
  ON conversations (platform);

CREATE INDEX IF NOT EXISTS idx_conversations_account_platform_last_message
  ON conversations (account_id, platform, last_message_at DESC);

-- ────────────────────────────────────────────────────────────
-- Contact channel identities (messenger PSID / Instagram id)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND column_name = 'messenger_psid'
  ) THEN
    ALTER TABLE contacts
      ADD COLUMN messenger_psid TEXT,
      ADD COLUMN instagram_user_id TEXT;
    RAISE NOTICE 'Added contacts.messenger_psid / instagram_user_id';
  ELSE
    RAISE NOTICE 'contacts messenger psid columns already exist, skipping';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_messenger_psid
  ON contacts (account_id, messenger_psid)
  WHERE messenger_psid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_instagram_user_id
  ON contacts (account_id, instagram_user_id)
  WHERE instagram_user_id IS NOT NULL;