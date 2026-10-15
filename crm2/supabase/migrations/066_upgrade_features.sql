-- ============================================================
-- 066_upgrade_features.sql
--
-- Adds:
--   1. Tickets: category column, unique (account_id, ticket_number)
--      index, atomic next_ticket_number(account_id) RPC.
--   2. Deals: trigger to sync status from stage name on move.
--   3. Preset campaigns: reusable campaign templates table + RLS.
--
-- SAFETY: all additive, non-destructive, tenant-safe, RLS-covered.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TICKETS — category + unique index + RPC
-- ------------------------------------------------------------

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(account_id, category);

-- Unique per-account ticket_number (prevents race-condition duplicates
-- from concurrent creates). SERIAL is globally unique so this is
-- logically redundant but adds a hard guarantee and enables the
-- next_ticket_number RPC to detect collisions safely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_account_number
  ON tickets(account_id, ticket_number);

-- Atomic ticket-number generator (advisory-lock serialised per account).
-- Call: SELECT next_ticket_number('...');
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

-- ------------------------------------------------------------
-- 2. DEALS — trigger syncs status from stage name
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_deal_status_from_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_stage_name TEXT;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id OR TG_OP = 'INSERT' THEN
    SELECT name INTO v_stage_name
    FROM pipeline_stages
    WHERE id = NEW.stage_id;

    IF v_stage_name ILIKE 'won' THEN
      NEW.status := 'won';
    ELSIF v_stage_name ILIKE 'lost' THEN
      NEW.status := 'lost';
    ELSE
      -- Only reset if the status was previously won/lost and the
      -- deal moves back to a non-terminal stage. Leave 'open'
      -- (the default) alone.
      IF OLD.status IS DISTINCT FROM 'open' THEN
        NEW.status := 'open';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deal_status ON deals;
CREATE TRIGGER trg_sync_deal_status
  BEFORE INSERT OR UPDATE OF stage_id
  ON deals
  FOR EACH ROW
  EXECUTE FUNCTION sync_deal_status_from_stage();

-- ------------------------------------------------------------
-- 3. PRESET CAMPAIGNS
-- ------------------------------------------------------------

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
CREATE INDEX IF NOT EXISTS idx_preset_campaigns_category
  ON preset_campaigns(account_id, category);

ALTER TABLE preset_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS preset_campaigns_select ON preset_campaigns;
CREATE POLICY preset_campaigns_select ON preset_campaigns
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS preset_campaigns_insert ON preset_campaigns;
CREATE POLICY preset_campaigns_insert ON preset_campaigns
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS preset_campaigns_update ON preset_campaigns;
CREATE POLICY preset_campaigns_update ON preset_campaigns
  FOR UPDATE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS preset_campaigns_delete ON preset_campaigns;
CREATE POLICY preset_campaigns_delete ON preset_campaigns
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Wire up the preset_campaigns type so Supabase PostgREST picks up
-- the new table via the realtime publication.
ALTER PUBLICATION supabase_realtime ADD TABLE preset_campaigns;
