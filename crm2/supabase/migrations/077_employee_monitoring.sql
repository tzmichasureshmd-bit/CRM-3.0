-- ============================================================
-- 077_employee_monitoring.sql
--
-- Super Admin → Employee Monitoring.
--
-- Adds a single SECURITY DEFINER RPC that aggregates per-agent
-- lead stats from the existing deals / follow_ups / contacts /
-- member_presence tables. No new tables are created — all data
-- comes from the existing schema.
--
-- get_employee_lead_stats()
--   Returns one row per profile that has at least one deal
--   assigned to them, plus their presence / last-seen data.
--   Super admin only.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_employee_lead_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  today_start TIMESTAMPTZ := date_trunc('day', now());
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'only super admins can read employee lead stats';
  END IF;

  SELECT jsonb_agg(row_data ORDER BY row_data->>'full_name') INTO result
  FROM (
    SELECT jsonb_build_object(
      'user_id',          p.user_id,
      'full_name',        p.full_name,
      'email',            p.email,
      'account_role',     p.account_role,
      'avatar_url',       p.avatar_url,
      -- presence
      'presence_status',  mp.status,
      'last_seen_at',     mp.last_seen_at,
      -- lead counts
      'assigned_total',   COUNT(d.id) FILTER (WHERE d.assigned_to = p.user_id),
      'leads_new',        COUNT(d.id) FILTER (WHERE d.assigned_to = p.user_id AND c.lead_status = 'new'),
      'leads_contacted',  COUNT(d.id) FILTER (WHERE d.assigned_to = p.user_id AND c.lead_status IN ('contacted','qualified','proposal','negotiation')),
      'leads_converted',  COUNT(d.id) FILTER (WHERE d.assigned_to = p.user_id AND d.status = 'won'),
      'leads_lost',       COUNT(d.id) FILTER (WHERE d.assigned_to = p.user_id AND d.status = 'lost'),
      -- follow-ups
      'followups_due',    COUNT(DISTINCT fu.id) FILTER (
                            WHERE fu.user_id = p.user_id
                              AND fu.status = 'pending'
                          ),
      'followups_today',  COUNT(DISTINCT fu.id) FILTER (
                            WHERE fu.user_id = p.user_id
                              AND fu.status = 'pending'
                              AND fu.due_date >= today_start
                              AND fu.due_date < today_start + INTERVAL '1 day'
                          ),
      'followups_overdue', COUNT(DISTINCT fu.id) FILTER (
                            WHERE fu.user_id = p.user_id
                              AND fu.status = 'pending'
                              AND fu.due_date < now()
                          ),
      -- overdue leads (open deal, follow-up overdue)
      'leads_overdue',    COUNT(DISTINCT d.id) FILTER (
                            WHERE d.assigned_to = p.user_id
                              AND d.status = 'open'
                              AND EXISTS (
                                SELECT 1 FROM follow_ups fu2
                                WHERE fu2.contact_id = d.contact_id
                                  AND fu2.status = 'pending'
                                  AND fu2.due_date < now()
                              )
                          )
    ) AS row_data
    FROM profiles p
    LEFT JOIN member_presence mp ON mp.user_id = p.user_id
    LEFT JOIN deals d ON d.assigned_to = p.user_id
    LEFT JOIN contacts c ON c.id = d.contact_id
    LEFT JOIN follow_ups fu ON fu.user_id = p.user_id
    WHERE p.account_role IN ('owner', 'admin', 'agent')
      AND p.platform_role IS DISTINCT FROM 'super_admin'
    GROUP BY p.user_id, p.full_name, p.email, p.account_role, p.avatar_url,
             mp.status, mp.last_seen_at
  ) sub;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

ALTER FUNCTION public.get_employee_lead_stats() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_employee_lead_stats() TO authenticated, service_role;
