-- ============================================================
-- TZMICHA CRM 3.0 — Migration 000: Standalone Base Schema
-- Run this FIRST on the CRM 3.0 Supabase project.
-- Creates all base tables that migrations 001–006 depend on.
-- CRM 3.0 is a standalone product — its own DB, own users.
-- ============================================================

-- ── Accounts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE,
  plan          text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise')),
  currency      text NOT NULL DEFAULT 'USD',
  timezone      text NOT NULL DEFAULT 'UTC',
  logo_url      text,
  website       text,
  industry      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_rls ON accounts;

-- ── Profiles (links auth.users → accounts) ────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  full_name     text,
  avatar_url    text,
  role          text NOT NULL DEFAULT 'agent' CHECK (role IN ('owner','admin','agent','viewer')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

CREATE INDEX IF NOT EXISTS profiles_user_idx    ON profiles(user_id);
CREATE INDEX IF NOT EXISTS profiles_account_idx ON profiles(account_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_rls ON accounts;
CREATE POLICY accounts_rls ON accounts
  USING (id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS profiles_rls ON profiles;
CREATE POLICY profiles_rls ON profiles
  USING (user_id = auth.uid() OR account_id IN (
    SELECT account_id FROM profiles p2 WHERE p2.user_id = auth.uid()
  ));

-- ── Contacts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                    text,
  phone                   text,
  email                   text,
  company                 text,
  source                  text,
  lead_status             text DEFAULT 'new' CHECK (lead_status IN ('new','contacted','qualified','proposal','negotiation','won','lost')),
  lead_score              integer DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_score_tier         text CHECK (lead_score_tier IN ('hot','warm','cold')),
  lead_score_reason       text,
  lead_score_updated_at   timestamptz,
  opt_out                 boolean NOT NULL DEFAULT false,
  tags                    text[] NOT NULL DEFAULT '{}',
  custom_fields           jsonb NOT NULL DEFAULT '{}',
  instagram_user_id       text,
  telegram_chat_id        text,
  last_customer_reply_at  timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_account_idx   ON contacts(account_id);
CREATE INDEX IF NOT EXISTS contacts_phone_idx     ON contacts(account_id, phone);
CREATE INDEX IF NOT EXISTS contacts_score_idx     ON contacts(account_id, lead_score DESC);
CREATE INDEX IF NOT EXISTS contacts_tier_idx      ON contacts(account_id, lead_score_tier);
CREATE INDEX IF NOT EXISTS contacts_status_idx    ON contacts(account_id, lead_status);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contacts_rls ON contacts;
CREATE POLICY contacts_rls ON contacts
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Conversations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id          uuid REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_agent_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform            text CHECK (platform IN ('whatsapp','instagram','facebook','email','telegram','web')),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','pending','snoozed')),
  priority            text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  unread_count        integer NOT NULL DEFAULT 0,
  last_message_text   text,
  last_message_at     timestamptz,
  -- CRM 3.0 AI columns
  ai_intent           text,
  ai_sentiment        text,
  ai_summary          text,
  ai_lead_score       integer,
  ai_next_action      text,
  ai_analyzed_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_account_idx  ON conversations(account_id);
CREATE INDEX IF NOT EXISTS conversations_contact_idx  ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS conversations_status_idx   ON conversations(account_id, status);
CREATE INDEX IF NOT EXISTS conversations_platform_idx ON conversations(account_id, platform);
CREATE INDEX IF NOT EXISTS conversations_last_msg_idx ON conversations(account_id, last_message_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_rls ON conversations;
CREATE POLICY conversations_rls ON conversations
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type     text NOT NULL CHECK (sender_type IN ('contact','agent','bot','system')),
  sender_id       text,
  content         text NOT NULL DEFAULT '',
  content_type    text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','image','video','audio','document','template','interactive','location')),
  media_url       text,
  status          text NOT NULL DEFAULT 'sent' CHECK (status IN ('pending','sent','delivered','read','failed')),
  external_id     text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_account_idx      ON messages(account_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_rls ON messages;
CREATE POLICY messages_rls ON messages
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Pipeline Stages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  color       text DEFAULT '#4d7cff',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_stages_account_idx ON pipeline_stages(account_id, position);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipeline_stages_rls ON pipeline_stages;
CREATE POLICY pipeline_stages_rls ON pipeline_stages
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Deals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES contacts(id) ON DELETE SET NULL,
  stage_id    uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  title       text NOT NULL,
  value       numeric(12,2),
  currency    text DEFAULT 'USD',
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  close_date  date,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deals_account_idx  ON deals(account_id);
CREATE INDEX IF NOT EXISTS deals_contact_idx  ON deals(contact_id);
CREATE INDEX IF NOT EXISTS deals_status_idx   ON deals(account_id, status);
CREATE INDEX IF NOT EXISTS deals_stage_idx    ON deals(stage_id);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deals_rls ON deals;
CREATE POLICY deals_rls ON deals
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Follow-ups ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_ups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES contacts(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title       text NOT NULL,
  notes       text,
  due_date    timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS follow_ups_account_idx ON follow_ups(account_id);
CREATE INDEX IF NOT EXISTS follow_ups_due_idx     ON follow_ups(account_id, due_date);
CREATE INDEX IF NOT EXISTS follow_ups_status_idx  ON follow_ups(account_id, status);
CREATE INDEX IF NOT EXISTS follow_ups_user_idx    ON follow_ups(user_id);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS follow_ups_rls ON follow_ups;
CREATE POLICY follow_ups_rls ON follow_ups
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Campaigns ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived')),
  platform    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaigns_account_idx ON campaigns(account_id);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaigns_rls ON campaigns;
CREATE POLICY campaigns_rls ON campaigns
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Automations ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid REFERENCES accounts(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  trigger_type    text NOT NULL,
  trigger_config  jsonb NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived','error')),
  ai_enabled      boolean NOT NULL DEFAULT false,
  ai_model        text,
  last_error      text,
  last_run_at     timestamptz,
  success_count   integer NOT NULL DEFAULT 0,
  failure_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automations_account_idx ON automations(account_id);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automations_rls ON automations;
CREATE POLICY automations_rls ON automations
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ── Automation Steps ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  step_type       text NOT NULL,
  position        integer NOT NULL DEFAULT 0,
  config          jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_steps_automation_idx ON automation_steps(automation_id);

ALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_steps_rls ON automation_steps;
CREATE POLICY automation_steps_rls ON automation_steps
  USING (automation_id IN (
    SELECT id FROM automations WHERE account_id IN (
      SELECT account_id FROM profiles WHERE user_id = auth.uid()
    )
  ));

-- ── Enable Realtime on base tables ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

-- ── Seed default pipeline stages ─────────────────────────────
-- (These are account-scoped so they'll be created per account on signup)
-- No global seed needed — created via API when account is set up.
