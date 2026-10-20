-- ============================================================
-- 044: Add unique constraint on conversations(account_id, contact_id)
-- ============================================================
-- The code at webhook/route.ts and resolve-conversation.ts references
-- a UNIQUE constraint on (account_id, contact_id) for race-safe
-- conversation upserts. This migration adds it idempotently.
-- ============================================================

-- Guard: skip if the index already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_conversations_account_contact_unique'
  ) THEN
    -- Deduplicate first: keep the oldest conversation per (account_id, contact_id).
    -- Duplicate conversations (same account + contact) lose their messages FK
    -- target if we just drop rows, so we redirect by re-pointing FKs.
    WITH dups AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY account_id, contact_id
               ORDER BY created_at ASC, id ASC
             ) AS rn
      FROM conversations
    ),
    keepers AS (
      SELECT id, rn FROM dups WHERE rn = 1
    ),
    losers AS (
      SELECT dups.id AS loser_id, keepers.id AS keeper_id
      FROM dups
      JOIN keepers ON dups.account_id = (
        SELECT account_id FROM conversations WHERE id = keepers.id
      )
      AND dups.contact_id = (
        SELECT contact_id FROM conversations WHERE id = keepers.id
      )
      WHERE dups.rn > 1
    )
    -- Re-point messages from duplicate conversations to the keeper
    UPDATE messages m
    SET conversation_id = losers.keeper_id
    FROM losers
    WHERE m.conversation_id = losers.loser_id;

    -- Re-point conversation assignments from duplicates to the keeper
    UPDATE profiles p
    SET conversation_id = losers.keeper_id
    FROM losers
    WHERE p.conversation_id = losers.loser_id;

    -- Delete duplicate conversations (their messages have been reassigned)
    DELETE FROM conversations c
    USING losers l
    WHERE c.id = l.loser_id;

    -- Now create the unique index
    CREATE UNIQUE INDEX idx_conversations_account_contact_unique
      ON conversations (account_id, contact_id);

    RAISE NOTICE 'Created unique index idx_conversations_account_contact_unique';
  ELSE
    RAISE NOTICE 'Index idx_conversations_account_contact_unique already exists, skipping';
  END IF;
END $$;
