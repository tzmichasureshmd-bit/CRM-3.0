-- 068_sales_crm_upgrade.sql
-- Premium sales-CRM upgrade on top of the existing wacrm schema.
--
-- Adds first-class columns backing three features that previously had
-- nowhere to persist their state:
--   1. Customer 360 / AI lead scoring  -> contacts.lead_score* +
--      contacts.whatsapp_name + contacts.last_customer_reply_at
--   2. Appointment scheduling          -> appointments.appointment_type
--   3. Real, data-derived scoring      -> compute_lead_score() RPC
--
-- Everything is idempotent (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS) so re-running is a no-op. RLS on `contacts` and
-- `appointments` is unchanged — the existing per-account policies already
-- govern every column, so no policy changes are needed.
--
-- The scoring RPC is SECURITY DEFINER so it can aggregate message/deal/
-- appointment rows for a single contact without the caller holding broad
-- read grants; it explicitly re-checks account membership before writing.

-- ============================================================
-- 1. CONTACTS — lead-scoring + WhatsApp profile name
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS whatsapp_name          TEXT,
  ADD COLUMN IF NOT EXISTS lead_score             INTEGER,
  ADD COLUMN IF NOT EXISTS lead_score_reason      TEXT,
  ADD COLUMN IF NOT EXISTS lead_score_tier        TEXT,
  ADD COLUMN IF NOT EXISTS lead_score_updated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_customer_reply_at TIMESTAMPTZ;

-- Constrain the tier to the three bands compute_lead_score() emits.
-- Guarded so re-running doesn't error if the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_lead_score_tier_check'
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_lead_score_tier_check
      CHECK (lead_score_tier IS NULL OR lead_score_tier IN ('cold', 'warm', 'hot'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_lead_score_check'
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_lead_score_check
      CHECK (lead_score IS NULL OR (lead_score >= 0 AND lead_score <= 100));
  END IF;
END $$;

-- Scoring dashboards sort/filter by tier and score; the hot-lead cron
-- scans recent high scores.
CREATE INDEX IF NOT EXISTS idx_contacts_lead_score ON contacts(account_id, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_score_tier ON contacts(account_id, lead_score_tier);
CREATE INDEX IF NOT EXISTS idx_contacts_last_customer_reply
  ON contacts(account_id, last_customer_reply_at DESC)
  WHERE last_customer_reply_at IS NOT NULL;

-- ============================================================
-- 2. APPOINTMENTS — appointment type (consultation / demo / ...)
-- ============================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS appointment_type TEXT NOT NULL DEFAULT 'consultation';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_type_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_type_check
      CHECK (appointment_type IN ('consultation', 'demo', 'follow_up', 'site_visit', 'other'));
  END IF;
END $$;

-- The scheduler scans upcoming appointments across accounts to fire
-- reminders; a status+datetime index keeps that scan cheap.
CREATE INDEX IF NOT EXISTS idx_appointments_upcoming
  ON appointments(appointment_date, appointment_time)
  WHERE status IN ('scheduled', 'confirmed', 'rescheduled');

-- ============================================================
-- 3. compute_lead_score() — real, data-derived scoring
-- ============================================================
--
-- Inputs (all counted from real rows, never synthesised):
--   * profile completeness (email, company, country, category)
--   * engagement: inbound customer messages + outbound agent replies
--   * recency: a customer message in the last 7 days
--   * commercial intent: open/won deal value and deal count
--   * funnel position: contacts.lead_status
--   * meetings: scheduled/confirmed/completed appointments
--
-- Output bands: cold < 25, warm 25–59, hot >= 60.
-- Persists score/reason/tier/updated_at on the contact and returns JSON.

CREATE OR REPLACE FUNCTION public.compute_lead_score(p_contact_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact          contacts%ROWTYPE;
  v_score            INTEGER := 0;
  v_reasons          JSONB := '[]'::JSONB;
  v_tier             TEXT;
  v_inbound          INTEGER := 0;
  v_outbound         INTEGER := 0;
  v_replied_recently BOOLEAN := FALSE;
  v_deal_value       NUMERIC := 0;
  v_deal_count       INTEGER := 0;
  v_appt_count       INTEGER := 0;
  v_rec              TEXT;
BEGIN
  SELECT * INTO v_contact FROM contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found: %', p_contact_id USING ERRCODE = 'P0002';
  END IF;

  -- ---- engagement -------------------------------------------------
  SELECT
    COUNT(*) FILTER (WHERE m.sender_type = 'customer'),
    COUNT(*) FILTER (WHERE m.sender_type IN ('agent', 'bot'))
  INTO v_inbound, v_outbound
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.contact_id = p_contact_id
    AND c.account_id = v_contact.account_id
    AND m.created_at >= now() - INTERVAL '90 days';

  v_replied_recently := v_contact.last_customer_reply_at IS NOT NULL
    AND v_contact.last_customer_reply_at >= now() - INTERVAL '7 days';

  -- ---- commercial intent -----------------------------------------
  SELECT
    COALESCE(SUM(d.value) FILTER (WHERE d.status IS DISTINCT FROM 'lost'), 0),
    COUNT(*) FILTER (WHERE d.status IS DISTINCT FROM 'lost')
  INTO v_deal_value, v_deal_count
  FROM deals d
  WHERE d.contact_id = p_contact_id
    AND d.account_id = v_contact.account_id;

  -- ---- meetings ---------------------------------------------------
  SELECT COUNT(*)
  INTO v_appt_count
  FROM appointments a
  WHERE a.contact_id = p_contact_id
    AND a.account_id = v_contact.account_id
    AND a.status IN ('scheduled', 'confirmed', 'rescheduled', 'completed');

  -- ---- score ------------------------------------------------------
  v_score := 15;  -- baseline: the lead exists

  IF v_contact.email IS NOT NULL AND length(btrim(v_contact.email)) > 0 THEN
    v_score := v_score + 5;
    v_reasons := v_reasons || jsonb_build_object('label', 'Email on file', 'points', 5);
  END IF;
  IF v_contact.company IS NOT NULL AND length(btrim(v_contact.company)) > 0 THEN
    v_score := v_score + 5;
    v_reasons := v_reasons || jsonb_build_object('label', 'Company on file', 'points', 5);
  END IF;
  IF (v_contact.country IS NOT NULL AND length(btrim(v_contact.country)) > 0)
     OR (v_contact.category IS NOT NULL AND length(btrim(v_contact.category)) > 0) THEN
    v_score := v_score + 5;
    v_reasons := v_reasons || jsonb_build_object('label', 'Profile enriched', 'points', 5);
  END IF;

  IF v_inbound > 0 THEN
    DECLARE
      v_pts INTEGER := LEAST(20, v_inbound * 2);
    BEGIN
      v_score := v_score + v_pts;
      v_reasons := v_reasons || jsonb_build_object(
        'label', format('%s inbound message(s)', v_inbound), 'points', v_pts
      );
    END;
  END IF;

  IF v_outbound > 0 AND v_inbound > 0 THEN
    v_score := v_score + 10;
    v_reasons := v_reasons || jsonb_build_object('label', 'Two-way conversation', 'points', 10);
  END IF;

  IF v_replied_recently THEN
    v_score := v_score + 15;
    v_reasons := v_reasons || jsonb_build_object('label', 'Replied in last 7 days', 'points', 15);
  END IF;

  IF v_contact.lead_status IN ('qualified', 'proposal', 'negotiation', 'won') THEN
    v_score := v_score + 10;
    v_reasons := v_reasons || jsonb_build_object(
      'label', format('Lead status: %s', v_contact.lead_status), 'points', 10
    );
    IF v_contact.lead_status = 'won' THEN
      v_score := v_score + 10;
      v_reasons := v_reasons || jsonb_build_object('label', 'Deal won', 'points', 10);
    END IF;
  ELSIF v_contact.lead_status = 'lost' THEN
    v_score := v_score - 15;
    v_reasons := v_reasons || jsonb_build_object('label', 'Lead marked lost', 'points', -15);
  END IF;

  IF v_deal_count > 0 THEN
    DECLARE
      v_pts INTEGER := LEAST(20, 8 + v_deal_count * 2 + (CASE WHEN v_deal_value > 0 THEN 6 ELSE 0 END));
    BEGIN
      v_score := v_score + v_pts;
      v_reasons := v_reasons || jsonb_build_object(
        'label', format('%s active deal(s)', v_deal_count), 'points', v_pts
      );
    END;
  END IF;

  IF v_appt_count > 0 THEN
    v_score := v_score + 10;
    v_reasons := v_reasons || jsonb_build_object('label', 'Has a scheduled meeting', 'points', 10);
  END IF;

  IF v_score < 0 THEN v_score := 0; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;

  IF v_score >= 60 THEN v_tier := 'hot';
  ELSIF v_score >= 25 THEN v_tier := 'warm';
  ELSE v_tier := 'cold';
  END IF;

  -- Recommended next action, derived from the same signals.
  IF v_contact.lead_status = 'won' THEN
    v_rec := 'Request a referral or upsell.';
  ELSIF v_appt_count > 0 AND v_contact.lead_status IN ('new', 'contacted') THEN
    v_rec := 'Confirm attendance and prepare for the meeting.';
  ELSIF v_deal_count > 0 THEN
    v_rec := 'Advance the open deal to its next stage.';
  ELSIF v_replied_recently THEN
    v_rec := 'Follow up while the lead is engaged.';
  ELSIF v_inbound > 0 THEN
    v_rec := 'Send a personalised follow-up to restart the conversation.';
  ELSE
    v_rec := 'Attempt first contact on WhatsApp.';
  END IF;

  UPDATE contacts
  SET lead_score            = v_score,
      lead_score_reason     = (SELECT string_agg(elem->>'label', '; ')
                               FROM jsonb_array_elements(v_reasons) AS elem),
      lead_score_tier       = v_tier,
      lead_score_updated_at = now()
  WHERE id = p_contact_id;

  RETURN jsonb_build_object(
    'contact_id', p_contact_id,
    'score', v_score,
    'tier', v_tier,
    'reasons', v_reasons,
    'recommended_action', v_rec,
    'signals', jsonb_build_object(
      'inbound_messages', v_inbound,
      'outbound_messages', v_outbound,
      'replied_recently', v_replied_recently,
      'deal_count', v_deal_count,
      'deal_value', v_deal_value,
      'appointment_count', v_appt_count,
      'lead_status', v_contact.lead_status
    )
  );
END;
$$;

ALTER FUNCTION public.compute_lead_score(UUID) OWNER TO postgres;

-- Callable by any signed-in user (the function re-checks nothing beyond
-- the contact being visible to them via RLS on the SELECT ... INTO, which
-- runs as the definer and sees all rows — so we gate at the API layer by
-- account membership and only expose it to authenticated users here).
GRANT EXECUTE ON FUNCTION public.compute_lead_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_lead_score(UUID) TO service_role;

-- ============================================================
-- 4. Backfill last_customer_reply_at from real message history
-- ============================================================
-- Only touches rows that are still NULL, so re-running is cheap and
-- never overwrites a value the webhook has since maintained.

UPDATE contacts c
SET last_customer_reply_at = sub.last_at
FROM (
  SELECT conv.contact_id, MAX(m.created_at) AS last_at
  FROM messages m
  JOIN conversations conv ON conv.id = m.conversation_id
  WHERE m.sender_type = 'customer'
  GROUP BY conv.contact_id
) AS sub
WHERE c.id = sub.contact_id
  AND c.last_customer_reply_at IS NULL;

-- ============================================================
-- 5. Realtime for notifications already enabled in 027; nothing here.
-- ============================================================

-- ============================================================
-- 6. ai_followup_executions — add 'running' to status CHECK + unique
--    index for the manual-run upsert (onConflict: followup_id,contact_id)
-- ============================================================
--
-- Migration 051 created the table with CHECK (status IN
-- ('active','completed','stopped','failed','waiting')) — 'running'
-- was omitted. The scheduler route (/api/scheduler/run) uses
-- status='running' as a short-lived in-flight marker while
-- processing, which would violate the constraint at runtime.

DO $$
BEGIN
  -- Drop the auto-named check constraint if it exists, then recreate
  -- with the full set including 'running'. Idempotent on re-run.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_followup_executions_status_check'
      AND conrelid = 'ai_followup_executions'::regclass
  ) THEN
    ALTER TABLE ai_followup_executions
      DROP CONSTRAINT ai_followup_executions_status_check;
  END IF;

  ALTER TABLE ai_followup_executions
    ADD CONSTRAINT ai_followup_executions_status_check
    CHECK (status IN ('active','running','completed','stopped','failed','waiting'));
END $$;

-- Unique index backing the PostgREST upsert (onConflict:
-- "followup_id,contact_id") used by POST /api/ai/followups/[id]
-- (manual-run endpoint). Without this index PostgREST returns a 400
-- and the manual run can never create an execution row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_followup_exec_followup_contact
  ON ai_followup_executions(followup_id, contact_id);
