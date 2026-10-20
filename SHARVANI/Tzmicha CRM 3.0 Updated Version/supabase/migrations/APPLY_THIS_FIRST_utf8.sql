-- ============================================================
-- TZMICHA CRM 3.0 ΓÇö Migration 000: Standalone Base Schema
-- Run this FIRST on the CRM 3.0 Supabase project.
-- Creates all base tables that migrations 001ΓÇô006 depend on.
-- CRM 3.0 is a standalone product ΓÇö its own DB, own users.
-- ============================================================

-- ΓöÇΓöÇ Accounts ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY accounts_rls ON accounts
  USING (id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Profiles (links auth.users ΓåÆ accounts) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY profiles_rls ON profiles
  USING (user_id = auth.uid() OR account_id IN (
    SELECT account_id FROM profiles p2 WHERE p2.user_id = auth.uid()
  ));

-- ΓöÇΓöÇ Contacts ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY contacts_rls ON contacts
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Conversations ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY conversations_rls ON conversations
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Messages ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY messages_rls ON messages
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Pipeline Stages ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY pipeline_stages_rls ON pipeline_stages
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Deals ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY deals_rls ON deals
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Follow-ups ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY follow_ups_rls ON follow_ups
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Campaigns ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY campaigns_rls ON campaigns
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Automations ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY automations_rls ON automations
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Automation Steps ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY automation_steps_rls ON automation_steps
  USING (automation_id IN (
    SELECT id FROM automations WHERE account_id IN (
      SELECT account_id FROM profiles WHERE user_id = auth.uid()
    )
  ));

-- ΓöÇΓöÇ Enable Realtime on base tables ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

-- ΓöÇΓöÇ Seed default pipeline stages ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
-- (These are account-scoped so they'll be created per account on signup)
-- No global seed needed ΓÇö created via API when account is set up.
  
-- ============================================================
-- TZMICHA CRM 3.0 ΓÇö Migration 000b: Auth Trigger
-- Auto-creates account + profile + pipeline stages on signup.
-- Run AFTER 000_crm3_standalone_base.sql
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
-- TZMICHA CRM 3.0 ΓÇö Database Migration 001
-- Run AFTER all CRM 2.0 migrations on the NEW Supabase project
-- New tables only ΓÇö reuses all existing CRM 2.0 tables
-- ============================================================

-- ΓöÇΓöÇ Content Studio ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY crm3_content_rls ON crm3_content
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Attribution Chain ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY crm3_attribution_rls ON crm3_attribution
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Customer Journey Events ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY crm3_journey_rls ON crm3_journey_events
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ AI Agents ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY crm3_agents_rls ON crm3_ai_agents
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ AI Agent Runs ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY crm3_agent_runs_rls ON crm3_ai_agent_runs
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Next Best Actions ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY crm3_nba_rls ON crm3_next_best_actions
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ AI Operations Log ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY crm3_ai_ops_rls ON crm3_ai_operations
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Segments ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
CREATE POLICY crm3_segments_rls ON crm3_segments
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- ΓöÇΓöÇ Enable Realtime ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
ALTER PUBLICATION supabase_realtime ADD TABLE crm3_content;
ALTER PUBLICATION supabase_realtime ADD TABLE crm3_journey_events;
ALTER PUBLICATION supabase_realtime ADD TABLE crm3_next_best_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE crm3_ai_agent_runs;
  
-- ============================================================
-- CRM 3.0 Migration 002 ΓÇö Conversation AI Intelligence Columns
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
-- CRM 3.0 Migration 003 ΓÇö Smart Automation AI Extensions
-- Extends existing CRM 2.0 automation tables with AI intelligence.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Does NOT duplicate existing automation tables.
-- ============================================================

-- ΓöÇΓöÇ Extend automations table with CRM 3.0 fields ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ CRM 3.0 AI Automation Nodes ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ CRM 3.0 Automation Execution Tracking ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ CRM 3.0 Automation Templates ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
    '[{"step_type":"wait","position":0,"config":{"amount":5,"unit":"minutes"}},{"step_type":"send_message","position":1,"config":{"text":"Hi {{contact.name}}! Welcome. How can we help you today?"}},{"step_type":"wait","position":2,"config":{"amount":24,"unit":"hours"}},{"step_type":"send_message","position":3,"config":{"text":"Just checking in ΓÇö any questions we can answer for you?"}}]',
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

-- ΓöÇΓöÇ Realtime for execution tracking ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
-- CRM 3.0 Migration 004 ΓÇö AI Agents Full Framework
-- Extends crm3_ai_agents + crm3_ai_agent_runs (created in 001)
-- Adds: execution steps, approvals, audit log, tool registry
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================================

-- ΓöÇΓöÇ Extend crm3_ai_agents with missing columns ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
ALTER TABLE crm3_ai_agents
  ADD COLUMN IF NOT EXISTS enabled          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS model            TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS provider         TEXT NOT NULL DEFAULT 'openai'
    CHECK (provider IN ('openai','anthropic','rule_based')),
  ADD COLUMN IF NOT EXISTS temperature      NUMERIC(3,2) NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS success_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS config           JSONB NOT NULL DEFAULT '{}';

-- ΓöÇΓöÇ Extend crm3_ai_agent_runs with missing columns ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
ALTER TABLE crm3_ai_agent_runs
  ADD COLUMN IF NOT EXISTS input_context    JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_ms      INTEGER;

-- ΓöÇΓöÇ Agent Execution Steps ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ Agent Approvals ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ Agent Audit Log ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ Indexes for performance ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
CREATE INDEX IF NOT EXISTS idx_crm3_agents_enabled ON crm3_ai_agents(account_id, enabled);
CREATE INDEX IF NOT EXISTS idx_crm3_agent_runs_status ON crm3_ai_agent_runs(account_id, status);
CREATE INDEX IF NOT EXISTS idx_crm3_agent_runs_contact ON crm3_ai_agent_runs(contact_id) WHERE contact_id IS NOT NULL;

-- ΓöÇΓöÇ Realtime ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
-- CRM 3.0 Migration 005 ΓÇö P7 Attribution Enhancements
-- Adds source/channel tracking, campaign linkage, and indexes.
-- crm3_attribution already exists from migration 001.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ΓöÇΓöÇ Extend crm3_attribution with source/channel tracking ΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ Additional indexes for attribution queries ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ Extend crm3_content with campaign_source tracking ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
ALTER TABLE crm3_content
  ADD COLUMN IF NOT EXISTS source          TEXT,
  ADD COLUMN IF NOT EXISTS channel         TEXT,
  ADD COLUMN IF NOT EXISTS views           INTEGER,
  ADD COLUMN IF NOT EXISTS shares          INTEGER;

-- ΓöÇΓöÇ Index for content performance queries ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
CREATE INDEX IF NOT EXISTS crm3_content_published_idx
  ON crm3_content(account_id, published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS crm3_content_campaign_idx
  ON crm3_content(campaign_id)
  WHERE campaign_id IS NOT NULL;
  
-- ============================================================
-- CRM 3.0 Migration 006 ΓÇö Customer Journey Builder
-- crm3_journey_events already exists from migration 001.
-- This adds: journey definitions, executions, contact state.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================

-- ΓöÇΓöÇ Journey Definitions ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ Journey Contact State ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ Journey Executions ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

-- ΓöÇΓöÇ Extend crm3_journey_events with journey_id ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
ALTER TABLE crm3_journey_events
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES crm3_journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_id UUID REFERENCES crm3_journey_executions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm3_je_events_journey_idx
  ON crm3_journey_events(journey_id)
  WHERE journey_id IS NOT NULL;

-- ΓöÇΓöÇ Realtime ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_journey_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_journey_executions;
  END IF;
END $$;
