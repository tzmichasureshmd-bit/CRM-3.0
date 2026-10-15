-- ============================================================
-- TZMICHA CRM 3.0 — ONE-SHOT MASTER MIGRATION
-- Run this ONCE in Supabase SQL Editor
-- Contains ALL 9 migrations combined
-- Fully idempotent — safe to run multiple times
-- ============================================================

-- ============================================================
-- STEP 1: Create helper function FIRST (before BEGIN transaction)
-- This must exist before any RLS policies are created
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_account_id() TO authenticated;

-- ============================================================
-- STEP 2: Now begin the main transaction
-- ============================================================

BEGIN;

-- ============================================================
-- MIGRATION: 001_crm3_foundation.sql
-- ============================================================

-- ============================================================
-- TZMICHA CRM 3.0 â€” Database Migration 001
-- Run AFTER all CRM 2.0 migrations on the NEW Supabase project
-- New tables only â€” reuses all existing CRM 2.0 tables
-- ============================================================

-- â”€â”€ Content Studio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Attribution Chain â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Customer Journey Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ AI Agents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ AI Agent Runs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Next Best Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ AI Operations Log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Segments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Enable Realtime â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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



-- ============================================================
-- MIGRATION: 002_conversation_ai_columns.sql
-- ============================================================

-- ============================================================
-- CRM 3.0 Migration 002 â€” Conversation AI Intelligence Columns
-- Extends existing conversations table with AI fields.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- Add AI intelligence columns to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_intent          TEXT,
  ADD COLUMN IF NOT EXISTS ai_sentiment       TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary         TEXT,
  ADD COLUMN IF NOT EXISTS ai_lead_score      INTEGER,
  ADD COLUMN IF NOT EXISTS ai_next_action     TEXT,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform           TEXT,
  ADD COLUMN IF NOT EXISTS priority           TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent'));

-- Index for AI-filtered queries
CREATE INDEX IF NOT EXISTS idx_conversations_ai_intent
  ON conversations(account_id, ai_intent)
  WHERE ai_intent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_platform
  ON conversations(account_id, platform);

CREATE INDEX IF NOT EXISTS idx_conversations_priority
  ON conversations(account_id, priority);

-- Ensure realtime is enabled for conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;



-- ============================================================
-- MIGRATION: 003_smart_automation_ai.sql
-- ============================================================

-- ============================================================
-- CRM 3.0 Migration 003 â€” Smart Automation AI Extensions
-- Extends existing CRM 2.0 automation tables with AI intelligence.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Does NOT duplicate existing automation tables.
-- ============================================================

-- â”€â”€ Extend automations table with CRM 3.0 fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS account_id       UUID REFERENCES accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','archived','error')),
  ADD COLUMN IF NOT EXISTS ai_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_model         TEXT,
  ADD COLUMN IF NOT EXISTS last_error       TEXT,
  ADD COLUMN IF NOT EXISTS last_run_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS success_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count    INTEGER NOT NULL DEFAULT 0;

-- Index for CRM 3.0 account-scoped queries
CREATE INDEX IF NOT EXISTS idx_automations_account_id
  ON automations(account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automations_account_status
  ON automations(account_id, status)
  WHERE account_id IS NOT NULL;

-- â”€â”€ CRM 3.0 AI Automation Nodes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Stores AI-specific node configurations for automation flows.
-- Extends automation_steps with AI decision capabilities.
CREATE TABLE IF NOT EXISTS crm3_automation_ai_nodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  step_id         UUID REFERENCES automation_steps(id) ON DELETE CASCADE,
  node_type       TEXT NOT NULL CHECK (node_type IN (
    'ai_score_condition',
    'ai_intent_condition',
    'ai_sentiment_condition',
    'ai_analyze_lead',
    'ai_generate_reply',
    'ai_qualify_lead',
    'ai_next_best_action',
    'ai_summarize_conversation'
  )),
  config          JSONB NOT NULL DEFAULT '{}',
  -- config examples:
  -- ai_score_condition:    { "operator": "gt", "threshold": 80 }
  -- ai_intent_condition:   { "intent": "High Buying Intent" }
  -- ai_sentiment_condition:{ "sentiment": "Negative" }
  -- ai_analyze_lead:       { "persist": true }
  -- ai_generate_reply:     { "action": "professional", "auto_send": false }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm3_ai_nodes_automation
  ON crm3_automation_ai_nodes(automation_id);
CREATE INDEX IF NOT EXISTS idx_crm3_ai_nodes_account
  ON crm3_automation_ai_nodes(account_id);

ALTER TABLE crm3_automation_ai_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm3_ai_nodes_rls ON crm3_automation_ai_nodes;
CREATE POLICY crm3_ai_nodes_rls ON crm3_automation_ai_nodes
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

-- â”€â”€ CRM 3.0 Automation Execution Tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Enhanced execution records for CRM 3.0 automations.
CREATE TABLE IF NOT EXISTS crm3_automation_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  trigger_type    TEXT NOT NULL,
  trigger_data    JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','waiting','completed','failed','cancelled')),
  current_step    INTEGER NOT NULL DEFAULT 0,
  total_steps     INTEGER NOT NULL DEFAULT 0,
  steps_log       JSONB NOT NULL DEFAULT '[]',
  -- Each step log entry: { step_type, status, detail, duration_ms, executed_at }
  ai_results      JSONB NOT NULL DEFAULT '{}',
  -- AI results: { intent, sentiment, score, nba, summary }
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  wait_until      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm3_exec_account
  ON crm3_automation_executions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm3_exec_automation
  ON crm3_automation_executions(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm3_exec_status
  ON crm3_automation_executions(account_id, status)
  WHERE status IN ('pending','running','waiting');
CREATE INDEX IF NOT EXISTS idx_crm3_exec_contact
  ON crm3_automation_executions(contact_id)
  WHERE contact_id IS NOT NULL;

ALTER TABLE crm3_automation_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm3_exec_rls ON crm3_automation_executions;
CREATE POLICY crm3_exec_rls ON crm3_automation_executions
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

-- â”€â”€ CRM 3.0 Automation Templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Pre-built AI-enhanced automation templates.
CREATE TABLE IF NOT EXISTS crm3_automation_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('lead_nurture','sales','support','onboarding','retention','ai_powered','general')),
  trigger_type    TEXT NOT NULL,
  trigger_config  JSONB NOT NULL DEFAULT '{}',
  steps           JSONB NOT NULL DEFAULT '[]',
  ai_nodes        JSONB NOT NULL DEFAULT '[]',
  is_builtin      BOOLEAN NOT NULL DEFAULT true,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  usage_count     INTEGER NOT NULL DEFAULT 0,
  preview_image   TEXT,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed built-in AI automation templates
INSERT INTO crm3_automation_templates (name, description, category, trigger_type, trigger_config, steps, ai_nodes, tags)
VALUES
  (
    'Hot Lead Instant Follow-up',
    'When AI detects high buying intent, immediately create a follow-up and notify the team.',
    'ai_powered',
    'new_message_received',
    '{}',
    '[{"step_type":"ai_analyze_lead","position":0},{"step_type":"condition","position":1,"config":{"subject":"ai_score","operator":"gt","threshold":70}},{"step_type":"create_follow_up","position":2,"branch":"yes"},{"step_type":"send_notification","position":3,"branch":"yes"}]',
    '[{"node_type":"ai_score_condition","config":{"operator":"gt","threshold":70}}]',
    ARRAY['ai','lead','follow-up','hot-lead']
  ),
  (
    'Negative Sentiment Escalation',
    'When AI detects negative sentiment, escalate to support team immediately.',
    'support',
    'new_message_received',
    '{}',
    '[{"step_type":"ai_analyze_sentiment","position":0},{"step_type":"condition","position":1,"config":{"subject":"ai_sentiment","value":"Negative"}},{"step_type":"assign_conversation","position":2,"branch":"yes"},{"step_type":"send_notification","position":3,"branch":"yes"}]',
    '[{"node_type":"ai_sentiment_condition","config":{"sentiment":"Negative"}}]',
    ARRAY['ai','sentiment','support','escalation']
  ),
  (
    'Pricing Inquiry Auto-Qualify',
    'When customer asks about pricing, run AI qualification and create a deal.',
    'ai_powered',
    'new_message_received',
    '{}',
    '[{"step_type":"ai_analyze_intent","position":0},{"step_type":"condition","position":1,"config":{"subject":"ai_intent","value":"Pricing Inquiry"}},{"step_type":"ai_qualify_lead","position":2,"branch":"yes"},{"step_type":"create_deal","position":3,"branch":"yes"}]',
    '[{"node_type":"ai_intent_condition","config":{"intent":"Pricing Inquiry"}}]',
    ARRAY['ai','pricing','qualify','deal']
  ),
  (
    'New Lead Welcome Sequence',
    'When a new contact is created, send a welcome message and start nurturing.',
    'lead_nurture',
    'new_contact_created',
    '{}',
    '[{"step_type":"wait","position":0,"config":{"amount":5,"unit":"minutes"}},{"step_type":"send_message","position":1,"config":{"text":"Hi {{contact.name}}! Welcome. How can we help you today?"}},{"step_type":"wait","position":2,"config":{"amount":24,"unit":"hours"}},{"step_type":"send_message","position":3,"config":{"text":"Just checking in â€” any questions we can answer for you?"}}]',
    '[]',
    ARRAY['welcome','nurture','new-lead']
  ),
  (
    'Deal Won Celebration',
    'When a deal is won, update contact status and send a thank you message.',
    'sales',
    'deal_stage_changed',
    '{"stage":"won"}',
    '[{"step_type":"update_contact_field","position":0,"config":{"field":"lead_status","value":"won"}},{"step_type":"send_message","position":1,"config":{"text":"Thank you for choosing us! We are excited to work with you."}}]',
    '[]',
    ARRAY['deal','won','sales']
  )
ON CONFLICT DO NOTHING;

-- â”€â”€ Realtime for execution tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_automation_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_automation_executions;
  END IF;
END $$;



-- ============================================================
-- MIGRATION: 004_ai_agents_full.sql
-- ============================================================

-- ============================================================
-- CRM 3.0 Migration 004 â€” AI Agents Full Framework
-- Extends crm3_ai_agents + crm3_ai_agent_runs (created in 001)
-- Adds: execution steps, approvals, audit log, tool registry
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================================

-- â”€â”€ Extend crm3_ai_agents with missing columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE crm3_ai_agents
  ADD COLUMN IF NOT EXISTS enabled          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS model            TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS provider         TEXT NOT NULL DEFAULT 'openai'
    CHECK (provider IN ('openai','anthropic','rule_based')),
  ADD COLUMN IF NOT EXISTS temperature      NUMERIC(3,2) NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS success_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS config           JSONB NOT NULL DEFAULT '{}';

-- â”€â”€ Extend crm3_ai_agent_runs with missing columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE crm3_ai_agent_runs
  ADD COLUMN IF NOT EXISTS input_context    JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_ms      INTEGER;

-- â”€â”€ Agent Execution Steps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS crm3_agent_execution_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES crm3_ai_agent_runs(id) ON DELETE CASCADE,
  step_number     INTEGER NOT NULL,
  tool_name       TEXT NOT NULL,
  tool_input      JSONB NOT NULL DEFAULT '{}',
  tool_output     JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','skipped','awaiting_approval')),
  error_message   TEXT,
  duration_ms     INTEGER,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON crm3_agent_execution_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_steps_account ON crm3_agent_execution_steps(account_id);

ALTER TABLE crm3_agent_execution_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_steps_rls ON crm3_agent_execution_steps;
CREATE POLICY agent_steps_rls ON crm3_agent_execution_steps
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- â”€â”€ Agent Approvals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS crm3_agent_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES crm3_ai_agent_runs(id) ON DELETE CASCADE,
  step_id         UUID REFERENCES crm3_agent_execution_steps(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES crm3_ai_agents(id) ON DELETE CASCADE,
  tool_name       TEXT NOT NULL,
  tool_input      JSONB NOT NULL DEFAULT '{}',
  proposed_action TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_account ON crm3_agent_approvals(account_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_run ON crm3_agent_approvals(run_id);

ALTER TABLE crm3_agent_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_approvals_rls ON crm3_agent_approvals;
CREATE POLICY agent_approvals_rls ON crm3_agent_approvals
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- â”€â”€ Agent Audit Log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS crm3_agent_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES crm3_ai_agents(id) ON DELETE SET NULL,
  run_id          UUID REFERENCES crm3_ai_agent_runs(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id),
  event_type      TEXT NOT NULL,
  -- event_type: agent_created, agent_updated, agent_enabled, agent_disabled,
  --             agent_deleted, run_started, run_completed, run_failed,
  --             tool_executed, tool_failed, approval_requested,
  --             approval_approved, approval_rejected
  event_data      JSONB NOT NULL DEFAULT '{}',
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_account ON crm3_agent_audit_log(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_agent ON crm3_agent_audit_log(agent_id, created_at DESC);

ALTER TABLE crm3_agent_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_audit_rls ON crm3_agent_audit_log;
CREATE POLICY agent_audit_rls ON crm3_agent_audit_log
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- â”€â”€ Indexes for performance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE INDEX IF NOT EXISTS idx_crm3_agents_enabled ON crm3_ai_agents(account_id, enabled);
CREATE INDEX IF NOT EXISTS idx_crm3_agent_runs_status ON crm3_ai_agent_runs(account_id, status);
CREATE INDEX IF NOT EXISTS idx_crm3_agent_runs_contact ON crm3_ai_agent_runs(contact_id) WHERE contact_id IS NOT NULL;

-- â”€â”€ Realtime â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_agent_approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_agent_approvals;
  END IF;
END $$;



-- ============================================================
-- MIGRATION: 005_attribution_enhancements.sql
-- ============================================================

-- ============================================================
-- CRM 3.0 Migration 005 â€” P7 Attribution Enhancements
-- Adds source/channel tracking, campaign linkage, and indexes.
-- crm3_attribution already exists from migration 001.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- â”€â”€ Extend crm3_attribution with source/channel tracking â”€â”€â”€â”€â”€
ALTER TABLE crm3_attribution
  ADD COLUMN IF NOT EXISTS source          TEXT,
  ADD COLUMN IF NOT EXISTS channel         TEXT,
  ADD COLUMN IF NOT EXISTS utm_source      TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium      TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign    TEXT,
  ADD COLUMN IF NOT EXISTS qualified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_won_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_won          BOOLEAN NOT NULL DEFAULT false;

-- â”€â”€ Additional indexes for attribution queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE INDEX IF NOT EXISTS crm3_attribution_content_idx
  ON crm3_attribution(content_id)
  WHERE content_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm3_attribution_campaign_idx
  ON crm3_attribution(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm3_attribution_created_idx
  ON crm3_attribution(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm3_attribution_source_idx
  ON crm3_attribution(account_id, source)
  WHERE source IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm3_attribution_won_idx
  ON crm3_attribution(account_id, is_won)
  WHERE is_won = true;

-- â”€â”€ Extend crm3_content with campaign_source tracking â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE crm3_content
  ADD COLUMN IF NOT EXISTS source          TEXT,
  ADD COLUMN IF NOT EXISTS channel         TEXT,
  ADD COLUMN IF NOT EXISTS views           INTEGER,
  ADD COLUMN IF NOT EXISTS shares          INTEGER;

-- â”€â”€ Index for content performance queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE INDEX IF NOT EXISTS crm3_content_published_idx
  ON crm3_content(account_id, published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS crm3_content_campaign_idx
  ON crm3_content(campaign_id)
  WHERE campaign_id IS NOT NULL;



-- ============================================================
-- MIGRATION: 006_journey_builder.sql
-- ============================================================

-- ============================================================
-- CRM 3.0 Migration 006 â€” Customer Journey Builder
-- crm3_journey_events already exists from migration 001.
-- This adds: journey definitions, executions, contact state.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================

-- â”€â”€ Journey Definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Stores the journey template: nodes, edges, trigger, config.
CREATE TABLE IF NOT EXISTS crm3_journeys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES auth.users(id),
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','archived')),
  trigger_type    TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN (
      'manual','contact_created','lead_created','conversation_started',
      'message_received','deal_created','deal_stage_changed',
      'deal_won','appointment_created','customer_inactive',
      'ai_score_threshold','intent_detected','content_interaction'
    )),
  trigger_config  JSONB NOT NULL DEFAULT '{}',
  nodes           JSONB NOT NULL DEFAULT '[]',
  -- Each node: { id, type, position:{x,y}, data:{label,config} }
  -- node types: trigger, condition, ai_decision, action, wait, stage, end
  edges           JSONB NOT NULL DEFAULT '[]',
  -- Each edge: { id, source, target, label? }
  entry_count     INTEGER NOT NULL DEFAULT 0,
  active_count    INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  conversion_rate NUMERIC(5,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_journeys_account_idx ON crm3_journeys(account_id);
CREATE INDEX IF NOT EXISTS crm3_journeys_status_idx  ON crm3_journeys(account_id, status);

ALTER TABLE crm3_journeys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_journeys_rls ON crm3_journeys;
CREATE POLICY crm3_journeys_rls ON crm3_journeys
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- â”€â”€ Journey Contact State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Tracks where each contact is in a journey.
CREATE TABLE IF NOT EXISTS crm3_journey_contact_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  journey_id      UUID NOT NULL REFERENCES crm3_journeys(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  current_node_id TEXT,
  current_stage   TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','waiting','completed','failed','exited')),
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  wait_until      TIMESTAMPTZ,
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  UNIQUE(journey_id, contact_id)
);

CREATE INDEX IF NOT EXISTS crm3_jcs_journey_idx  ON crm3_journey_contact_state(journey_id, status);
CREATE INDEX IF NOT EXISTS crm3_jcs_contact_idx  ON crm3_journey_contact_state(contact_id);
CREATE INDEX IF NOT EXISTS crm3_jcs_account_idx  ON crm3_journey_contact_state(account_id);
CREATE INDEX IF NOT EXISTS crm3_jcs_waiting_idx  ON crm3_journey_contact_state(wait_until)
  WHERE status = 'waiting';

ALTER TABLE crm3_journey_contact_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_jcs_rls ON crm3_journey_contact_state;
CREATE POLICY crm3_jcs_rls ON crm3_journey_contact_state
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- â”€â”€ Journey Executions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Full execution log per contact per journey run.
CREATE TABLE IF NOT EXISTS crm3_journey_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  journey_id      UUID NOT NULL REFERENCES crm3_journeys(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  triggered_by    TEXT NOT NULL DEFAULT 'manual',
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed','waiting','cancelled')),
  nodes_executed  JSONB NOT NULL DEFAULT '[]',
  -- Each entry: { node_id, node_type, status, result, duration_ms, executed_at }
  current_node_id TEXT,
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER
);

CREATE INDEX IF NOT EXISTS crm3_je_journey_idx  ON crm3_journey_executions(journey_id, started_at DESC);
CREATE INDEX IF NOT EXISTS crm3_je_account_idx  ON crm3_journey_executions(account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS crm3_je_contact_idx  ON crm3_journey_executions(contact_id)
  WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm3_je_status_idx   ON crm3_journey_executions(account_id, status)
  WHERE status IN ('running','waiting');

ALTER TABLE crm3_journey_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_je_rls ON crm3_journey_executions;
CREATE POLICY crm3_je_rls ON crm3_journey_executions
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- â”€â”€ Extend crm3_journey_events with journey_id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE crm3_journey_events
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES crm3_journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_id UUID REFERENCES crm3_journey_executions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm3_je_events_journey_idx
  ON crm3_journey_events(journey_id)
  WHERE journey_id IS NOT NULL;

-- â”€â”€ Realtime â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_journey_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_journey_executions;
  END IF;
END $$;



-- ============================================================
-- MIGRATION: 007_journey_scheduler.sql
-- ============================================================

-- ============================================================
-- CRM 3.0 Migration 007 â€” Journey Wait-Node Scheduler Support
-- Adds retry/idempotency columns to crm3_journey_contact_state.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- â”€â”€ Scheduler columns on contact state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE crm3_journey_contact_state
  ADD COLUMN IF NOT EXISTS attempt_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminal_error   TEXT,
  ADD COLUMN IF NOT EXISTS scheduler_lock   TIMESTAMPTZ;
  -- scheduler_lock: set to now()+30s when a scheduler picks up this row.
  -- Prevents concurrent schedulers from processing the same row.
  -- Cleared on completion or failure. Expires automatically after 30s.

-- â”€â”€ Index for scheduler query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Finds rows that are: waiting, due, not locked (or lock expired), not terminal.
CREATE INDEX IF NOT EXISTS crm3_jcs_scheduler_idx
  ON crm3_journey_contact_state (wait_until, account_id)
  WHERE status = 'waiting' AND terminal_error IS NULL;

-- â”€â”€ crm3_journey_scheduler_log â€” audit trail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS crm3_journey_scheduler_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  journey_id      UUID NOT NULL REFERENCES crm3_journeys(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_state_id UUID REFERENCES crm3_journey_contact_state(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  -- 'resumed', 'failed', 'dead_lettered', 'skipped_locked', 'skipped_not_due'
  attempt_number  INTEGER NOT NULL DEFAULT 1,
  result          JSONB,
  error_message   TEXT,
  duration_ms     INTEGER,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_jsl_account_idx  ON crm3_journey_scheduler_log(account_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS crm3_jsl_journey_idx  ON crm3_journey_scheduler_log(journey_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS crm3_jsl_contact_idx  ON crm3_journey_scheduler_log(contact_id)
  WHERE contact_id IS NOT NULL;

ALTER TABLE crm3_journey_scheduler_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_jsl_rls ON crm3_journey_scheduler_log;
CREATE POLICY crm3_jsl_rls ON crm3_journey_scheduler_log
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));



-- ============================================================
-- MIGRATION: 008_auth_trigger.sql
-- ============================================================

-- ============================================================
-- TZMICHA CRM 3.0 â€” Migration 008: Auth Trigger
-- Auto-creates account + profile + pipeline stages on signup.
-- Runs after the base schema and feature migrations.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_account_id uuid;
  user_name text;
BEGIN
  -- Extract name from metadata
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create account
  INSERT INTO accounts (name, currency, timezone)
  VALUES (user_name || '''s CRM', 'USD', 'UTC')
  RETURNING id INTO new_account_id;

  -- Create profile (owner role)
  INSERT INTO profiles (user_id, account_id, full_name, role)
  VALUES (NEW.id, new_account_id, user_name, 'owner');

  -- Seed default pipeline stages
  INSERT INTO pipeline_stages (account_id, name, position, color) VALUES
    (new_account_id, 'New Lead',     0, '#4d7cff'),
    (new_account_id, 'Contacted',    1, '#8b5cf6'),
    (new_account_id, 'Qualified',    2, '#28c99a'),
    (new_account_id, 'Proposal',     3, '#f4c95d'),
    (new_account_id, 'Negotiation',  4, '#f46b72'),
    (new_account_id, 'Won',          5, '#28c99a');

  RETURN NEW;
END;
$$;

-- Drop if exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();



-- ============================================================
-- MIGRATION: 009_fix_profiles_rls.sql
-- ============================================================

-- ============================================================
-- Migration 009: Fix profiles RLS infinite recursion
-- Replaces the self-referential subquery in profiles_rls with
-- a SECURITY DEFINER helper function to prevent PostgreSQL
-- error 42P17 when contacts_rls or deals_rls queries profiles.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- Step 1: Create a SECURITY DEFINER helper to get current account_id
CREATE OR REPLACE FUNCTION public.get_my_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Step 2: Replace the recursive profiles policy
DROP POLICY IF EXISTS profiles_rls ON public.profiles;

CREATE POLICY profiles_rls ON public.profiles
  USING (
    user_id = auth.uid()
    OR account_id = public.get_my_account_id()
  );

-- Step 3: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_account_id() TO authenticated;



COMMIT;

-- ============================================================
-- DONE! All 9 migrations applied successfully!
-- ============================================================
