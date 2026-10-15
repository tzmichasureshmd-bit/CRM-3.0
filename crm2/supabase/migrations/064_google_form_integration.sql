-- ============================================================
-- 064_google_form_integration.sql
--
-- Google Forms → CRM Contacts integration.
--
-- Google Form submissions arrive via a secure public-API webhook
-- (POST /api/v1/integrations/google-forms, scope: contacts:write)
-- and are written into the EXISTING `contacts` table — the CRM stays
-- the single source of truth. Google Sheets/Apps Script are only the
-- delivery/staging mechanism, never a second database.
--
-- This migration is purely additive and non-destructive:
--   * `source = 'google_form'` reuses the column added by 061 (Meta).
--   * `google_form_submission_id` mirrors `meta_lead_id` as the
--     idempotency key so Apps Script retries can NEVER create a
--     duplicate contact.
--   * `utm_*` columns capture campaign/attribution tracking from the
--     form/landing page URL (utm_source, utm_medium, utm_campaign,
--     utm_content, utm_term) — only populated when actually provided.
--   * `form_id` (already added in 061) identifies which Google Form.
--
-- SAFETY: no existing columns/tables/rows are altered or dropped.
-- RLS is unchanged — the existing per-account `contacts` policies
-- already govern every column, so nothing here weakens tenant
-- isolation. The webhook writes via the service-role client scoped
-- to the API key's account (see requireApiKey), never bypassing the
-- account boundary, and this file adds no RLS policies at all.
-- ============================================================

-- Idempotency key for Google Form submissions. Mirrors the
-- `meta_lead_id` pattern: a partial unique index scoped to rows that
-- actually carry a submission id, so the same form response reaching
-- the webhook twice resolves to exactly one contact.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS google_form_submission_id TEXT;

-- Attribution / campaign tracking from the form or landing page URL.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS utm_source    TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium    TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign  TEXT,
  ADD COLUMN IF NOT EXISTS utm_content   TEXT,
  ADD COLUMN IF NOT EXISTS utm_term      TEXT;

-- Dedup: the same submission can never create a second contact in the
-- same account. Partial index keeps the constraint scoped to rows that
-- carry a google_form_submission_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_google_form_submission_dedup
  ON contacts (account_id, google_form_submission_id)
  WHERE google_form_submission_id IS NOT NULL;

-- Index for fast DB-side counting/filtering by source and by the
-- attributed campaign.
CREATE INDEX IF NOT EXISTS idx_contacts_google_form_source
  ON contacts (account_id, source) WHERE source = 'google_form';
CREATE INDEX IF NOT EXISTS idx_contacts_utm_campaign
  ON contacts (account_id, utm_campaign)
  WHERE utm_campaign IS NOT NULL;
