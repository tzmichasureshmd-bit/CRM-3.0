-- ============================================================
-- 037_message_status_columns.sql
--
-- Two columns that the inbox message-actions toolbar now needs:
--
--   messages.deleted_at  TIMESTAMPTZ  — soft-delete flag. NULL =
--     visible. Set when an agent deletes a message from the
--     thread. The message row is retained (audit trail +
--     conversation stats) but the bubble collapses to a muted
--     "[Message deleted]" placeholder.
--
--   messages.is_starred   BOOLEAN      — per-contact-thread bookmark.
--     Agents star the messages that matter (e.g. a shipping
--     number, an order reference) and un-star with a second click.
--     The star icon toggles on the hover toolbar.
--
-- Both columns are nullable / defaulted so existing rows and
-- existing inserts are unaffected — the message-bubble handles
-- the absence of these values gracefully.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- deleted_at (soft-delete)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- is_starred (bookmark)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for the "starred messages" filter (rarely true, so partial).
CREATE INDEX IF NOT EXISTS idx_messages_starred
  ON messages(is_starred, conversation_id)
  WHERE is_starred IS TRUE;

-- Index for the "deleted messages" audit filter.
CREATE INDEX IF NOT EXISTS idx_messages_deleted
  ON messages(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Realtime — so the star/delete pill updates instantly on other
-- tabs/devices when an agent stars or deletes a message.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;
