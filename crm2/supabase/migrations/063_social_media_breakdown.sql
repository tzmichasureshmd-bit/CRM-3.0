-- ============================================================
-- 063_social_media_breakdown.sql
--
-- Efficient, server-side aggregation for the Social Media page
-- and the Dashboard "Lead Overview" + "Recent Leads" sections.
--
-- All lead counts are computed with grouped SQL over the EXISTING
-- `contacts` table (count(DISTINCT meta_lead_id) per group), so
-- they respect the meta_lead_id idempotency guarantee and NEVER
-- load every contact into the browser.
--
-- SAFETY: additive — introduces one STABLE function only. RLS still
-- applies (security invoker over `contacts`), so a caller can only
-- ever see their own account's rows; the account id is passed from
-- the trusted server auth context, never from the frontend.
-- ============================================================

CREATE OR REPLACE FUNCTION get_social_media_overview(p_account_id UUID)
RETURNS TABLE (
  platform                TEXT,
  source_page_name        TEXT,
  source_instagram_username TEXT,
  lead_count              BIGINT,
  new_count               BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE WHEN source_platform = 'facebook' THEN 'facebook' ELSE 'instagram' END AS platform,
    NULLIF(source_page_name, '')            AS source_page_name,
    NULLIF(source_instagram_username, '')   AS source_instagram_username,
    count(DISTINCT meta_lead_id)::BIGINT    AS lead_count,
    count(DISTINCT meta_lead_id) FILTER (WHERE lead_status = 'new')::BIGINT AS new_count
  FROM contacts
  WHERE account_id = p_account_id
    AND source_platform IN ('facebook','instagram')
    AND meta_lead_id IS NOT NULL
  GROUP BY 1, 2, 3
  ORDER BY lead_count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_social_media_overview(UUID) TO authenticated;
