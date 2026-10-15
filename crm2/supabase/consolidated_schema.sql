-- ============================================================================
-- consolidated_schema.sql
--
-- ONE complete SQL file that recreates the ENTIRE wacrm database from scratch
-- in a fresh Supabase project. Produced by merging all 37 migration files
-- (001-043) from supabase/migrations into their final end-state.
--
-- Every object is declared exactly once with its FINAL shape, ordered so the
-- file runs top-to-bottom in the Supabase SQL editor without errors:
--
--   extensions -> enum type -> tables (dependency order) -> trigger function
--   -> set_updated_at triggers -> functions -> object triggers -> RLS policies
--   -> storage buckets + storage policies -> realtime -> grants.
--
-- Consolidation decisions (duplicates removed, per the merge rules):
--   * 005 REPLACES 003's full-recompute aggregate trigger. Only the
--     incremental 005 machinery (_bcast_bump, _bcast_cols_for_status,
--     broadcast_recipient_aggregate_trigger, recompute_broadcast_counts) is
--     present.
--   * 017 REPLACES every legacy auth.uid()-based RLS policy with
--     is_account_member()-checked equivalents. Only the final (membership)
--     policies are present.
--   * 020 REPLACES 016's per-user flow-media write policies with account-
--     scoped ones. Only the 020 write policies are present.
--   * 042 (destructive production bootstrap) contributes nothing: its
--     DROP TABLE ... CASCADE would wipe a fresh schema, and its recreated
--     tables are regressions vs. the true final shape. 043's column fixes
--     (beta_features, default_currency) are folded into the CREATE TABLEs.
--   * Data-only backfills are omitted (the target database starts empty):
--     017 account propagation, 022's SELECT merge_duplicate_contacts() call,
--     043 orphan-heal, and the duplicate-guard DO blocks in 013/014. The
--     merge_duplicate_contacts() FUNCTION itself is retained.
--   * 040's guarded profiles grants are subsumed by 041's bulk grants below.
--
-- Extensions: "uuid-ossp" (uuid_generate_v4) + "pgcrypto" (gen_random_uuid,
-- used by later tables). No BEGIN/COMMIT wrappers.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================================
-- 2. ENUM TYPES
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_role_enum') THEN
    CREATE TYPE account_role_enum AS ENUM ('owner', 'admin', 'agent', 'viewer');
  END IF;
END $$;


-- ============================================================================
-- 3. TABLES  (dependency order; RLS enabled inline)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  owner_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  address          TEXT,
  phone            TEXT,
  website          TEXT,
  industry         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_default_currency_format CHECK (default_currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_one_per_owner ON accounts(owner_user_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  avatar_url    TEXT,
  role          TEXT DEFAULT 'user',
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  account_role  account_role_enum NOT NULL,
  beta_features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_account_role ON profiles(account_id, account_role);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  phone            TEXT NOT NULL,
  phone_normalized TEXT GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED,
  name             TEXT,
  email            TEXT,
  company          TEXT,
  avatar_url       TEXT,
  lead_status      TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  country          TEXT,
  location         TEXT,
  category         TEXT,
  address          TEXT,
  website          TEXT,
  rating           NUMERIC,
  review_count     INTEGER,
  imported_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_status ON contacts(lead_status);
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(country);
CREATE INDEX IF NOT EXISTS idx_contacts_location ON contacts(location);
CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);
CREATE INDEX IF NOT EXISTS idx_contacts_rating ON contacts(rating);
CREATE INDEX IF NOT EXISTS idx_contacts_review_count ON contacts(review_count);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_imported_at ON contacts(imported_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_phone_normalized
  ON contacts(account_id, phone_normalized)
  WHERE phone_normalized <> '';

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tags_account ON tags(account_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- custom_fields
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_fields (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  field_name   TEXT NOT NULL,
  field_type   TEXT NOT NULL DEFAULT 'text',
  field_options JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_account ON custom_fields(account_id);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- contact_tags (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_tags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag_id);

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- contact_custom_values
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_custom_values (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contact_id, custom_field_id)
);

ALTER TABLE contact_custom_values ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- contact_notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_notes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  note_text  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_account ON contact_notes(account_id);

ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id           UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  assigned_agent_id    UUID,
  ai_autoreply_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ai_reply_count       INTEGER NOT NULL DEFAULT 0,
  ai_handoff_summary   TEXT,
  last_message_text    TEXT,
  last_message_at      TIMESTAMPTZ,
  unread_count         INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_account ON conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_ai_disabled
  ON conversations(account_id, ai_autoreply_disabled)
  WHERE ai_autoreply_disabled IS TRUE;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id      UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type          TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'bot')),
  sender_id            UUID,
  content_type         TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN (
                         'text', 'image', 'document', 'audio', 'video',
                         'location', 'template', 'interactive'
                       )),
  content_text         TEXT,
  media_url            TEXT,
  template_name        TEXT,
  message_id           TEXT,
  reply_to_message_id  UUID REFERENCES messages(id) ON DELETE SET NULL,
  interactive_reply_id TEXT,
  interactive_payload  JSONB,
  ai_generated         BOOLEAN NOT NULL DEFAULT FALSE,
  is_starred           BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at           TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed')),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_interactive ON messages(interactive_reply_id)
  WHERE interactive_reply_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_ai_generated ON messages(ai_generated)
  WHERE ai_generated IS TRUE;
CREATE INDEX IF NOT EXISTS idx_messages_starred ON messages(is_starred, conversation_id)
  WHERE is_starred IS TRUE;
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted_at)
  WHERE deleted_at IS NOT NULL;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- message_reactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_reactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  actor_type      TEXT NOT NULL CHECK (actor_type IN ('customer', 'agent')),
  actor_id        UUID,
  emoji           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, actor_type, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation ON message_reactions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- whatsapp_config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  phone_number_id        TEXT NOT NULL,
  waba_id                TEXT,
  access_token           TEXT NOT NULL,
  verify_token           TEXT,
  status                 TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  connected_at           TIMESTAMPTZ,
  registered_at          TIMESTAMPTZ,
  subscribed_apps_at     TIMESTAMPTZ,
  last_registration_error TEXT,
  last_webhook_at        TIMESTAMPTZ,
  last_inbound_at        TIMESTAMPTZ,
  webhook_verified_at    TIMESTAMPTZ,
  last_api_error         TEXT,
  last_api_error_at      TIMESTAMPTZ,
  -- 046 / 052: per-number health + display metadata.
  connection_status      TEXT DEFAULT 'disconnected'
                         CHECK (connection_status IN ('connected', 'disconnected', 'pending', 'error')),
  display_phone_number   TEXT,
  business_name          TEXT,
  -- 053: multiple numbers per account + primary (default outbound) marker.
  is_primary             BOOLEAN NOT NULL DEFAULT false,
  -- 055: machine-readable registration state.
  registration_state     TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  -- One WhatsApp phone number per instance (prevents two accounts
  -- binding the same number and silently dropping webhook events).
  CONSTRAINT whatsapp_config_phone_number_id_key UNIQUE (phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_account ON whatsapp_config(account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_registered_at ON whatsapp_config(registered_at)
  WHERE registered_at IS NULL;

-- At most one primary (default outbound) number per account (053).
DROP INDEX IF EXISTS whatsapp_config_one_primary_idx;
CREATE UNIQUE INDEX whatsapp_config_one_primary_idx
  ON whatsapp_config (account_id)
  WHERE is_primary;

ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- message_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_templates (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'Marketing' CHECK (category IN ('Marketing', 'Utility', 'Authentication')),
  language           TEXT DEFAULT 'en_US',
  header_type        TEXT CHECK (header_type IN ('text', 'image', 'video', 'document')),
  header_content     TEXT,
  body_text          TEXT NOT NULL,
  footer_text        TEXT,
  buttons            JSONB,
  sample_values      JSONB,
  meta_template_id   TEXT,
  rejection_reason   TEXT,
  quality_score      TEXT,
  header_handle      TEXT,
  header_media_url   TEXT,
  submission_error   TEXT,
  last_submitted_at  TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'DRAFT',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT message_templates_status_meta_check CHECK (status IN (
    'DRAFT', 'PENDING', 'APPROVED', 'REJECTED',
    'PAUSED', 'DISABLED', 'IN_APPEAL', 'PENDING_DELETION'
  )),
  CONSTRAINT message_templates_quality_score_check
    CHECK (quality_score IS NULL OR quality_score IN ('GREEN', 'YELLOW', 'RED')),
  CONSTRAINT message_templates_buttons_shape_check
    CHECK (buttons IS NULL OR (jsonb_typeof(buttons) = 'array' AND jsonb_array_length(buttons) <= 10))
);

CREATE UNIQUE INDEX IF NOT EXISTS message_templates_user_name_language_key
  ON message_templates (user_id, name, language);
CREATE INDEX IF NOT EXISTS idx_message_templates_meta_template_id
  ON message_templates (meta_template_id)
  WHERE meta_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_templates_account ON message_templates(account_id);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- pipelines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipelines (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_account ON pipelines(account_id);

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- pipeline_stages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT '#3b82f6',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- deals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deals (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pipeline_id        UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id           UUID NOT NULL REFERENCES pipeline_stages(id),
  contact_id         UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id    UUID REFERENCES conversations(id),
  assigned_to        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  value              NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency           TEXT DEFAULT 'USD',
  notes              TEXT,
  expected_close_date DATE,
  status             TEXT DEFAULT 'open' CONSTRAINT deals_status_check CHECK (status IN ('open', 'won', 'lost')),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_account ON deals(account_id);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- broadcasts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcasts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  template_name      TEXT NOT NULL,
  template_language  TEXT NOT NULL DEFAULT 'en_US',
  template_variables JSONB,
  audience_filter    JSONB,
  scheduled_at       TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  total_recipients   INTEGER DEFAULT 0,
  sent_count         INTEGER DEFAULT 0,
  delivered_count    INTEGER DEFAULT 0,
  read_count         INTEGER DEFAULT 0,
  replied_count      INTEGER DEFAULT 0,
  failed_count       INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_account ON broadcasts(account_id);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- broadcast_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id      UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed')),
  whatsapp_message_id TEXT,
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  read_at           TIMESTAMPTZ,
  replied_at        TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_wamid
  ON broadcast_recipients (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast_status
  ON broadcast_recipients (broadcast_id, status);

ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- automations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  trigger_type     TEXT NOT NULL,
  trigger_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active        BOOLEAN NOT NULL DEFAULT FALSE,
  execution_count  INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_user_id ON automations(user_id);
CREATE INDEX IF NOT EXISTS idx_automations_active_trigger ON automations(trigger_type)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_automations_account ON automations(account_id);
CREATE INDEX IF NOT EXISTS idx_automations_account_active_trigger ON automations(account_id, trigger_type)
  WHERE is_active = TRUE;

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- automation_steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_steps (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id  UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES automation_steps(id) ON DELETE CASCADE,
  branch         TEXT CHECK (branch IN ('yes', 'no')),
  step_type      TEXT NOT NULL,
  step_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
  position       INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_steps_automation_id
  ON automation_steps(automation_id, position);
CREATE INDEX IF NOT EXISTS idx_automation_steps_parent
  ON automation_steps(parent_step_id) WHERE parent_step_id IS NOT NULL;

ALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- automation_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id  UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  trigger_event  TEXT NOT NULL,
  steps_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
  status         TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation
  ON automation_logs(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user ON automation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_account ON automation_logs(account_id);

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- automation_pending_executions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_pending_executions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id       UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  log_id              UUID REFERENCES automation_logs(id) ON DELETE CASCADE,
  parent_step_id      UUID REFERENCES automation_steps(id) ON DELETE SET NULL,
  branch              TEXT CHECK (branch IN ('yes', 'no')),
  next_step_position  INTEGER NOT NULL,
  context             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  run_at              TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_pending_due
  ON automation_pending_executions(run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_pending_account
  ON automation_pending_executions(account_id);

ALTER TABLE automation_pending_executions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- flows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flows (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  trigger_type     TEXT NOT NULL CHECK (trigger_type IN ('keyword', 'first_inbound_message', 'manual')),
  trigger_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  entry_node_id    TEXT,
  fallback_policy  JSONB NOT NULL DEFAULT '{"on_unknown_reply":"reprompt","max_reprompts":2,"on_timeout_hours":24,"on_exhaust":"handoff"}'::jsonb,
  execution_count  INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flows_active_trigger ON flows(user_id, trigger_type)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_flows_account ON flows(account_id);
CREATE INDEX IF NOT EXISTS idx_flows_account_active ON flows(account_id)
  WHERE status = 'active';

ALTER TABLE flows ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- flow_nodes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flow_nodes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id    UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  node_key   TEXT NOT NULL,
  node_type  TEXT NOT NULL CONSTRAINT flow_nodes_node_type_check CHECK (node_type IN (
               'start',
               'send_buttons',
               'send_list',
               'send_message',
               'send_media',
               'collect_input',
               'condition',
               'set_tag',
               'handoff',
               'http_fetch',
               'end'
             )),
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, node_key)
);

CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow ON flow_nodes(flow_id);

ALTER TABLE flow_nodes ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- flow_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flow_runs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id               UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id       UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                          'active',
                          'completed',
                          'handed_off',
                          'timed_out',
                          'paused_by_agent',
                          'failed'
                        )),
  current_node_key      TEXT,
  last_prompt_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  vars                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  reprompt_count        INTEGER NOT NULL DEFAULT 0,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_advanced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at              TIMESTAMPTZ,
  end_reason            TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_run_per_contact
  ON flow_runs(account_id, contact_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_flow_runs_active_advanced
  ON flow_runs(last_advanced_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_started
  ON flow_runs(flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_runs_account ON flow_runs(account_id);

ALTER TABLE flow_runs ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- flow_run_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flow_run_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_run_id UUID NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
               'started',
               'node_entered',
               'message_sent',
               'reply_received',
               'fallback_fired',
               'handoff',
               'timeout',
               'error',
               'completed'
             )),
  node_key   TEXT,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_run_events_run_type ON flow_run_events(flow_run_id, event_type);
CREATE INDEX IF NOT EXISTS idx_flow_run_events_run_time ON flow_run_events(flow_run_id, created_at DESC);

ALTER TABLE flow_run_events ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- account_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_invitations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash          TEXT NOT NULL UNIQUE,
  role                account_role_enum NOT NULL CHECK (role <> 'owner'),
  created_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  label               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  accepted_at         TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_account_invitations_account_pending
  ON account_invitations(account_id, expires_at)
  WHERE accepted_at IS NULL;

ALTER TABLE account_invitations ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- member_presence
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_presence (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_presence_account_idx ON member_presence(account_id);

ALTER TABLE member_presence ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- api_keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name         text NOT NULL,
  key_prefix   text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  scopes       text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_account_id_idx ON api_keys(account_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_account_id  ON notifications(account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at     ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_conversation ON notifications(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON notifications(account_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- quick_replies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quick_replies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'interactive')),
  content_text       TEXT,
  interactive_payload JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, title)
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_account ON quick_replies(account_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_user ON quick_replies(user_id);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- follow_ups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follow_ups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  due_date     TIMESTAMPTZ,
  reminder_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_contact ON follow_ups(contact_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_account ON follow_ups(account_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due_date ON follow_ups(due_date);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- email_config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'smtp',
  smtp_host     TEXT,
  smtp_port     INTEGER,
  smtp_username TEXT,
  smtp_password TEXT,
  smtp_secure   BOOLEAN DEFAULT true,
  from_email    TEXT NOT NULL DEFAULT '',
  from_name     TEXT NOT NULL DEFAULT '',
  enabled       BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id)
);

ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_preferences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_messages    BOOLEAN DEFAULT true,
  email_broadcasts  BOOLEAN DEFAULT true,
  email_automations BOOLEAN DEFAULT true,
  email_deals       BOOLEAN DEFAULT true,
  push_messages     BOOLEAN DEFAULT true,
  push_broadcasts   BOOLEAN DEFAULT true,
  push_automations  BOOLEAN DEFAULT true,
  push_deals        BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, user_id)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 4. UPDATED_AT TRIGGER FUNCTION (migration 001)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. SET_UPDATED_AT TRIGGERS
-- ============================================================================
DROP TRIGGER IF EXISTS set_updated_at ON profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON contacts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON conversations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON whatsapp_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON whatsapp_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON message_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON deals;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON broadcasts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON broadcasts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON automations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON automations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON flows;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON follow_ups;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON follow_ups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 6. FUNCTIONS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- handle_new_user Ã¢â‚¬â€ signup trigger body (final version from migration 043:
-- creates a personal account + owner profile atomically, cleans up the
-- account if the profile insert fails).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    DELETE FROM public.accounts WHERE id = v_account_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- is_account_member Ã¢â‚¬â€ membership helper used by every RLS policy
-- (migration 017). SECURITY DEFINER so policy bodies can read profiles
-- without recursive RLS. Role hierarchy: owner > admin > agent > viewer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Broadcast count helpers (migration 005 Ã¢â‚¬â€ incremental model; replaces 003's
-- full-recompute trigger body).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._bcast_bump(bid UUID, col TEXT, delta INT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'UPDATE broadcasts SET %I = GREATEST(0, %I + $1), updated_at = NOW() WHERE id = $2',
    col, col
  ) USING delta, bid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public._bcast_cols_for_status(s TEXT)
RETURNS TEXT[] AS $$
BEGIN
  IF s = 'pending' THEN RETURN ARRAY[]::TEXT[]; END IF;
  IF s = 'sent'      THEN RETURN ARRAY['sent_count']; END IF;
  IF s = 'delivered' THEN RETURN ARRAY['sent_count','delivered_count']; END IF;
  IF s = 'read'      THEN RETURN ARRAY['sent_count','delivered_count','read_count']; END IF;
  IF s = 'replied'   THEN RETURN ARRAY['sent_count','delivered_count','read_count','replied_count']; END IF;
  IF s = 'failed'    THEN RETURN ARRAY['failed_count']; END IF;
  RETURN ARRAY[]::TEXT[];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.broadcast_recipient_aggregate_trigger()
RETURNS TRIGGER AS $$
DECLARE
  old_cols TEXT[];
  new_cols TEXT[];
  c TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_cols := _bcast_cols_for_status(NEW.status);
    FOREACH c IN ARRAY new_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_cols := _bcast_cols_for_status(OLD.status);
    FOREACH c IN ARRAY old_cols LOOP
      PERFORM _bcast_bump(OLD.broadcast_id, c, -1);
    END LOOP;
    RETURN OLD;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    old_cols := _bcast_cols_for_status(OLD.status);
    new_cols := _bcast_cols_for_status(NEW.status);
    FOREACH c IN ARRAY old_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, -1);
    END LOOP;
    FOREACH c IN ARRAY new_cols LOOP
      PERFORM _bcast_bump(NEW.broadcast_id, c, 1);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.recompute_broadcast_counts(bid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE broadcasts b SET
    sent_count      = agg.sent_count,
    delivered_count = agg.delivered_count,
    read_count      = agg.read_count,
    replied_count   = agg.replied_count,
    failed_count    = agg.failed_count,
    updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('sent','delivered','read','replied')) AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('delivered','read','replied'))        AS delivered_count,
      COUNT(*) FILTER (WHERE status IN ('read','replied'))                    AS read_count,
      COUNT(*) FILTER (WHERE status = 'replied')                              AS replied_count,
      COUNT(*) FILTER (WHERE status = 'failed')                               AS failed_count
    FROM broadcast_recipients
    WHERE broadcast_id = bid
  ) agg
  WHERE b.id = bid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Atomic execution counters (migrations 007 and 012). Service-role only by
-- default; note migration 041 later re-grants EXECUTE to authenticated on all
-- functions, which is the final state reproduced below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_automation_execution_count(p_automation_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE automations
  SET
    execution_count = execution_count + 1,
    last_executed_at = NOW()
  WHERE id = p_automation_id;
$$;

REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_automation_execution_count(UUID) TO service_role;

CREATE OR REPLACE FUNCTION increment_flow_execution_count(p_flow_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE flows
  SET
    execution_count = execution_count + 1,
    last_executed_at = NOW()
  WHERE id = p_flow_id;
$$;

REVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_flow_execution_count(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- merge_duplicate_contacts Ã¢â‚¬â€ re-runnable duplicate collapse (migration 022).
-- The original migration also CALLED this; the call is omitted here because a
-- fresh database has no rows to merge.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_duplicate_contacts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group   RECORD;
  v_survivor UUID;
  v_losers   UUID[];
  v_merged   INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT account_id,
           phone_normalized,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids
    FROM contacts
    WHERE phone_normalized <> ''
    GROUP BY account_id, phone_normalized
    HAVING count(*) > 1
  LOOP
    v_survivor := v_group.ids[1];
    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];

    UPDATE conversations                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE contact_notes                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE deals                         SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE broadcast_recipients          SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_logs               SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_pending_executions SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);

    UPDATE contact_tags ct SET contact_id = v_survivor
      WHERE ct.contact_id = ANY(v_losers)
        AND NOT EXISTS (
          SELECT 1 FROM contact_tags s
          WHERE s.contact_id = v_survivor AND s.tag_id = ct.tag_id
        );
    DELETE FROM contact_tags WHERE contact_id = ANY(v_losers);

    UPDATE contact_custom_values cv SET contact_id = v_survivor
      WHERE cv.contact_id = ANY(v_losers)
        AND NOT EXISTS (
          SELECT 1 FROM contact_custom_values s
          WHERE s.contact_id = v_survivor AND s.custom_field_id = cv.custom_field_id
        );
    DELETE FROM contact_custom_values WHERE contact_id = ANY(v_losers);

    UPDATE flow_runs SET contact_id = v_survivor
      WHERE contact_id = ANY(v_losers) AND status <> 'active';

    DELETE FROM contacts WHERE id = ANY(v_losers);

    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;

ALTER FUNCTION public.merge_duplicate_contacts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_duplicate_contacts() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- touch_presence Ã¢â‚¬â€ member heartbeat RPC (migration 024)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_presence(
  p_status TEXT DEFAULT 'online'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('online', 'away') THEN
    RAISE EXCEPTION 'Invalid presence status: %', p_status
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id INTO v_account_id
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No account for caller' USING ERRCODE = '22023';
  END IF;

  INSERT INTO member_presence (user_id, account_id, status, last_seen_at)
  VALUES (auth.uid(), v_account_id, p_status, now())
  ON CONFLICT (user_id) DO UPDATE
    SET status       = excluded.status,
        last_seen_at = now(),
        account_id   = excluded.account_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- filter_contacts_by_tags Ã¢â‚¬â€ server-side tag filter (migration 025).
-- SECURITY INVOKER: RLS scopes the result to the caller's account.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (
        p_search IS NULL
        OR c.name ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
      )
  ),
  page AS (
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

ALTER FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Member management RPCs (migration 018). SECURITY DEFINER escape hatches that
-- self-check auth.uid() authority. Error contract: 42501 = forbidden,
-- 22023 = bad input.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_role(
  p_user_id UUID,
  p_new_role account_role_enum
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to demote an owner'
      USING ERRCODE = '22023';
  END IF;
  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to promote to owner'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET account_role = p_new_role
  WHERE user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.set_member_role(UUID, account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, account_role_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, account_role_enum) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
  v_target_name TEXT;
  v_target_email TEXT;
  v_new_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself; transfer ownership or leave the account instead'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role, full_name, email
  INTO v_target_account_id, v_target_role, v_target_name, v_target_email
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the account owner; transfer ownership first'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO accounts (name, owner_user_id)
  VALUES (
    COALESCE(NULLIF(v_target_name, ''), v_target_email, 'My account'),
    p_user_id
  )
  RETURNING id INTO v_new_account_id;

  UPDATE profiles
  SET account_id = v_new_account_id,
      account_role = 'owner'
  WHERE user_id = p_user_id;

  RETURN v_new_account_id;
END;
$$;

ALTER FUNCTION public.remove_account_member(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_account_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_account_member(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_account_ownership(
  p_new_owner_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the account owner can transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You are already the owner'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_new_owner_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles SET account_role = 'admin'
  WHERE user_id = auth.uid();

  UPDATE profiles SET account_role = 'owner'
  WHERE user_id = p_new_owner_user_id;

  UPDATE accounts SET owner_user_id = p_new_owner_user_id
  WHERE id = v_caller_account_id;
END;
$$;

ALTER FUNCTION public.transfer_account_ownership(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_account_ownership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Invitation RPCs (migration 019). peek is anon-readable; redeem moves the
-- caller into the inviter's account.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.peek_invitation(
  p_token_hash TEXT
) RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv account_invitations%ROWTYPE;
  v_account_name TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'used');
  END IF;

  IF v_inv.expires_at <= NOW() THEN
    RETURN json_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT name INTO v_account_name
  FROM accounts
  WHERE id = v_inv.account_id;

  RETURN json_build_object(
    'ok', true,
    'account_name', v_account_name,
    'role', v_inv.role,
    'expires_at', v_inv.expires_at
  );
END;
$$;

ALTER FUNCTION public.peek_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.peek_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_invitation(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;


-- ============================================================================
-- 7. OBJECT TRIGGERS
-- ============================================================================

-- Signup: create account + owner profile (final version, migration 043).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Broadcast aggregate counters (incremental, migration 005).
DROP TRIGGER IF EXISTS broadcast_recipients_aggregate ON broadcast_recipients;
CREATE TRIGGER broadcast_recipients_aggregate
  AFTER INSERT OR UPDATE OR DELETE ON broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_recipient_aggregate_trigger();


-- ============================================================================
-- 8. ROW LEVEL SECURITY POLICIES
--
-- All policies are the FINAL membership-checked versions from migration 017
-- (viewer = read, agent+ = operational writes, admin+ = settings-class writes),
-- plus the policies added by later migrations. is_account_member() (section 6)
-- is defined above so policy expressions resolve.
-- ============================================================================

-- ---- contacts ---------------------------------------------------
DROP POLICY IF EXISTS contacts_select ON contacts;
CREATE POLICY contacts_select ON contacts FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS contacts_insert ON contacts;
CREATE POLICY contacts_insert ON contacts FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS contacts_update ON contacts;
CREATE POLICY contacts_update ON contacts FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS contacts_delete ON contacts;
CREATE POLICY contacts_delete ON contacts FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- tags (settings-class) -------------------------------------
DROP POLICY IF EXISTS tags_select ON tags;
CREATE POLICY tags_select ON tags FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS tags_insert ON tags;
CREATE POLICY tags_insert ON tags FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS tags_update ON tags;
CREATE POLICY tags_update ON tags FOR UPDATE USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS tags_delete ON tags;
CREATE POLICY tags_delete ON tags FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- custom_fields (settings-class) ----------------------------
DROP POLICY IF EXISTS custom_fields_select ON custom_fields;
CREATE POLICY custom_fields_select ON custom_fields FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS custom_fields_insert ON custom_fields;
CREATE POLICY custom_fields_insert ON custom_fields FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS custom_fields_update ON custom_fields;
CREATE POLICY custom_fields_update ON custom_fields FOR UPDATE USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS custom_fields_delete ON custom_fields;
CREATE POLICY custom_fields_delete ON custom_fields FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- contact_notes ---------------------------------------------
DROP POLICY IF EXISTS contact_notes_select ON contact_notes;
CREATE POLICY contact_notes_select ON contact_notes FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS contact_notes_insert ON contact_notes;
CREATE POLICY contact_notes_insert ON contact_notes FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS contact_notes_update ON contact_notes;
CREATE POLICY contact_notes_update ON contact_notes FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS contact_notes_delete ON contact_notes;
CREATE POLICY contact_notes_delete ON contact_notes FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- conversations ---------------------------------------------
DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS conversations_insert ON conversations;
CREATE POLICY conversations_insert ON conversations FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS conversations_update ON conversations;
CREATE POLICY conversations_update ON conversations FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS conversations_delete ON conversations;
CREATE POLICY conversations_delete ON conversations FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- whatsapp_config (settings-class) --------------------------
DROP POLICY IF EXISTS whatsapp_config_select ON whatsapp_config;
CREATE POLICY whatsapp_config_select ON whatsapp_config FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS whatsapp_config_insert ON whatsapp_config;
CREATE POLICY whatsapp_config_insert ON whatsapp_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS whatsapp_config_update ON whatsapp_config;
CREATE POLICY whatsapp_config_update ON whatsapp_config FOR UPDATE USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS whatsapp_config_delete ON whatsapp_config;
CREATE POLICY whatsapp_config_delete ON whatsapp_config FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- message_templates (settings-class) ------------------------
DROP POLICY IF EXISTS message_templates_select ON message_templates;
CREATE POLICY message_templates_select ON message_templates FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS message_templates_insert ON message_templates;
CREATE POLICY message_templates_insert ON message_templates FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS message_templates_update ON message_templates;
CREATE POLICY message_templates_update ON message_templates FOR UPDATE USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS message_templates_delete ON message_templates;
CREATE POLICY message_templates_delete ON message_templates FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- pipelines (settings-class) --------------------------------
DROP POLICY IF EXISTS pipelines_select ON pipelines;
CREATE POLICY pipelines_select ON pipelines FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS pipelines_insert ON pipelines;
CREATE POLICY pipelines_insert ON pipelines FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS pipelines_update ON pipelines;
CREATE POLICY pipelines_update ON pipelines FOR UPDATE USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS pipelines_delete ON pipelines;
CREATE POLICY pipelines_delete ON pipelines FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ---- deals ------------------------------------------------------
DROP POLICY IF EXISTS deals_select ON deals;
CREATE POLICY deals_select ON deals FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS deals_insert ON deals;
CREATE POLICY deals_insert ON deals FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS deals_update ON deals;
CREATE POLICY deals_update ON deals FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS deals_delete ON deals;
CREATE POLICY deals_delete ON deals FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- broadcasts -------------------------------------------------
DROP POLICY IF EXISTS broadcasts_select ON broadcasts;
CREATE POLICY broadcasts_select ON broadcasts FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS broadcasts_insert ON broadcasts;
CREATE POLICY broadcasts_insert ON broadcasts FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS broadcasts_update ON broadcasts;
CREATE POLICY broadcasts_update ON broadcasts FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS broadcasts_delete ON broadcasts;
CREATE POLICY broadcasts_delete ON broadcasts FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- automations ------------------------------------------------
DROP POLICY IF EXISTS automations_select ON automations;
CREATE POLICY automations_select ON automations FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS automations_insert ON automations;
CREATE POLICY automations_insert ON automations FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS automations_update ON automations;
CREATE POLICY automations_update ON automations FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS automations_delete ON automations;
CREATE POLICY automations_delete ON automations FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- automation_logs -------------------------------------------
DROP POLICY IF EXISTS automation_logs_select ON automation_logs;
CREATE POLICY automation_logs_select ON automation_logs FOR SELECT USING (is_account_member(account_id));
-- Service role inserts logs; no client INSERT/UPDATE/DELETE policies.

-- ---- automation_pending_executions -----------------------------
-- Service-role only; no client policies.

-- ---- flows ------------------------------------------------------
DROP POLICY IF EXISTS flows_select ON flows;
CREATE POLICY flows_select ON flows FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS flows_insert ON flows;
CREATE POLICY flows_insert ON flows FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS flows_update ON flows;
CREATE POLICY flows_update ON flows FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS flows_delete ON flows;
CREATE POLICY flows_delete ON flows FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ---- flow_runs --------------------------------------------------
DROP POLICY IF EXISTS flow_runs_select ON flow_runs;
CREATE POLICY flow_runs_select ON flow_runs FOR SELECT USING (is_account_member(account_id));
-- Service-role driven; no client INSERT/UPDATE/DELETE.

-- ---- contact_tags (parent-join semantics) -----------------------
DROP POLICY IF EXISTS contact_tags_select ON contact_tags;
CREATE POLICY contact_tags_select ON contact_tags FOR SELECT USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND is_account_member(c.account_id))
);
DROP POLICY IF EXISTS contact_tags_modify ON contact_tags;
CREATE POLICY contact_tags_modify ON contact_tags FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND is_account_member(c.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND is_account_member(c.account_id, 'agent'))
);

-- ---- contact_custom_values --------------------------------------
DROP POLICY IF EXISTS contact_custom_values_select ON contact_custom_values;
CREATE POLICY contact_custom_values_select ON contact_custom_values FOR SELECT USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND is_account_member(c.account_id))
);
DROP POLICY IF EXISTS contact_custom_values_modify ON contact_custom_values;
CREATE POLICY contact_custom_values_modify ON contact_custom_values FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND is_account_member(c.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND is_account_member(c.account_id, 'agent'))
);

-- ---- messages --------------------------------------------------
DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id))
);
DROP POLICY IF EXISTS messages_modify ON messages;
CREATE POLICY messages_modify ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id, 'agent'))
);

-- ---- pipeline_stages -------------------------------------------
DROP POLICY IF EXISTS pipeline_stages_select ON pipeline_stages;
CREATE POLICY pipeline_stages_select ON pipeline_stages FOR SELECT USING (
  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND is_account_member(p.account_id))
);
DROP POLICY IF EXISTS pipeline_stages_modify ON pipeline_stages;
CREATE POLICY pipeline_stages_modify ON pipeline_stages FOR ALL USING (
  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND is_account_member(p.account_id, 'admin'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND is_account_member(p.account_id, 'admin'))
);

-- ---- broadcast_recipients --------------------------------------
DROP POLICY IF EXISTS broadcast_recipients_select ON broadcast_recipients;
CREATE POLICY broadcast_recipients_select ON broadcast_recipients FOR SELECT USING (
  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND is_account_member(b.account_id))
);
DROP POLICY IF EXISTS broadcast_recipients_modify ON broadcast_recipients;
CREATE POLICY broadcast_recipients_modify ON broadcast_recipients FOR ALL USING (
  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND is_account_member(b.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND is_account_member(b.account_id, 'agent'))
);

-- ---- automation_steps ------------------------------------------
DROP POLICY IF EXISTS automation_steps_select ON automation_steps;
CREATE POLICY automation_steps_select ON automation_steps FOR SELECT USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND is_account_member(a.account_id))
);
DROP POLICY IF EXISTS automation_steps_modify ON automation_steps;
CREATE POLICY automation_steps_modify ON automation_steps FOR ALL USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND is_account_member(a.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND is_account_member(a.account_id, 'agent'))
);

-- ---- flow_nodes ------------------------------------------------
DROP POLICY IF EXISTS flow_nodes_select ON flow_nodes;
CREATE POLICY flow_nodes_select ON flow_nodes FOR SELECT USING (
  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND is_account_member(f.account_id))
);
DROP POLICY IF EXISTS flow_nodes_modify ON flow_nodes;
CREATE POLICY flow_nodes_modify ON flow_nodes FOR ALL USING (
  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND is_account_member(f.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND is_account_member(f.account_id, 'agent'))
);

-- ---- flow_run_events -------------------------------------------
DROP POLICY IF EXISTS flow_run_events_select ON flow_run_events;
CREATE POLICY flow_run_events_select ON flow_run_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM flow_runs r WHERE r.id = flow_run_events.flow_run_id AND is_account_member(r.account_id))
);

-- ---- message_reactions -----------------------------------------
DROP POLICY IF EXISTS message_reactions_select ON message_reactions;
CREATE POLICY message_reactions_select ON message_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id)
  )
);
DROP POLICY IF EXISTS message_reactions_modify ON message_reactions;
CREATE POLICY message_reactions_modify ON message_reactions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id, 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id, 'agent')
  )
);

-- ---- profiles ----------------------------------------------
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (auth.uid() = user_id OR is_account_member(account_id));
DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---- accounts ----------------------------------------------
DROP POLICY IF EXISTS accounts_select ON accounts;
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (is_account_member(id));
DROP POLICY IF EXISTS accounts_update ON accounts;
CREATE POLICY accounts_update ON accounts FOR UPDATE
  USING (is_account_member(id, 'admin'))
  WITH CHECK (is_account_member(id, 'admin'));

-- ---- account_invitations -----------------------------------
DROP POLICY IF EXISTS account_invitations_select ON account_invitations;
CREATE POLICY account_invitations_select ON account_invitations FOR SELECT
  USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS account_invitations_modify ON account_invitations;
CREATE POLICY account_invitations_modify ON account_invitations FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- ---- member_presence ---------------------------------------
DROP POLICY IF EXISTS member_presence_select ON member_presence;
CREATE POLICY member_presence_select ON member_presence FOR SELECT
  USING (is_account_member(account_id));

-- ---- api_keys ----------------------------------------------
DROP POLICY IF EXISTS api_keys_select ON api_keys;
CREATE POLICY api_keys_select ON api_keys FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS api_keys_insert ON api_keys;
CREATE POLICY api_keys_insert ON api_keys FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS api_keys_update ON api_keys;
CREATE POLICY api_keys_update ON api_keys FOR UPDATE
  USING (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS api_keys_delete ON api_keys;
CREATE POLICY api_keys_delete ON api_keys FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ---- notifications -----------------------------------------
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_delete ON notifications;
CREATE POLICY notifications_delete ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- ---- quick_replies -----------------------------------------
DROP POLICY IF EXISTS quick_replies_select ON quick_replies;
CREATE POLICY quick_replies_select ON quick_replies FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS quick_replies_insert ON quick_replies;
CREATE POLICY quick_replies_insert ON quick_replies FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS quick_replies_update ON quick_replies;
CREATE POLICY quick_replies_update ON quick_replies FOR UPDATE
  USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS quick_replies_delete ON quick_replies;
CREATE POLICY quick_replies_delete ON quick_replies FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- ---- follow_ups --------------------------------------------
DROP POLICY IF EXISTS "follow_ups_select" ON follow_ups;
CREATE POLICY "follow_ups_select" ON follow_ups FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS "follow_ups_insert" ON follow_ups;
CREATE POLICY "follow_ups_insert" ON follow_ups FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS "follow_ups_update" ON follow_ups;
CREATE POLICY "follow_ups_update" ON follow_ups FOR UPDATE
  USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS "follow_ups_delete" ON follow_ups;
CREATE POLICY "follow_ups_delete" ON follow_ups FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- ---- email_config ------------------------------------------
DROP POLICY IF EXISTS email_config_select ON email_config;
CREATE POLICY email_config_select ON email_config FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS email_config_insert ON email_config;
CREATE POLICY email_config_insert ON email_config FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS email_config_update ON email_config;
CREATE POLICY email_config_update ON email_config FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

-- ---- notification_preferences ------------------------------
DROP POLICY IF EXISTS notification_preferences_select ON notification_preferences;
CREATE POLICY notification_preferences_select ON notification_preferences FOR SELECT
  USING (is_account_member(account_id) AND auth.uid() = user_id);
DROP POLICY IF EXISTS notification_preferences_insert ON notification_preferences;
CREATE POLICY notification_preferences_insert ON notification_preferences FOR INSERT
  WITH CHECK (is_account_member(account_id) AND auth.uid() = user_id);
DROP POLICY IF EXISTS notification_preferences_update ON notification_preferences;
CREATE POLICY notification_preferences_update ON notification_preferences FOR UPDATE
  USING (is_account_member(account_id) AND auth.uid() = user_id);


-- ============================================================================
-- 9. STORAGE BUCKETS + STORAGE POLICIES
-- ============================================================================

-- ---- avatars bucket (migration 008) --------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---- flow-media bucket (migration 016 + account-scoped writes from 020) --
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'flow-media',
  'flow-media',
  TRUE,
  16777216,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp',
    'video/mp4', 'video/3gpp',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Flow media is publicly readable" ON storage.objects;
CREATE POLICY "Flow media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'flow-media');

DROP POLICY IF EXISTS "Members can upload flow media" ON storage.objects;
CREATE POLICY "Members can upload flow media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can update flow media" ON storage.objects;
CREATE POLICY "Members can update flow media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete flow media" ON storage.objects;
CREATE POLICY "Members can delete flow media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- ---- chat-media bucket (migration 023) ------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  TRUE,
  16777216,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp',
    'video/mp4', 'video/3gpp',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'audio/ogg',
    'audio/mpeg',
    'audio/aac',
    'audio/mp4',
    'audio/amr'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
CREATE POLICY "Chat media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "Members can upload chat media" ON storage.objects;
CREATE POLICY "Members can upload chat media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can update chat media" ON storage.objects;
CREATE POLICY "Members can update chat media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete chat media" ON storage.objects;
CREATE POLICY "Members can delete chat media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );


-- ============================================================================
-- 10. REALTIME PUBLICATION
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'flow_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE flow_runs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'member_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE member_presence;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quick_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quick_replies;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'follow_ups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE follow_ups;
  END IF;
END $$;


-- ============================================================================
-- 11. GRANTS
--
-- Restores the standard Supabase default grants (migration 041). Migration
-- 040's guarded profiles-only grants are subsumed by the bulk grants below
-- (SELECT/UPDATE/INSERT on profiles for authenticated is included).
-- Each GRANT/ALTER is wrapped in a DO block with exception handling so the
-- section is safe to re-run.
-- ============================================================================

-- ---- service_role: god-mode on everything --------------------
DO $$
BEGIN
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
  GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
  GRANT USAGE, CREATE ON SCHEMA public TO service_role;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to grant ALL on existing objects to service_role: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO service_role;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to set default privileges for service_role: %', SQLERRM;
END $$;

-- ---- authenticated: standard CRUD ----------------------------
DO $$
BEGIN
  GRANT USAGE ON SCHEMA public TO authenticated;

  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to grant CRUD to authenticated: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to set default privileges for authenticated: %', SQLERRM;
END $$;

-- ---- anon: read-only -----------------------------------------
DO $$
BEGIN
  GRANT USAGE ON SCHEMA public TO anon;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to grant SELECT to anon: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to set default privileges for anon: %', SQLERRM;
END $$;

-- ============================================================================
-- END OF CONSOLIDATED SCHEMA
-- ============================================================================
