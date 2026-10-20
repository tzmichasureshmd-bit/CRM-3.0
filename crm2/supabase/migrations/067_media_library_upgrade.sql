-- Migration 067: Add category to media_assets for the Media Library
-- rewrite. Non-destructive: existing rows get NULL (no filter applied yet),
-- no RLS changes needed since media_assets policies already gate on
-- account_id (RLS for SELECT/INSERT/UPDATE/DELETE on media_assets is
-- scoped to the tenant via the account_id column).

-- 1. Add the nullable category column.
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS category text;

-- 2. Index for category-filtered library queries (paginated + filtered
--    by account_id + category). Co-located on (account_id, category) to
--    serve the most common Media Library list pattern efficiently.
CREATE INDEX IF NOT EXISTS idx_media_assets_account_category
  ON media_assets (account_id, category)
  WHERE category IS NOT NULL;