-- ============================================================
-- TZMICHA CRM 3.0 — Migration 013: Meta Ads Campaigns Integration
-- Additive & Non-destructive Migration
-- ============================================================

-- 1. Extend campaigns table with Meta Ads tracking attributes
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stop_time TIMESTAMPTZ;

-- 2. Prevent duplicate Meta imports within tenant scope
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_account_meta_id_idx 
  ON public.campaigns(account_id, meta_campaign_id) 
  WHERE meta_campaign_id IS NOT NULL;

-- 3. Sync logging table for auditability and observability
CREATE TABLE IF NOT EXISTS public.meta_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  api_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  fetched_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_sync_logs_account_idx 
  ON public.meta_sync_logs(account_id, created_at DESC);

-- 4. Enable RLS and grants
ALTER TABLE public.meta_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_sync_logs_select_policy ON public.meta_sync_logs;
CREATE POLICY meta_sync_logs_select_policy ON public.meta_sync_logs
  FOR SELECT
  USING (
    auth.uid() IS NULL 
    OR account_id IN (SELECT account_id FROM public.profiles WHERE user_id = auth.uid())
  );

GRANT ALL ON public.meta_sync_logs TO anon;
GRANT ALL ON public.meta_sync_logs TO authenticated;
GRANT ALL ON public.meta_sync_logs TO service_role;
