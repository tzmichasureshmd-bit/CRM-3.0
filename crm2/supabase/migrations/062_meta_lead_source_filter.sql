-- ============================================================
-- 062_meta_lead_source_filter.sql
--
-- Extends the existing `filter_contacts` RPC to:
--   * make the new Lead Ads source columns filterable
--     (source, source_platform, source_page_name,
--      source_instagram_username, campaign_name, form_name)
--   * include source/campaign/meta_lead_id/search fields in the
--     free-text search so searching "TZ.Restaurants" or a
--     campaign name or a Meta Lead ID finds the right contact.
--
-- Adds a new `count_meta_leads` RPC that computes the lead-count
-- statistics (total contacts, Meta leads, new leads, Facebook leads,
-- Instagram leads, today/week/month) entirely server-side — never by
-- loading every contact into the browser.
--
-- SAFETY: replaces `filter_contacts` with a superset definition; the
-- RPC signature (and every existing caller) is unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION filter_contacts(
  p_account_id UUID,
  p_search TEXT DEFAULT NULL,
  p_groups JSONB DEFAULT '[]'::jsonb,
  p_tag_ids UUID[] DEFAULT '{}'::uuid[],
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0,
  p_order TEXT DEFAULT 'created_at',
  p_ascending BOOLEAN DEFAULT FALSE,
  p_imported_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (id UUID, total_count BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  colname TEXT;
  cond TEXT;
  grp JSONB;
  c JSONB;
  col TEXT;
  op TEXT;
  val TEXT;
  v2 TEXT;
  where_sql TEXT := '';
  search_clause TEXT := '';
  tag_clause TEXT := '';
  imported_clause TEXT := '';
  order_col TEXT;
  ord TEXT;
BEGIN
  IF p_imported_only THEN
    imported_clause := ' AND c.imported_at IS NOT NULL';
  END IF;
  IF p_search IS NOT NULL AND btrim(p_search) <> '' THEN
    -- Search Lead Ads source fields too, so a Page name, campaign name,
    -- ad/form name or Meta Lead ID finds its contact (#14).
    search_clause := format(
      ' AND (c.name ILIKE %L OR c.phone ILIKE %L OR c.email ILIKE %L'
      || ' OR c.country ILIKE %L OR c.location ILIKE %L OR c.category ILIKE %L'
      || ' OR c.address ILIKE %L OR c.website ILIKE %L OR c.company ILIKE %L'
      || ' OR c.source_page_name ILIKE %L OR c.source_instagram_username ILIKE %L'
      || ' OR c.campaign_name ILIKE %L OR c.ad_name ILIKE %L OR c.form_name ILIKE %L'
      || ' OR c.meta_lead_id ILIKE %L OR c.source ILIKE %L)',
      '%'||p_search||'%', '%'||p_search||'%', '%'||p_search||'%',
      '%'||p_search||'%', '%'||p_search||'%', '%'||p_search||'%',
      '%'||p_search||'%', '%'||p_search||'%', '%'||p_search||'%',
      '%'||p_search||'%', '%'||p_search||'%', '%'||p_search||'%',
      '%'||p_search||'%', '%'||p_search||'%', '%'||p_search||'%',
      '%'||p_search||'%'
    );
  END IF;

  IF COALESCE(array_length(p_tag_ids, 1), 0) > 0 THEN
    tag_clause := format(
      ' AND EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id'
      || ' AND ct.tag_id = ANY(%L::uuid[]))',
      p_tag_ids
    );
  END IF;

  IF jsonb_typeof(p_groups) = 'array' AND jsonb_array_length(p_groups) > 0 THEN
    FOR grp IN SELECT * FROM jsonb_array_elements(p_groups) LOOP
      IF jsonb_typeof(grp) <> 'array' OR jsonb_array_length(grp) = 0 THEN
        CONTINUE;
      END IF;
      where_sql := where_sql || ' AND (';
      FOR c IN SELECT * FROM jsonb_array_elements(grp) LOOP
        col := c->>'field';
        op := c->>'op';
        val := COALESCE(c->>'value', '');
        v2 := COALESCE(c->>'value2', val);
        colname := CASE col
          WHEN 'name' THEN 'c.name' WHEN 'company' THEN 'c.company'
          WHEN 'category' THEN 'c.category' WHEN 'country' THEN 'c.country'
          WHEN 'location' THEN 'c.location' WHEN 'address' THEN 'c.address'
          WHEN 'phone' THEN 'c.phone' WHEN 'email' THEN 'c.email'
          WHEN 'website' THEN 'c.website' WHEN 'rating' THEN 'c.rating'
          WHEN 'reviews' THEN 'c.review_count' WHEN 'lead_status' THEN 'c.lead_status'
          WHEN 'created_at' THEN 'c.created_at' WHEN 'updated_at' THEN 'c.updated_at'
          WHEN 'source' THEN 'c.source'
          WHEN 'source_platform' THEN 'c.source_platform'
          WHEN 'source_page' THEN 'c.source_page_name'
          WHEN 'source_instagram' THEN 'c.source_instagram_username'
          WHEN 'campaign' THEN 'c.campaign_name'
          WHEN 'form' THEN 'c.form_name'
          ELSE NULL END;
        IF colname IS NULL THEN CONTINUE; END IF;
        cond := CASE op
          WHEN 'is' THEN format('%s = %L', colname, val)
          WHEN 'is_not' THEN format('%s IS DISTINCT FROM %L', colname, val)
          WHEN 'contains' THEN format('%s ILIKE %L', colname, '%'||val||'%')
          WHEN 'not_contains' THEN format('%s NOT ILIKE %L', colname, '%'||val||'%')
          WHEN 'starts_with' THEN format('%s ILIKE %L', colname, val||'%')
          WHEN 'ends_with' THEN format('%s ILIKE %L', colname, '%'||val)
          WHEN 'is_empty' THEN format('(%s IS NULL OR %s = %L)', colname, colname, '')
          WHEN 'is_not_empty' THEN format('(%s IS NOT NULL AND %s <> %L)', colname, colname, '')
          WHEN 'eq' THEN format('%s = %L', colname, val)
          WHEN 'gt' THEN format('%s > %L', colname, val::numeric)
          WHEN 'lt' THEN format('%s < %L', colname, val::numeric)
          WHEN 'gte' THEN format('%s >= %L', colname, val::numeric)
          WHEN 'lte' THEN format('%s <= %L', colname, val::numeric)
          WHEN 'between' THEN format('(%s >= %L AND %s <= %L)', colname, val::numeric, colname, v2::numeric)
          WHEN 'today' THEN format('%s >= %L AND %s < %L', colname, (current_date)::text, colname, (current_date + 1)::text)
          WHEN 'yesterday' THEN format('%s >= %L AND %s < %L', colname, (current_date - 1)::text, colname, (current_date)::text)
          WHEN 'last7' THEN format('%s >= (NOW() - interval ''7 days'')', colname)
          WHEN 'last30' THEN format('%s >= (NOW() - interval ''30 days'')', colname)
          WHEN 'this_month' THEN format('%s >= date_trunc(''month'', NOW())', colname)
          WHEN 'before' THEN format('%s < %L', colname, val)
          WHEN 'after' THEN format('%s > %L', colname, val)
          WHEN 'custom' THEN format('(%s >= %L AND %s <= %L)', colname, val, colname, v2)
          ELSE NULL
        END;
        IF cond IS NOT NULL THEN
          where_sql := where_sql || CASE
            WHEN right(where_sql, 1) = '(' THEN cond
            ELSE ' OR ' || cond END;
        END IF;
      END LOOP;
      where_sql := where_sql || ')';
    END LOOP;
  END IF;

  order_col := CASE p_order
    WHEN 'name' THEN 'c.name' WHEN 'created_at' THEN 'c.created_at'
    WHEN 'updated_at' THEN 'c.updated_at' WHEN 'rating' THEN 'c.rating'
    WHEN 'review_count' THEN 'c.review_count' WHEN 'lead_status' THEN 'c.lead_status'
    WHEN 'location' THEN 'c.location' WHEN 'category' THEN 'c.category'
    ELSE 'c.created_at' END;
  ord := CASE WHEN p_ascending THEN 'ASC' ELSE 'DESC' END;

  RETURN QUERY EXECUTE format(
    'SELECT c.id, count(*) OVER() AS total_count
       FROM contacts c
      WHERE c.account_id = %L %s %s %s %s
      ORDER BY %s %s NULLS LAST, c.id DESC
      LIMIT %s OFFSET %s',
    p_account_id, search_clause, tag_clause, where_sql, imported_clause,
    order_col, ord, p_limit, p_offset
  );
END;
$$;

-- ------------------------------------------------------------------
-- Lead-count statistics (computed entirely server-side).
--
-- `meta_lead` is TRUE when the contact carries Meta Lead Ads source
-- attribution (source_platform in facebook/instagram). Meta leads are
-- counted ONCE per distinct meta_lead_id (the idempotency guarantee),
-- so replayed webhooks never inflate the numbers.
-- ------------------------------------------------------------------
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
    (SELECT count(DISTINCT meta_lead_id)::BIGINT FROM contacts
       WHERE account_id = p_account_id
         AND source_platform IN ('facebook','instagram')
         AND meta_lead_id IS NOT NULL) AS total_leads,
    (SELECT count(DISTINCT meta_lead_id)::BIGINT FROM contacts
       WHERE account_id = p_account_id
         AND source_platform IN ('facebook','instagram')
         AND meta_lead_id IS NOT NULL
         AND lead_status = 'new') AS new_leads,
    (SELECT count(DISTINCT meta_lead_id)::BIGINT FROM contacts
       WHERE account_id = p_account_id
         AND source_platform = 'facebook'
         AND meta_lead_id IS NOT NULL) AS facebook_leads,
    (SELECT count(DISTINCT meta_lead_id)::BIGINT FROM contacts
       WHERE account_id = p_account_id
         AND source_platform = 'instagram'
         AND meta_lead_id IS NOT NULL) AS instagram_leads,
    (SELECT count(DISTINCT meta_lead_id)::BIGINT FROM contacts
       WHERE account_id = p_account_id
         AND source_platform IN ('facebook','instagram')
         AND meta_lead_id IS NOT NULL
         AND created_at >= (current_date)::timestamptz) AS today_leads,
    (SELECT count(DISTINCT meta_lead_id)::BIGINT FROM contacts
       WHERE account_id = p_account_id
         AND source_platform IN ('facebook','instagram')
         AND meta_lead_id IS NOT NULL
         AND created_at >= date_trunc('week', NOW())) AS week_leads,
    (SELECT count(DISTINCT meta_lead_id)::BIGINT FROM contacts
       WHERE account_id = p_account_id
         AND source_platform IN ('facebook','instagram')
         AND meta_lead_id IS NOT NULL
         AND created_at >= date_trunc('month', NOW())) AS month_leads;
$$;

GRANT EXECUTE ON FUNCTION count_meta_leads(UUID) TO authenticated;
