-- ============================================================
-- TZMICHA CRM 3.0 — Migration 014: Meta Ads Campaign Management Support
-- Additive & Non-destructive Migration
-- ============================================================

-- Extend campaigns table with campaign management budget and category columns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS daily_budget NUMERIC,
  ADD COLUMN IF NOT EXISTS lifetime_budget NUMERIC,
  ADD COLUMN IF NOT EXISTS special_ad_categories JSONB DEFAULT '["NONE"]'::jsonb,
  ADD COLUMN IF NOT EXISTS buying_type TEXT DEFAULT 'AUCTION';

-- Index for platform-filtered lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_platform_account 
  ON public.campaigns(account_id, platform) 
  WHERE platform = 'facebook';
