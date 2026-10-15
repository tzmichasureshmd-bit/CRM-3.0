-- ============================================================
-- 065_include_google_form_in_lead_counts.sql
--
-- The dashboard / Social Media "Lead Overview" stat cards (Total
-- Leads, New Leads, Today, This Month) are fed by the count_meta_leads
-- RPC. That RPC (added in 062) only counted Meta lead-ads
-- (`source_platform IN ('facebook','instagram')`), so contacts that
-- arrive via the Google Forms integration (`source = 'google_form'`,
-- introduced in 064) never appeared in those totals even though they
-- appeared in the Contacts page and the Lead Sources card.
--
-- This migration keeps the same RPC (no new tables, no API change) but
-- widens the non-breakdown totals to also count `google_form` leads.
-- The facebook/instagram breakdowns and total_contacts are unchanged.
--
-- SAFETY: purely additive semantics change to a COUNT function; no
-- columns/tables/rows altered, RLS untouched, tenant isolation
-- preserved (every subquery still filters by p_account_id).
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
    (SELECT count(*)::BIGINT FROM contacts WHERE account_id = p_account_id) AS total_contacts,
    (SELECT count(DISTINCT c.id)::BIGINT FROM contacts c
       WHERE c.account_id = p_account_id
         AND ((c.source_platform IN ('facebook','instagram') AND c.meta_lead_id IS NOT NULL)
              OR c.source = 'google_form')) AS total_leads,
    (SELECT count(DISTINCT c.id)::BIGINT FROM contacts c
       WHERE c.account_id = p_account_id
         AND ((c.source_platform IN ('facebook','instagram') AND c.meta_lead_id IS NOT NULL)
              OR c.source = 'google_form')
         AND c.lead_status = 'new') AS new_leads,
    (SELECT count(DISTINCT meta_lead_id)::BIGINT FROM contacts
       WHERE account_id = p_account_id
         AND source_platform = 'facebook'
         AND meta_lead_id IS NOT NULL) AS facebook_leads,
    (SELECT count(DISTINCT meta_lead_id)::BIGINT FROM contacts
       WHERE account_id = p_account_id
         AND source_platform = 'instagram'
         AND meta_lead_id IS NOT NULL) AS instagram_leads,
    (SELECT count(DISTINCT c.id)::BIGINT FROM contacts c
       WHERE c.account_id = p_account_id
         AND ((c.source_platform IN ('facebook','instagram') AND c.meta_lead_id IS NOT NULL)
              OR c.source = 'google_form')
         AND c.created_at >= (current_date)::timestamptz) AS today_leads,
    (SELECT count(DISTINCT c.id)::BIGINT FROM contacts c
       WHERE c.account_id = p_account_id
         AND ((c.source_platform IN ('facebook','instagram') AND c.meta_lead_id IS NOT NULL)
              OR c.source = 'google_form')
         AND c.created_at >= date_trunc('week', NOW())) AS week_leads,
    (SELECT count(DISTINCT c.id)::BIGINT FROM contacts c
       WHERE c.account_id = p_account_id
         AND ((c.source_platform IN ('facebook','instagram') AND c.meta_lead_id IS NOT NULL)
              OR c.source = 'google_form')
         AND c.created_at >= date_trunc('month', NOW())) AS month_leads;
$$;

GRANT EXECUTE ON FUNCTION count_meta_leads(UUID) TO authenticated;