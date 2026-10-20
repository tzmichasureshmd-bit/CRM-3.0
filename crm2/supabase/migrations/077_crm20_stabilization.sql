-- ============================================================
-- 077_crm20_stabilization.sql
--
-- CRM 2.0 stabilisation pass.
--
-- WHY THIS FILE EXISTS
-- The repository ships migrations 001-076, but deployments do not
-- always have every one of them applied (the schema drifts). This
-- file is the single, idempotent "catch-up" script for the objects
-- the CRM 2.0 acceptance criteria depend on. It is safe to run
-- repeatedly against any environment, and it only ever ADDS.
--
-- Run it in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Or:        supabase db push   (from a linked project)
--
-- Contents
--   1. Tickets      : category column, unique per-account number
--                     index, atomic next_ticket_number() RPC
--                     (back-fills migration 066)
--   2. Media assets : media_assets registry table + category
--                     (back-fills migrations 049 + 067)
--   3. Campaigns    : NEW campaigns table + tenant RLS + link from
--                     broadcasts (CRM 2.0 sections 4-8)
--   4. Quick replies: shortcut / channel / language / category /
--                     status columns (CRM 2.0 section 21)
--   5. Presets      : preset_campaigns table (migration 066)
--
-- Nothing here drops, renames, or rewrites existing data.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TICKETS - category + numbering (migration 066)
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(account_id, category);

-- Guarantees (account_id, ticket_number) is unique so concurrent
-- creates can never collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_account_number
  ON tickets(account_id, ticket_number);

-- Atomic per-account ticket number generator. Serialised with an
-- advisory lock so two simultaneous creates cannot both read the
-- same MAX().
CREATE OR REPLACE FUNCTION next_ticket_number(p_account_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ticket_number:' || p_account_id::text));
  SELECT COALESCE(MAX(ticket_number), 0) + 1
    INTO v_next
    FROM tickets
   WHERE account_id = p_account_id;
  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION next_ticket_number(UUID) TO authenticated;

-- Keep updated_at honest on every status change (the UI writes it
-- explicitly too - belt and braces).
DROP TRIGGER IF EXISTS trg_tickets_touch ON tickets;
CREATE TRIGGER trg_tickets_touch
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. MEDIA LIBRARY - media_assets registry (migrations 049 + 067)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.media_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  bucket      TEXT NOT NULL,
  path        TEXT NOT NULL,
  public_url  TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL DEFAULT '',
  size_bytes  BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  kind        TEXT NOT NULL DEFAULT 'document'
              CHECK (kind IN ('image','video','audio','document')),
  category    TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, bucket, path)
);

CREATE INDEX IF NOT EXISTS idx_media_assets_account_created
  ON public.media_assets (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_account_kind
  ON public.media_assets (account_id, kind);
CREATE INDEX IF NOT EXISTS idx_media_assets_account_category
  ON public.media_assets (account_id, category)
  WHERE category IS NOT NULL;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'media_assets'
      AND policyname = 'media_assets_select_account_or_super'
  ) THEN
    CREATE POLICY media_assets_select_account_or_super
      ON public.media_assets FOR SELECT
      USING (is_account_member(account_id, 'viewer') OR is_super_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'media_assets'
      AND policyname = 'media_assets_insert_account_member'
  ) THEN
    CREATE POLICY media_assets_insert_account_member
      ON public.media_assets FOR INSERT
      WITH CHECK (is_account_member(account_id, 'agent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'media_assets'
      AND policyname = 'media_assets_delete_account_admin'
  ) THEN
    CREATE POLICY media_assets_delete_account_admin
      ON public.media_assets FOR DELETE
      USING (is_account_member(account_id, 'admin'));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
REVOKE ALL ON public.media_assets FROM anon;

-- ============================================================
-- 3. CAMPAIGNS - marketing/business campaigns (CRM 2.0 sections 4-8)
--
-- Campaign  = strategy (who, why, what offer, which channels, budget)
-- Broadcast = message distribution (an execution channel a campaign
--             may launch). They stay separate tables on purpose.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  name           TEXT NOT NULL,
  description    TEXT,

  -- lead_generation | product_promotion | offer | awareness | event |
  -- retention | re_engagement | seasonal_promotion
  type           TEXT NOT NULL DEFAULT 'lead_generation'
                 CHECK (type IN ('lead_generation','product_promotion','offer',
                                 'awareness','event','retention',
                                 're_engagement','seasonal_promotion')),
  objective      TEXT,

  -- draft | scheduled | active | paused | completed | archived
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','scheduled','active','paused',
                                   'completed','archived')),

  -- Free-text audience description plus a machine-readable filter the
  -- broadcast composer can reuse (mirrors broadcasts.audience_filter).
  audience       TEXT,
  audience_filter JSONB NOT NULL DEFAULT '{}',

  -- e.g. {whatsapp, instagram, facebook, email}
  channels       TEXT[] NOT NULL DEFAULT '{}',

  start_date     DATE,
  end_date       DATE,
  budget         NUMERIC(12,2),

  message        TEXT,
  cta            TEXT,
  landing_page   TEXT,

  -- Offer block (section 6): "Diwali Special Offer / 20% OFF / until Oct 30"
  offer_title    TEXT,
  offer_summary  TEXT,
  offer_discount TEXT,
  offer_valid_until DATE,

  tags           TEXT[] NOT NULL DEFAULT '{}',

  -- Campaign-level counters. Real numbers roll up from the linked
  -- broadcasts + deals; manual adjustments are stored here too.
  tracking       JSONB NOT NULL DEFAULT '{}',

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_account_created
  ON public.campaigns (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_account_status
  ON public.campaigns (account_id, status);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaigns'
      AND policyname = 'campaigns_select'
  ) THEN
    CREATE POLICY campaigns_select ON public.campaigns FOR SELECT
      USING (is_account_member(account_id, 'viewer') OR is_super_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaigns'
      AND policyname = 'campaigns_insert'
  ) THEN
    CREATE POLICY campaigns_insert ON public.campaigns FOR INSERT
      WITH CHECK (is_account_member(account_id, 'agent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaigns'
      AND policyname = 'campaigns_update'
  ) THEN
    CREATE POLICY campaigns_update ON public.campaigns FOR UPDATE
      USING (is_account_member(account_id, 'agent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaigns'
      AND policyname = 'campaigns_delete'
  ) THEN
    CREATE POLICY campaigns_delete ON public.campaigns FOR DELETE
      USING (is_account_member(account_id, 'admin'));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
REVOKE ALL ON public.campaigns FROM anon;

DROP TRIGGER IF EXISTS trg_campaigns_touch ON public.campaigns;
CREATE TRIGGER trg_campaigns_touch
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional link: a broadcast launched by a campaign. Nullable so every
-- existing broadcast row is untouched.
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS campaign_id UUID
  REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_broadcasts_campaign
  ON broadcasts(campaign_id)
  WHERE campaign_id IS NOT NULL;

-- ============================================================
-- 4. QUICK REPLIES - CRM 2.0 section 21 fields
--
-- title / kind / content_text / interactive_payload already exist
-- (migration 035) and are what the inbox picker + API use. These
-- nullable columns add the organisation fields the Quick Reply page
-- exposes. The UI probes for each one and hides the control with an
-- explanation when it is absent, so running this migration is optional
-- but recommended.
-- ============================================================

ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS shortcut TEXT,
  ADD COLUMN IF NOT EXISTS channel  TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS status   TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quick_replies_account_category
  ON quick_replies(account_id, category)
  WHERE category IS NOT NULL;

-- ============================================================
-- 5. PRESET CAMPAIGNS (migration 066)
-- ============================================================

CREATE TABLE IF NOT EXISTS preset_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by        UUID REFERENCES auth.users(id),
  name              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'general',
  description       TEXT,
  template_name     TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'en_US',
  audience_filter   JSONB NOT NULL DEFAULT '{}',
  template_variables JSONB NOT NULL DEFAULT '{}',
  header_media_url  TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preset_campaigns_account
  ON preset_campaigns(account_id);

ALTER TABLE preset_campaigns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'preset_campaigns'
      AND policyname = 'preset_campaigns_select'
  ) THEN
    CREATE POLICY preset_campaigns_select ON preset_campaigns FOR SELECT
      USING (is_account_member(account_id, 'viewer'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'preset_campaigns'
      AND policyname = 'preset_campaigns_insert'
  ) THEN
    CREATE POLICY preset_campaigns_insert ON preset_campaigns FOR INSERT
      WITH CHECK (is_account_member(account_id, 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'preset_campaigns'
      AND policyname = 'preset_campaigns_update'
  ) THEN
    CREATE POLICY preset_campaigns_update ON preset_campaigns FOR UPDATE
      USING (is_account_member(account_id, 'admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'preset_campaigns'
      AND policyname = 'preset_campaigns_delete'
  ) THEN
    CREATE POLICY preset_campaigns_delete ON preset_campaigns FOR DELETE
      USING (is_account_member(account_id, 'admin'));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON preset_campaigns TO authenticated;
REVOKE ALL ON preset_campaigns FROM anon;

-- ============================================================
-- 6. STORAGE - the buckets the app writes to
--
-- Storage buckets are an API object, not a table, so this statement
-- only records intent. Create them from the dashboard (Storage ->
-- New bucket) or run scripts/setup-storage.mjs:
--   node scripts/setup-storage.mjs
-- Required buckets: avatars (public, 2MB, images)
--                   chat-media (public, 16MB)
--                   flow-media (public, 16MB)
-- ============================================================

COMMIT;
