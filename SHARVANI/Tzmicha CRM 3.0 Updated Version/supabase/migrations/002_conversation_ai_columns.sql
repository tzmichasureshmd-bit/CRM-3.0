-- ============================================================
-- CRM 3.0 Migration 002 — Conversation AI Intelligence Columns
-- Extends existing conversations table with AI fields.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- Add AI intelligence columns to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_intent          TEXT,
  ADD COLUMN IF NOT EXISTS ai_sentiment       TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary         TEXT,
  ADD COLUMN IF NOT EXISTS ai_lead_score      INTEGER,
  ADD COLUMN IF NOT EXISTS ai_next_action     TEXT,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform           TEXT,
  ADD COLUMN IF NOT EXISTS priority           TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent'));

-- Index for AI-filtered queries
CREATE INDEX IF NOT EXISTS idx_conversations_ai_intent
  ON conversations(account_id, ai_intent)
  WHERE ai_intent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_platform
  ON conversations(account_id, platform);

CREATE INDEX IF NOT EXISTS idx_conversations_priority
  ON conversations(account_id, priority);

-- Ensure realtime is enabled for conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;
