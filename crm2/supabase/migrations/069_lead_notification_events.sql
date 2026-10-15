-- ============================================================
-- 069_lead_notification_events.sql
--
-- Super Admin platform lead monitoring + automatic two-person
-- "new lead" email alerts.
--
-- Adds:
--   - platform_lead_notification_settings (single row, id = 1)
--       * enabled toggle
--       * recipient_1_email / recipient_2_email
--       * from_email / from_name (Tzmicha sender branding)
--   - lead_notification_events (queue + delivery log)
--       * one row PER recipient PER new lead (so recipient A can
--         succeed while recipient B fails, tracked separately)
--   - AFTER INSERT trigger on deals -> enqueue events (the single
--     universal new-lead hook — fires for WhatsApp, Google Forms,
--     Meta/Facebook/Instagram, manual entry, API, campaign and
--     automation-created leads alike, because every path INSERTs
--     into `deals`).
--   - get_platform_lead_stats() RPC — exact platform lead counts
--     for the Super Admin dashboard (super admin only).
--   - follow_ups SELECT access for super admin (RLS override).
--   - realtime publication for deals + lead_notification_events.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. PLATFORM LEAD NOTIFICATION SETTINGS (single-row config)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_lead_notification_settings (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
  recipient_1_email TEXT,
  recipient_2_email TEXT,
  from_email     TEXT        NOT NULL DEFAULT 'no-reply@tzmicha.com',
  from_name      TEXT        NOT NULL DEFAULT 'Tzmicha',
  updated_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_notif_settings_single
  ON platform_lead_notification_settings (id);

ALTER TABLE platform_lead_notification_settings ENABLE ROW LEVEL SECURITY;

-- Only super admins can read or modify platform-wide alert settings.
DROP POLICY IF EXISTS lead_notif_settings_select ON platform_lead_notification_settings;
CREATE POLICY lead_notif_settings_select
  ON platform_lead_notification_settings FOR SELECT
  USING (is_super_admin());

DROP POLICY IF EXISTS lead_notif_settings_insert ON platform_lead_notification_settings;
CREATE POLICY lead_notif_settings_insert
  ON platform_lead_notification_settings FOR INSERT
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS lead_notif_settings_update ON platform_lead_notification_settings;
CREATE POLICY lead_notif_settings_update
  ON platform_lead_notification_settings FOR UPDATE
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS lead_notif_settings_delete ON platform_lead_notification_settings;
CREATE POLICY lead_notif_settings_delete
  ON platform_lead_notification_settings FOR DELETE
  USING (is_super_admin());

-- Seed the single config row (disabled until a super admin enables it).
INSERT INTO platform_lead_notification_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. LEAD NOTIFICATION EVENTS (queue + delivery log)
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_notification_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipient_email   TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at           TIMESTAMPTZ,
  error_message     TEXT,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  lease_expires_at  TIMESTAMPTZ,
  -- Hard idempotency: one event per recipient per lead, ever.
  CONSTRAINT lead_notification_events_deal_recipient_key UNIQUE (deal_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_lne_status ON lead_notification_events(status);
CREATE INDEX IF NOT EXISTS idx_lne_created ON lead_notification_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lne_deal ON lead_notification_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_lne_account ON lead_notification_events(account_id);
CREATE INDEX IF NOT EXISTS idx_lne_lease ON lead_notification_events(lease_expires_at)
  WHERE status = 'pending';

ALTER TABLE lead_notification_events ENABLE ROW LEVEL SECURITY;

-- Super admins monitor the queue; normal tenants never see it.
DROP POLICY IF EXISTS lead_notification_events_select ON lead_notification_events;
CREATE POLICY lead_notification_events_select
  ON lead_notification_events FOR SELECT
  USING (is_super_admin());

DROP POLICY IF EXISTS lead_notification_events_insert ON lead_notification_events;
CREATE POLICY lead_notification_events_insert
  ON lead_notification_events FOR INSERT
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS lead_notification_events_update ON lead_notification_events;
CREATE POLICY lead_notification_events_update
  ON lead_notification_events FOR UPDATE
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS lead_notification_events_delete ON lead_notification_events;
CREATE POLICY lead_notification_events_delete
  ON lead_notification_events FOR DELETE
  USING (is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON lead_notification_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_lead_notification_settings TO authenticated, service_role;

-- ============================================================
-- 3. NEW-LEAD TRIGGER (universal hook — fires on any deals INSERT)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_deal_lead_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg platform_lead_notification_settings%ROWTYPE;
  r1 text;
  r2 text;
BEGIN
  SELECT * INTO cfg FROM platform_lead_notification_settings WHERE id = 1;
  IF NOT FOUND OR cfg.enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Trim once; NULL when blank/whitespace-only → nothing to enqueue.
  r1 := NULLIF(TRIM(cfg.recipient_1_email), '');
  r2 := NULLIF(TRIM(cfg.recipient_2_email), '');
  IF r1 IS NULL AND r2 IS NULL THEN
    RETURN NEW;
  END IF;

  IF r1 IS NOT NULL THEN
    INSERT INTO lead_notification_events (deal_id, account_id, recipient_email)
    VALUES (NEW.id, NEW.account_id, r1);
  END IF;

  -- Guard against the same address being used for both recipients
  -- (the UNIQUE (deal_id, recipient_email) constraint would
  -- otherwise reject the row and fail the parent deal INSERT).
  IF r2 IS NOT NULL AND r2 IS DISTINCT FROM r1 THEN
    INSERT INTO lead_notification_events (deal_id, account_id, recipient_email)
    VALUES (NEW.id, NEW.account_id, r2);
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION handle_new_deal_lead_notification() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_new_deal_lead_notification ON deals;
CREATE TRIGGER trg_new_deal_lead_notification
  AFTER INSERT ON deals
  FOR EACH ROW EXECUTE FUNCTION handle_new_deal_lead_notification();

-- ============================================================
-- 4. PLATFORM LEAD STATS RPC (super admin only, exact counts)
-- ============================================================
CREATE OR REPLACE FUNCTION get_platform_lead_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_start timestamptz := date_trunc('day', now());
  week_start  timestamptz := date_trunc('week', now());
  result jsonb;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'only super admins can read platform lead stats';
  END IF;

  SELECT jsonb_build_object(
    'total_leads',           (SELECT COUNT(*) FROM deals),
    'new_today',             (SELECT COUNT(*) FROM deals WHERE created_at >= today_start),
    'new_week',              (SELECT COUNT(*) FROM deals WHERE created_at >= week_start),
    'qualified',             (SELECT COUNT(*) FROM deals d
                                JOIN contacts c ON c.id = d.contact_id
                                WHERE d.status = 'open'
                                  AND c.lead_status IN ('qualified','proposal','negotiation')),
    'follow_up_required',    (SELECT COUNT(DISTINCT d.id) FROM deals d
                                JOIN follow_ups f ON f.contact_id = d.contact_id
                                WHERE d.status = 'open' AND f.status = 'pending'),
    'converted',             (SELECT COUNT(*) FROM deals WHERE status = 'won'),
    'lost',                  (SELECT COUNT(*) FROM deals WHERE status = 'lost'),
    'alert_sent',            (SELECT COUNT(*) FROM lead_notification_events WHERE status = 'sent'),
    'alert_pending',         (SELECT COUNT(*) FROM lead_notification_events WHERE status IN ('pending','sending')),
    'alert_failed',          (SELECT COUNT(*) FROM lead_notification_events WHERE status = 'failed')
  ) INTO result;

  RETURN result;
END;
$$;

ALTER FUNCTION get_platform_lead_stats() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_platform_lead_stats() TO authenticated, service_role;

-- ============================================================
-- 5. FOLLOW-UPS — grant super admin SELECT (RLS override)
--    (needed so the monitoring view can flag "follow-up required"
--    on deals across every customer account)
-- ============================================================
DROP POLICY IF EXISTS follow_ups_select_super_admin ON follow_ups;
CREATE POLICY follow_ups_select_super_admin
  ON follow_ups FOR SELECT
  USING (is_super_admin());

-- ============================================================
-- 6. REALTIME publication — Super Admin live monitoring
--    (deals + notification events; RLS filters rows per viewer,
--    super admins see all)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lead_notification_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lead_notification_events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE deals;
  END IF;
END $$;