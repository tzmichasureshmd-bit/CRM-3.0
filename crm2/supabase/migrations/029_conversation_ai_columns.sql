-- ============================================================
-- 029_conversation_ai_columns.sql — AI auto-reply state columns
--
-- Adds three columns to `conversations` that the AI auto-reply
-- system (src/lib/whatsapp/auto-reply.ts, src/components/inbox/ai-thread-banner.tsx)
-- needs to track per-thread AI state.
--
-- Columns
--   - ai_autoreply_disabled  BOOLEAN   — bot is paused on this thread
--   - ai_reply_count         INTEGER   — how many times bot auto-replied
--   - ai_handoff_summary     TEXT      — internal note the bot wrote on handoff
--
-- These are nullable / defaulted so existing rows are unaffected.
-- RLS on conversations already covers these columns via the row-level
-- policy established in migration 017 — no new policies needed.
--
-- Idempotent — IF NOT EXISTS / ADD COLUMN IF NOT EXISTS are no-ops
-- if the column already exists.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_autoreply_disabled  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_reply_count          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_handoff_summary      TEXT;

-- Index for the "threads where the bot is paused" filter in the AI
-- dashboard and sidebar. Partial — most threads aren't disabled.
CREATE INDEX IF NOT EXISTS idx_conversations_ai_disabled
  ON conversations(account_id, ai_autoreply_disabled)
  WHERE ai_autoreply_disabled IS TRUE;

-- Realtime — so the AI-thread-banner updates when the bot
-- disables itself elsewhere in the same account.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;
