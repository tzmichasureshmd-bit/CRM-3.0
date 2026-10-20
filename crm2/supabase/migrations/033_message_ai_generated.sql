-- ============================================================
-- 033_message_ai_generated.sql — AI-generated message flag
--
-- Adds `ai_generated` to `messages` so the inbox can show an "AI"
-- badge on bot-sent messages (src/components/inbox/message-bubble.tsx).
--
-- This column distinguishes auto-replies from regular bot/agent sends —
-- all three share sender_type 'bot'/'agent', but only the auto-reply
-- bot should carry the visual AI badge.
--
-- Nullable with a FALSE default so existing rows are unaffected and
-- existing inserts (which don't specify it) get FALSE.
--
-- Idempotent — ADD COLUMN IF NOT EXISTS is a no-op if it exists.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for filtering AI vs human-sent messages in analytics.
CREATE INDEX IF NOT EXISTS idx_messages_ai_generated
  ON messages(ai_generated) WHERE ai_generated IS TRUE;
