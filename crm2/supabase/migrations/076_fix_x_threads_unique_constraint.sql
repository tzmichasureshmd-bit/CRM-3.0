-- ============================================================
-- 076: Partial unique indexes for X and Threads channel integrations
-- ============================================================
-- The channel_integrations table has UNIQUE (account_id, platform, page_id).
-- When page_id IS NULL (always for X and Threads), Postgres treats each
-- NULL as distinct, so the constraint never fires and duplicate rows
-- accumulate on reconnect. These partial unique indexes enforce one row
-- per account per platform when page_id is NULL.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_integrations_x_unique
  ON channel_integrations (account_id, platform)
  WHERE platform = 'x' AND page_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_integrations_threads_unique
  ON channel_integrations (account_id, platform)
  WHERE platform = 'threads' AND page_id IS NULL;

-- Clean up any duplicate rows that may have accumulated, keeping the
-- most recently updated row per account per platform.
DELETE FROM channel_integrations
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY account_id, platform
             ORDER BY updated_at DESC NULLS LAST
           ) AS rn
    FROM channel_integrations
    WHERE platform IN ('x', 'threads') AND page_id IS NULL
  ) ranked
  WHERE rn > 1
);
