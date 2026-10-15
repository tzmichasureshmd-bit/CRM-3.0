-- ============================================================
-- 035_quick_replies_and_interactive_payload.sql
--
-- Two things the chat UI needs:
--
--   1. `messages.interactive_payload`  JSONB
--      Stores the structured payload of an OUTBOUND interactive
--      message (button list / reply rows) so the thread can re-render
--      the buttons, not just the body text. Used by
-- src/components/inbox/message-bubble.tsx + src/lib/whatsapp/interactive.ts.
--      Nullable — only set when content_type='interactive' and
--      sender_type is agent/bot.
--
--   2. `quick_replies` table
--      Account-scoped reusable snippets. One row per
--      (account_id, title). Kind 'text' stores `content_text`;
--      kind 'interactive' stores `interactive_payload` as JSONB.
--      Drives src/components/inbox/quick-reply-picker.tsx
--      (GET /api/quick-replies) and its CRUD API.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. interactive_payload on messages
-- ============================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS interactive_payload JSONB;

CREATE INDEX IF NOT EXISTS idx_messages_interactive
  ON messages(interactive_reply_id)
  WHERE interactive_reply_id IS NOT NULL;

-- ============================================================
-- 2. quick_replies table
-- ============================================================
CREATE TABLE IF NOT EXISTS quick_replies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'text'
                    CHECK (kind IN ('text', 'interactive')),
  content_text      TEXT,
  interactive_payload JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, title)
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_account  ON quick_replies(account_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_user     ON quick_replies(user_id);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the account.
DROP POLICY IF EXISTS quick_replies_select ON quick_replies;
CREATE POLICY quick_replies_select ON quick_replies FOR SELECT
  USING (is_account_member(account_id));

-- INSERT / UPDATE / DELETE: agent+ (settings-class).
DROP POLICY IF EXISTS quick_replies_insert ON quick_replies;
CREATE POLICY quick_replies_insert ON quick_replies FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS quick_replies_update ON quick_replies;
CREATE POLICY quick_replies_update ON quick_replies FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS quick_replies_delete ON quick_replies;
CREATE POLICY quick_replies_delete ON quick_replies FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- Realtime — so the quick-reply picker refreshes when a teammate
-- saves a new snippet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quick_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quick_replies;
  END IF;
END $$;
