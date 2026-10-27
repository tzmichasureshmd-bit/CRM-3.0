-- ============================================================
-- CRM 3.0 — COMPLETE MIGRATION PACKAGE
-- Run this ONCE in Supabase SQL Editor to unlock all features
-- Applies migrations: 001, 002, 003, 004, 005, 006, 007, 009, 021
-- Safe to run multiple times (idempotent)
-- Estimated time: 2-3 minutes
-- ============================================================

-- ============================================================
-- MIGRATION 009: Fix profiles RLS infinite recursion
-- Creates helper function to prevent PostgreSQL error 42P17
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

DROP POLICY IF EXISTS profiles_rls ON public.profiles;

CREATE POLICY profiles_rls ON public.profiles
  USING (
    user_id = auth.uid()
    OR account_id = public.get_my_account_id()
  );

GRANT EXECUTE ON FUNCTION public.get_my_account_id() TO authenticated;

-- ============================================================
-- MIGRATION 001: CRM 3.0 Foundation Tables
-- Content Studio, Attribution, Journey Events, AI Agents, NBA
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

-- ============================================================
-- MIGRATION 002: Conversation AI Intelligence Columns
-- Extends existing conversations table with AI fields
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_conversations_ai_intent
  ON conversations(account_id, ai_intent)
  WHERE ai_intent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_platform
  ON conversations(account_id, platform);

CREATE INDEX IF NOT EXISTS idx_conversations_priority
  ON conversations(account_id, priority);

-- ============================================================
-- MIGRATION 003: Smart Automation AI Extensions
-- Extends existing automation tables with AI intelligence
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_automations_account_id
  ON automations(account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automations_account_status
  ON automations(account_id, status)
  WHERE account_id IS NOT NULL;

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
  ai_results      JSONB NOT NULL DEFAULT '{}',
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
    '[{"step_type":"wait","position":0,"config":{"amount":5,"unit":"minutes"}},{"step_type":"send_message","position":1,"config":{"text":"Hi {{contact.name}}! Welcome. How can we help you today?"}},{"step_type":"wait","position":2,"config":{"amount":24,"unit":"hours"}},{"step_type":"send_message","position":3,"config":{"text":"Just checking in — any questions we can answer for you?"}}]',
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

-- ============================================================
-- MIGRATION 004: AI Agents Full Framework
-- Execution steps, approvals, audit log, tool registry
-- ============================================================

ALTER TABLE crm3_ai_agents
  ADD COLUMN IF NOT EXISTS enabled          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS model            TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS provider         TEXT NOT NULL DEFAULT 'openai'
    CHECK (provider IN ('openai','anthropic','rule_based')),
  ADD COLUMN IF NOT EXISTS temperature      NUMERIC(3,2) NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS success_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS config           JSONB NOT NULL DEFAULT '{}';

ALTER TABLE crm3_ai_agent_runs
  ADD COLUMN IF NOT EXISTS input_context    JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_ms      INTEGER;

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

CREATE TABLE IF NOT EXISTS crm3_agent_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES crm3_ai_agents(id) ON DELETE SET NULL,
  run_id          UUID REFERENCES crm3_ai_agent_runs(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id),
  event_type      TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_crm3_agents_enabled ON crm3_ai_agents(account_id, enabled);
CREATE INDEX IF NOT EXISTS idx_crm3_agent_runs_status ON crm3_ai_agent_runs(account_id, status);
CREATE INDEX IF NOT EXISTS idx_crm3_agent_runs_contact ON crm3_ai_agent_runs(contact_id) WHERE contact_id IS NOT NULL;

-- ============================================================
-- MIGRATION 005: Attribution Enhancements
-- Source/channel tracking, campaign linkage, indexes
-- ============================================================

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

ALTER TABLE crm3_content
  ADD COLUMN IF NOT EXISTS source          TEXT,
  ADD COLUMN IF NOT EXISTS channel         TEXT,
  ADD COLUMN IF NOT EXISTS views           INTEGER,
  ADD COLUMN IF NOT EXISTS shares          INTEGER;

CREATE INDEX IF NOT EXISTS crm3_content_published_idx
  ON crm3_content(account_id, published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS crm3_content_campaign_idx
  ON crm3_content(campaign_id)
  WHERE campaign_id IS NOT NULL;

-- ============================================================
-- MIGRATION 006: Customer Journey Builder
-- Journey definitions, executions, contact state
-- ============================================================

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
  edges           JSONB NOT NULL DEFAULT '[]',
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

CREATE TABLE IF NOT EXISTS crm3_journey_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  journey_id      UUID NOT NULL REFERENCES crm3_journeys(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  triggered_by    TEXT NOT NULL DEFAULT 'manual',
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed','waiting','cancelled')),
  nodes_executed  JSONB NOT NULL DEFAULT '[]',
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

ALTER TABLE crm3_journey_events
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES crm3_journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_id UUID REFERENCES crm3_journey_executions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm3_je_events_journey_idx
  ON crm3_journey_events(journey_id)
  WHERE journey_id IS NOT NULL;

-- ============================================================
-- MIGRATION 007: Journey Wait-Node Scheduler Support
-- Retry/idempotency columns and scheduler log
-- ============================================================

ALTER TABLE crm3_journey_contact_state
  ADD COLUMN IF NOT EXISTS attempt_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminal_error   TEXT,
  ADD COLUMN IF NOT EXISTS scheduler_lock   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS crm3_jcs_scheduler_idx
  ON crm3_journey_contact_state (wait_until, account_id)
  WHERE status = 'waiting' AND terminal_error IS NULL;

CREATE TABLE IF NOT EXISTS crm3_journey_scheduler_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  journey_id      UUID NOT NULL REFERENCES crm3_journeys(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_state_id UUID REFERENCES crm3_journey_contact_state(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
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
-- MIGRATION 021: Fix Auth Foreign Keys & Add Auth Columns
-- Fixes Google sign-in 500 error, adds password/TOTP/API keys
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

ALTER TABLE conversations   DROP CONSTRAINT IF EXISTS conversations_assigned_agent_id_fkey;
ALTER TABLE follow_ups      DROP CONSTRAINT IF EXISTS follow_ups_user_id_fkey;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS password_hash  TEXT,
  ADD COLUMN IF NOT EXISTS google_id      TEXT,
  ADD COLUMN IF NOT EXISTS email          TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url     TEXT,
  ADD COLUMN IF NOT EXISTS totp_secret    TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS token_version  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS timezone       TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS language       TEXT NOT NULL DEFAULT 'en';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_google_id ON profiles(google_id)
  WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

CREATE TABLE IF NOT EXISTS email_otps (
  email           TEXT PRIMARY KEY,
  code            TEXT NOT NULL,
  code_hash       TEXT,
  expires_at      TIMESTAMP NOT NULL,
  used            BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_email_unique'
  ) THEN
    IF NOT EXISTS (
      SELECT email FROM profiles
      WHERE email IS NOT NULL
      GROUP BY email HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
    ELSE
      RAISE NOTICE 'Duplicate emails exist — UNIQUE constraint NOT added. Resolve duplicates first.';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm3_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id      uuid,
  name         text NOT NULL,
  key_prefix   text NOT NULL,
  key_hash     text NOT NULL,
  scopes       text[] NOT NULL DEFAULT '{"read"}',
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm3_api_keys_account ON crm3_api_keys(account_id);
ALTER TABLE crm3_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_api_keys_rls ON crm3_api_keys;
CREATE POLICY crm3_api_keys_rls ON crm3_api_keys
  USING (account_id = public.get_my_account_id());

UPDATE profiles SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL;

-- ============================================================
-- ENABLE REALTIME FOR ALL CRM 3.0 TABLES
-- ============================================================

DO $$
BEGIN
  -- Migration 001 tables
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

  -- Migration 002 tables
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

  -- Migration 003 tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_automation_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_automation_executions;
  END IF;

  -- Migration 004 tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_agent_approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_agent_approvals;
  END IF;

  -- Migration 006 tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_journey_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_journey_executions;
  END IF;
END $$;

-- ============================================================
-- MIGRATION COMPLETE
-- All CRM 3.0 features are now unlocked!
-- Next: Add real OpenAI API key and restart containers
-- ============================================================
