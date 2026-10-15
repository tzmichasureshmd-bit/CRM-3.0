-- ============================================================
-- 075_fix_lead_counts_all_sources.sql
--
-- Fixes count_meta_leads to count ALL sourced contacts
-- (any contact with source_platform OR source set),
-- not just Meta Lead Ads contacts with meta_lead_id.
--
-- This makes the Dashboard "Lead Overview" and Contacts page
-- stat cards reflect real data for Google Form, WhatsApp,
-- Telegram, Website, Manual, and Meta leads.
-- ============================================================

CREATE OR REPLACE FUNCTION count_meta_leads(
  p_account_id UUID
)
RETURNS TABLE (
  total_contacts  BIGINT,
  total_leads     BIGINT,
  new_leads       BIGINT,
  facebook_leads  BIGINT,
  instagram_leads BIGINT,
  today_leads     BIGINT,
  week_leads      BIGINT,
  month_leads     BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    -- Total contacts (all)
    (SELECT count(*)::BIGINT
       FROM contacts
      WHERE account_id = p_account_id
    ) AS total_contacts,

    -- Total leads = any contact with a source or source_platform
    (SELECT count(*)::BIGINT
       FROM contacts
      WHERE account_id = p_account_id
        AND (
          source_platform IS NOT NULL
          OR (source IS NOT NULL AND source <> '')
        )
    ) AS total_leads,

    -- New leads = lead_status = 'new' with any source
    (SELECT count(*)::BIGINT
       FROM contacts
      WHERE account_id = p_account_id
        AND lead_status = 'new'
        AND (
          source_platform IS NOT NULL
          OR (source IS NOT NULL AND source <> '')
        )
    ) AS new_leads,

    -- Facebook leads
    (SELECT count(*)::BIGINT
       FROM contacts
      WHERE account_id = p_account_id
        AND (
          source_platform = 'facebook'
          OR source ILIKE '%facebook%'
        )
    ) AS facebook_leads,

    -- Instagram leads
    (SELECT count(*)::BIGINT
       FROM contacts
      WHERE account_id = p_account_id
        AND (
          source_platform = 'instagram'
          OR source ILIKE '%instagram%'
        )
    ) AS instagram_leads,

    -- Today leads
    (SELECT count(*)::BIGINT
       FROM contacts
      WHERE account_id = p_account_id
        AND (
          source_platform IS NOT NULL
          OR (source IS NOT NULL AND source <> '')
        )
        AND created_at >= (current_date)::timestamptz
    ) AS today_leads,

    -- This week leads
    (SELECT count(*)::BIGINT
       FROM contacts
      WHERE account_id = p_account_id
        AND (
          source_platform IS NOT NULL
          OR (source IS NOT NULL AND source <> '')
        )
        AND created_at >= date_trunc('week', NOW())
    ) AS week_leads,

    -- This month leads
    (SELECT count(*)::BIGINT
       FROM contacts
      WHERE account_id = p_account_id
        AND (
          source_platform IS NOT NULL
          OR (source IS NOT NULL AND source <> '')
        )
        AND created_at >= date_trunc('month', NOW())
    ) AS month_leads;
$$;

GRANT EXECUTE ON FUNCTION count_meta_leads(UUID) TO authenticated;
