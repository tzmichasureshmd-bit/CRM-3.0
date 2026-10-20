-- ============================================================
-- CRM 3.0 Migration 005 — P7 Attribution Enhancements
-- Adds source/channel tracking, campaign linkage, and indexes.
-- crm3_attribution already exists from migration 001.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ── Extend crm3_attribution with source/channel tracking ─────
ALTER TABLE crm3_attribution
  ADD COLUMN IF NOT EXISTS source          TEXT,
  ADD COLUMN IF NOT EXISTS channel         TEXT,
  ADD COLUMN IF NOT EXISTS utm_source      TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium      TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign    TEXT,
  ADD COLUMN IF NOT EXISTS qualified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_won_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_won          BOOLEAN NOT NULL DEFAULT false;

-- ── Additional indexes for attribution queries ────────────────
CREATE INDEX IF NOT EXISTS crm3_attribution_content_idx
  ON crm3_attribution(content_id)
  WHERE content_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm3_attribution_campaign_idx
  ON crm3_attribution(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm3_attribution_created_idx
  ON crm3_attribution(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm3_attribution_source_idx
  ON crm3_attribution(account_id, source)
  WHERE source IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm3_attribution_won_idx
  ON crm3_attribution(account_id, is_won)
  WHERE is_won = true;

-- ── Extend crm3_content with campaign_source tracking ────────
ALTER TABLE crm3_content
  ADD COLUMN IF NOT EXISTS source          TEXT,
  ADD COLUMN IF NOT EXISTS channel         TEXT,
  ADD COLUMN IF NOT EXISTS views           INTEGER,
  ADD COLUMN IF NOT EXISTS shares          INTEGER;

-- ── Index for content performance queries ────────────────────
CREATE INDEX IF NOT EXISTS crm3_content_published_idx
  ON crm3_content(account_id, published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS crm3_content_campaign_idx
  ON crm3_content(campaign_id)
  WHERE campaign_id IS NOT NULL;
