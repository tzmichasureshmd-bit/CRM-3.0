-- ============================================================
-- CRM 3.0 Migration 003 — Smart Automation AI Extensions
-- Extends existing CRM 2.0 automation tables with AI intelligence.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Does NOT duplicate existing automation tables.
-- ============================================================

-- ── Extend automations table with CRM 3.0 fields ─────────────
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

-- ── CRM 3.0 AI Automation Nodes ───────────────────────────────
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

-- ── CRM 3.0 Automation Execution Tracking ────────────────────
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

-- ── CRM 3.0 Automation Templates ─────────────────────────────
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

-- ── Realtime for execution tracking ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_automation_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_automation_executions;
  END IF;
END $$;
