-- ============================================================
-- TZMICHA CRM 3.0 — Database Migration 001
-- Run AFTER all CRM 2.0 migrations on the NEW Supabase project
-- New tables only — reuses all existing CRM 2.0 tables
-- ============================================================

-- ── Content Studio ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_content (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id),
  campaign_id         uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  title               text NOT NULL,
  caption             text NOT NULL DEFAULT '',
  cta                 text,
  hashtags            text[] NOT NULL DEFAULT '{}',
  platform            text NOT NULL CHECK (platform IN ('instagram','facebook','whatsapp','telegram','email')),
  content_type        text NOT NULL DEFAULT 'text' CHECK (content_type IN ('image','video','carousel','text','reel','story','document')),
  media_urls          text[] NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ai_generated','in_review','approved','scheduled','published','failed')),
  scheduled_at        timestamptz,
  published_at        timestamptz,
  failure_reason      text,
  ai_generated        boolean NOT NULL DEFAULT false,
  reach               integer,
  impressions         integer,
  engagement          integer,
  clicks              integer,
  messages_generated  integer,
  leads_generated     integer,
  qualified_leads     integer,
  deals_attributed    integer,
  revenue_attributed  numeric(12,2),
  currency            text DEFAULT 'USD',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_content_account_idx  ON crm3_content(account_id);
CREATE INDEX IF NOT EXISTS crm3_content_status_idx   ON crm3_content(account_id, status);
CREATE INDEX IF NOT EXISTS crm3_content_platform_idx ON crm3_content(account_id, platform);

ALTER TABLE crm3_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_content_rls ON crm3_content;
CREATE POLICY crm3_content_rls ON crm3_content
  USING (account_id = get_my_account_id());

-- ── Attribution Chain ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_attribution (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  content_id              uuid REFERENCES crm3_content(id) ON DELETE SET NULL,
  campaign_id             uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  conversation_id         uuid REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id              uuid REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id                 uuid REFERENCES deals(id) ON DELETE SET NULL,
  lead_created_at         timestamptz,
  deal_value              numeric(12,2),
  revenue_amount          numeric(12,2),
  currency                text DEFAULT 'USD',
  attribution_confidence  text NOT NULL DEFAULT 'low' CHECK (attribution_confidence IN ('high','medium','low','unknown')),
  attribution_method      text NOT NULL DEFAULT 'inferred' CHECK (attribution_method IN ('direct','last_touch','first_touch','inferred')),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_attribution_account_idx ON crm3_attribution(account_id);
CREATE INDEX IF NOT EXISTS crm3_attribution_contact_idx ON crm3_attribution(contact_id);
CREATE INDEX IF NOT EXISTS crm3_attribution_deal_idx    ON crm3_attribution(deal_id);

ALTER TABLE crm3_attribution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_attribution_rls ON crm3_attribution;
CREATE POLICY crm3_attribution_rls ON crm3_attribution
  USING (account_id = get_my_account_id());

-- ── Customer Journey Events ───────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_journey_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id        uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  stage             text NOT NULL CHECK (stage IN ('discovery','engagement','conversation','qualification','sales','conversion','retention','expansion')),
  event_type        text NOT NULL,
  event_description text NOT NULL,
  source_type       text NOT NULL CHECK (source_type IN ('content','campaign','conversation','deal','automation','manual')),
  source_id         uuid,
  metadata          jsonb DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_journey_contact_idx ON crm3_journey_events(contact_id);
CREATE INDEX IF NOT EXISTS crm3_journey_account_idx ON crm3_journey_events(account_id);

ALTER TABLE crm3_journey_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_journey_rls ON crm3_journey_events;
CREATE POLICY crm3_journey_rls ON crm3_journey_events
  USING (account_id = get_my_account_id());

-- ── AI Agents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_ai_agents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                text NOT NULL,
  type                text NOT NULL CHECK (type IN ('lead_qualification','sales_assistant','followup','customer_support','content','campaign','reporting','knowledge')),
  description         text,
  status              text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','paused','error')),
  instructions        text NOT NULL DEFAULT '',
  allowed_tools       text[] NOT NULL DEFAULT '{}',
  requires_approval   boolean NOT NULL DEFAULT true,
  max_actions_per_run integer NOT NULL DEFAULT 10,
  execution_count     integer NOT NULL DEFAULT 0,
  last_run_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_agents_account_idx ON crm3_ai_agents(account_id);

ALTER TABLE crm3_ai_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_agents_rls ON crm3_ai_agents;
CREATE POLICY crm3_agents_rls ON crm3_ai_agents
  USING (account_id = get_my_account_id());

-- ── AI Agent Runs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_ai_agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES crm3_ai_agents(id) ON DELETE CASCADE,
  triggered_by    text NOT NULL,
  status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','awaiting_approval')),
  actions_taken   jsonb NOT NULL DEFAULT '[]',
  result_summary  text,
  error_message   text,
  tokens_used     integer NOT NULL DEFAULT 0,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS crm3_agent_runs_agent_idx   ON crm3_ai_agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS crm3_agent_runs_account_idx ON crm3_ai_agent_runs(account_id);

ALTER TABLE crm3_ai_agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_agent_runs_rls ON crm3_ai_agent_runs;
CREATE POLICY crm3_agent_runs_rls ON crm3_ai_agent_runs
  USING (account_id = get_my_account_id());

-- ── Next Best Actions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_next_best_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  object_type   text NOT NULL CHECK (object_type IN ('lead','deal','customer','campaign','content','conversation')),
  object_id     uuid NOT NULL,
  action        text NOT NULL,
  reason        text NOT NULL,
  urgency       text NOT NULL DEFAULT 'low' CHECK (urgency IN ('immediate','today','this_week','low')),
  confidence    text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low','unknown')),
  expires_at    timestamptz,
  acted_on_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_nba_account_idx ON crm3_next_best_actions(account_id);
CREATE INDEX IF NOT EXISTS crm3_nba_object_idx  ON crm3_next_best_actions(object_type, object_id);

ALTER TABLE crm3_next_best_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_nba_rls ON crm3_next_best_actions;
CREATE POLICY crm3_nba_rls ON crm3_next_best_actions
  USING (account_id = get_my_account_id());

-- ── AI Operations Log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_ai_operations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id),
  operation_type  text NOT NULL,
  provider        text NOT NULL,
  model           text NOT NULL,
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  latency_ms      integer NOT NULL DEFAULT 0,
  success         boolean NOT NULL DEFAULT true,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_ai_ops_account_idx ON crm3_ai_operations(account_id);
CREATE INDEX IF NOT EXISTS crm3_ai_ops_created_idx ON crm3_ai_operations(created_at DESC);

ALTER TABLE crm3_ai_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_ai_ops_rls ON crm3_ai_operations;
CREATE POLICY crm3_ai_ops_rls ON crm3_ai_operations
  USING (account_id = get_my_account_id());

-- ── Segments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm3_segments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  type              text NOT NULL DEFAULT 'manual' CHECK (type IN ('manual','rule_based','ai_assisted')),
  rules             jsonb DEFAULT '[]',
  ai_criteria       text,
  contact_count     integer NOT NULL DEFAULT 0,
  last_computed_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm3_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_segments_rls ON crm3_segments;
CREATE POLICY crm3_segments_rls ON crm3_segments
  USING (account_id = get_my_account_id());

-- ── Enable Realtime ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_content'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_content;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_journey_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_journey_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_next_best_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_next_best_actions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_ai_agent_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_ai_agent_runs;
  END IF;
END $$;
