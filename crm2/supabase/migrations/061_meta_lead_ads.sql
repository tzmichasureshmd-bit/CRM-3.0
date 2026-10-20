-- ============================================================
-- 061_meta_lead_ads.sql
--
-- Facebook + Instagram Lead Ads → CRM Contacts integration.
--
-- Adds Lead Ads source attribution to the existing `contacts`
-- table (so Meta leads live in the SAME table as every other
-- contact — no separate/disconnected lead system), plus two new
-- tables:
--
--   * meta_page_connections — the connected Facebook Pages /
--     Instagram Professional accounts per tenant (stores only an
--     AES-256-GCM-encrypted access token, never plaintext).
--   * meta_lead_events     — an idempotency log so a webhook
--     received repeatedly for the same Meta Lead ID never creates
--     a second contact (or inflates the lead count).
--
-- SAFETY: entirely additive. Nothing here drops or alters existing
-- columns, values, or rows. Existing contacts keep working
-- unchanged. RLS is NOT weakened: the new `contacts` columns are
-- governed by the existing per-account contacts policies, and the
-- new tables get their own `is_account_member`-based policies.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Lead Ads source attribution on `contacts`
-- ------------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS source                TEXT,
  ADD COLUMN IF NOT EXISTS source_platform       TEXT,        -- 'facebook' | 'instagram'
  ADD COLUMN IF NOT EXISTS meta_lead_id          TEXT,        -- dedup key, idempotency
  ADD COLUMN IF NOT EXISTS source_page_id        TEXT,
  ADD COLUMN IF NOT EXISTS source_page_name      TEXT,
  ADD COLUMN IF NOT EXISTS source_instagram_id   TEXT,
  ADD COLUMN IF NOT EXISTS source_instagram_username TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id           TEXT,
  ADD COLUMN IF NOT EXISTS campaign_name         TEXT,
  ADD COLUMN IF NOT EXISTS adset_id              TEXT,
  ADD COLUMN IF NOT EXISTS adset_name            TEXT,
  ADD COLUMN IF NOT EXISTS ad_id                 TEXT,
  ADD COLUMN IF NOT EXISTS ad_name               TEXT,
  ADD COLUMN IF NOT EXISTS form_id               TEXT,
  ADD COLUMN IF NOT EXISTS form_name             TEXT,
  ADD COLUMN IF NOT EXISTS meta_created_time     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_json           JSONB;       -- raw Meta lead payload (audit)

-- Indexes for fast, DB-side counting / filtering / dedup (never
-- load every contact into the browser just to compute lead stats).
CREATE INDEX IF NOT EXISTS idx_contacts_source            ON contacts (account_id, source);
CREATE INDEX IF NOT EXISTS idx_contacts_source_platform   ON contacts (account_id, source_platform);
CREATE INDEX IF NOT EXISTS idx_contacts_source_page_id    ON contacts (account_id, source_page_id);
CREATE INDEX IF NOT EXISTS idx_contacts_source_instagram  ON contacts (account_id, source_instagram_id);
CREATE INDEX IF NOT EXISTS idx_contacts_meta_lead_id      ON contacts (account_id, meta_lead_id);
CREATE INDEX IF NOT EXISTS idx_contacts_campaign_id       ON contacts (account_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_meta_created_time ON contacts (account_id, meta_created_time);

-- Uniqueness: the same Meta Lead ID can never create a second
-- contact in the same account. Partial index keeps the constraint
-- scoped to rows that actually carry a meta_lead_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_meta_lead_dedup
  ON contacts (account_id, meta_lead_id)
  WHERE meta_lead_id IS NOT NULL;

-- ------------------------------------------------------------------
-- 2. meta_page_connections
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta_page_connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id               TEXT NOT NULL,
  page_name             TEXT,
  access_token          TEXT NOT NULL,       -- AES-256-GCM encrypted
  verify_token          TEXT,                -- optional per-page verify token (encrypted)
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disconnected')),
  webhook_status        TEXT DEFAULT 'pending' CHECK (webhook_status IN ('active','pending','error')),
  platform              TEXT NOT NULL DEFAULT 'facebook' CHECK (platform IN ('facebook','instagram')),
  instagram_account_id  TEXT,
  instagram_username    TEXT,
  access_token_expires_at TIMESTAMPTZ,
  connected_at          TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  -- A given Page may have both a facebook connection and an
  -- instagram connection (the latter representing the Page's
  -- linked Instagram Professional account).
  UNIQUE (account_id, page_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_meta_page_connections_account
  ON meta_page_connections (account_id);

-- RLS — mirror the account-scoping used everywhere else.
ALTER TABLE meta_page_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_page_connections_select ON meta_page_connections
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY meta_page_connections_insert ON meta_page_connections
  FOR INSERT WITH CHECK (is_account_member(account_id));
CREATE POLICY meta_page_connections_update ON meta_page_connections
  FOR UPDATE USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));
CREATE POLICY meta_page_connections_delete ON meta_page_connections
  FOR DELETE USING (is_account_member(account_id));

-- ------------------------------------------------------------------
-- 3. meta_lead_events (idempotency log — service role only)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta_lead_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         TEXT NOT NULL,
  leadgen_id      TEXT NOT NULL,
  form_id         TEXT,
  event_payload   JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (page_id, leadgen_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_events_page
  ON meta_lead_events (page_id);

-- The webhook writes this table via the service-role client, which
-- bypasses RLS, so it needs no RLS policies. Leave it disabled so it
-- is unreachable by user-scoped clients (same pattern as
-- automation_pending_executions).
