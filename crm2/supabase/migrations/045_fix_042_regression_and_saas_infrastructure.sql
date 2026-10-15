-- ============================================================
-- 045: Fix 042 regression + SaaS infrastructure
--
-- This migration:
--   1. Fixes the multi-tenant regression introduced by 042
--      (missing account_id columns, wrong RLS policies)
--   2. Adds platform-level super_admin role
--   3. Adds SaaS billing infrastructure (plans, subscriptions,
--      usage tracking, resource limits)
--   4. Ensures the is_account_member() helper exists and works
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- PART 1: Ensure account_role_enum and is_account_member() exist
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_role_enum') THEN
    CREATE TYPE account_role_enum AS ENUM ('owner', 'admin', 'agent', 'viewer');
  END IF;
END $$;

-- Platform role enum (super_admin is separate from account roles)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_role_enum') THEN
    CREATE TYPE platform_role_enum AS ENUM ('super_admin', 'user');
  END IF;
END $$;

-- Ensure is_account_member() function exists
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

-- Helper: check if the current user is a platform super_admin
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.platform_role = 'super_admin'
  );
$$;

ALTER FUNCTION is_super_admin() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated, service_role;

-- ============================================================
-- PART 2: Add platform_role to profiles
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS platform_role platform_role_enum NOT NULL DEFAULT 'user';

-- Ensure account_role column uses the enum type (fix 042 TEXT regression)
-- Only alter if the column is TEXT and needs to become the enum
DO $$
BEGIN
  -- Check if account_role is text type (042 regression)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles'
      AND column_name = 'account_role'
      AND data_type = 'text'
  ) THEN
    -- Cast existing values to the enum, setting any invalid values to 'viewer'
    ALTER TABLE profiles
      ALTER COLUMN account_role DROP DEFAULT;

    UPDATE profiles
      SET account_role = 'viewer'
      WHERE account_role NOT IN ('owner', 'admin', 'agent', 'viewer');

    ALTER TABLE profiles
      ALTER COLUMN account_role TYPE account_role_enum
      USING account_role::account_role_enum;

    ALTER TABLE profiles
      ALTER COLUMN account_role SET DEFAULT 'viewer';
  END IF;

  -- Ensure NOT NULL
  ALTER TABLE profiles
    ALTER COLUMN account_role SET NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'profiles.account_role type adjustment skipped: %', SQLERRM;
END $$;

-- ============================================================
-- PART 3: Ensure account_id exists on all required tables
-- ============================================================

-- Add account_id where missing (042 dropped it from these tables)
DO $$
DECLARE
  tbl TEXT;
  tables_to_fix TEXT[] := ARRAY[
    'contacts', 'conversations', 'message_templates', 'broadcasts',
    'automations', 'automation_logs', 'pipelines', 'deals',
    'tags', 'custom_fields', 'contact_notes',
    'flows', 'flow_runs', 'automation_pending_executions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_fix LOOP
    -- Add account_id column if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tbl AND column_name = 'account_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE CASCADE',
        tbl
      );
      RAISE NOTICE 'Added account_id to %', tbl;
    END IF;

    -- Add index if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = format('idx_%s_account_id', tbl)
    ) THEN
      EXECUTE format(
        'CREATE INDEX idx_%s_account_id ON %I(account_id)',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- Backfill account_id from user_id -> profiles -> accounts chain
DO $$
DECLARE
  tbl TEXT;
  tables_to_backfill TEXT[] := ARRAY[
    'contacts', 'conversations', 'message_templates', 'broadcasts',
    'automations', 'automation_logs', 'pipelines', 'deals',
    'tags', 'custom_fields', 'contact_notes',
    'flows', 'flow_runs', 'automation_pending_executions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_backfill LOOP
    EXECUTE format(
      'UPDATE %I t SET account_id = p.account_id
       FROM profiles p
       WHERE t.user_id = p.user_id AND t.account_id IS NULL',
      tbl
    );
    RAISE NOTICE 'Backfilled account_id in %', tbl;
  END LOOP;
END $$;

-- Set NOT NULL on account_id for tables that need it
DO $$
DECLARE
  tbl TEXT;
  tables_nn TEXT[] := ARRAY[
    'contacts', 'conversations', 'message_templates', 'broadcasts',
    'automations', 'automation_logs', 'pipelines', 'deals',
    'tags', 'custom_fields', 'contact_notes',
    'flows', 'flow_runs', 'automation_pending_executions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_nn LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN account_id SET NOT NULL', tbl
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not set NOT NULL on %.account_id: %', tbl, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================
-- PART 4: Rewrite RLS policies to use is_account_member()
-- ============================================================

-- Helper: drop and recreate a policy
-- (Postgres has no CREATE POLICY IF NOT EXISTS)

-- ACCOUNTS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_select ON accounts;
DROP POLICY IF EXISTS accounts_update ON accounts;
DROP POLICY IF EXISTS accounts_insert ON accounts;
DROP POLICY IF EXISTS accounts_delete ON accounts;
CREATE POLICY accounts_select ON accounts
  FOR SELECT USING (is_account_member(id) OR is_super_admin());
CREATE POLICY accounts_update ON accounts
  FOR UPDATE USING (is_account_member(id, 'admin') OR is_super_admin());
CREATE POLICY accounts_insert ON accounts
  FOR INSERT WITH CHECK (true); -- new account creation handled by trigger/RPC

-- ACCOUNT_INVITATIONS
ALTER TABLE account_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_invitations_select ON account_invitations;
DROP POLICY IF EXISTS account_invitations_insert ON account_invitations;
DROP POLICY IF EXISTS account_invitations_update ON account_invitations;
DROP POLICY IF EXISTS account_invitations_delete ON account_invitations;
CREATE POLICY account_invitations_select ON account_invitations
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY account_invitations_insert ON account_invitations
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY account_invitations_update ON account_invitations
  FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY account_invitations_delete ON account_invitations
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_insert ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;
-- Users can see their own profile + teammates in same account
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (
    auth.uid() = user_id
    OR is_account_member(account_id)
    OR is_super_admin()
  );
CREATE POLICY profiles_insert ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY profiles_update ON profiles
  FOR UPDATE USING (
    auth.uid() = user_id
    OR is_super_admin()
  );

-- CONTACTS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view contacts" ON contacts;
DROP POLICY IF EXISTS "Users can insert contacts" ON contacts;
DROP POLICY IF EXISTS "Users can update contacts" ON contacts;
DROP POLICY IF EXISTS "Users can delete contacts" ON contacts;
DROP POLICY IF EXISTS contacts_select ON contacts;
DROP POLICY IF EXISTS contacts_insert ON contacts;
DROP POLICY IF EXISTS contacts_update ON contacts;
DROP POLICY IF EXISTS contacts_delete ON contacts;
CREATE POLICY contacts_select ON contacts
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY contacts_insert ON contacts
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY contacts_update ON contacts
  FOR UPDATE USING (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY contacts_delete ON contacts
  FOR DELETE USING (is_account_member(account_id, 'agent') OR is_super_admin());

-- CONVERSATIONS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view conversations" ON conversations;
DROP POLICY IF EXISTS "Users can insert conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete conversations" ON conversations;
DROP POLICY IF EXISTS conversations_select ON conversations;
DROP POLICY IF EXISTS conversations_insert ON conversations;
DROP POLICY IF EXISTS conversations_update ON conversations;
DROP POLICY IF EXISTS conversations_delete ON conversations;
CREATE POLICY conversations_select ON conversations
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY conversations_insert ON conversations
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY conversations_update ON conversations
  FOR UPDATE USING (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY conversations_delete ON conversations
  FOR DELETE USING (is_account_member(account_id, 'agent') OR is_super_admin());

-- MESSAGES (via conversations.account_id)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view messages" ON messages;
DROP POLICY IF EXISTS "Users can insert messages" ON messages;
DROP POLICY IF EXISTS "Users can update messages" ON messages;
DROP POLICY IF EXISTS "Users can delete messages" ON messages;
DROP POLICY IF EXISTS messages_select ON messages;
DROP POLICY IF EXISTS messages_insert ON messages;
DROP POLICY IF EXISTS messages_update ON messages;
DROP POLICY IF EXISTS messages_delete ON messages;
CREATE POLICY messages_select ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (is_account_member(c.account_id) OR is_super_admin())
    )
  );
CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (is_account_member(c.account_id, 'agent') OR is_super_admin())
    )
  );
CREATE POLICY messages_update ON messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (is_account_member(c.account_id, 'agent') OR is_super_admin())
    )
  );
CREATE POLICY messages_delete ON messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (is_account_member(c.account_id, 'agent') OR is_super_admin())
    )
  );

-- WHATSAPP_CONFIG
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_config_select ON whatsapp_config;
DROP POLICY IF EXISTS whatsapp_config_insert ON whatsapp_config;
DROP POLICY IF EXISTS whatsapp_config_update ON whatsapp_config;
DROP POLICY IF EXISTS whatsapp_config_delete ON whatsapp_config;
CREATE POLICY whatsapp_config_select ON whatsapp_config
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY whatsapp_config_insert ON whatsapp_config
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY whatsapp_config_update ON whatsapp_config
  FOR UPDATE USING (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY whatsapp_config_delete ON whatsapp_config
  FOR DELETE USING (is_account_member(account_id, 'admin') OR is_super_admin());

-- MESSAGE_TEMPLATES
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_templates_select ON message_templates;
DROP POLICY IF EXISTS message_templates_insert ON message_templates;
DROP POLICY IF EXISTS message_templates_update ON message_templates;
DROP POLICY IF EXISTS message_templates_delete ON message_templates;
CREATE POLICY message_templates_select ON message_templates
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY message_templates_insert ON message_templates
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY message_templates_update ON message_templates
  FOR UPDATE USING (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY message_templates_delete ON message_templates
  FOR DELETE USING (is_account_member(account_id, 'admin') OR is_super_admin());

-- BROADCASTS
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broadcasts_select ON broadcasts;
DROP POLICY IF EXISTS broadcasts_insert ON broadcasts;
DROP POLICY IF EXISTS broadcasts_update ON broadcasts;
DROP POLICY IF EXISTS broadcasts_delete ON broadcasts;
CREATE POLICY broadcasts_select ON broadcasts
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY broadcasts_insert ON broadcasts
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY broadcasts_update ON broadcasts
  FOR UPDATE USING (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY broadcasts_delete ON broadcasts
  FOR DELETE USING (is_account_member(account_id, 'agent') OR is_super_admin());

-- BROADCAST_RECIPIENTS (via broadcasts.account_id)
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broadcast_recipients_select ON broadcast_recipients;
DROP POLICY IF EXISTS broadcast_recipients_insert ON broadcast_recipients;
DROP POLICY IF EXISTS broadcast_recipients_update ON broadcast_recipients;
DROP POLICY IF EXISTS broadcast_recipients_delete ON broadcast_recipients;
CREATE POLICY broadcast_recipients_select ON broadcast_recipients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM broadcasts b
      WHERE b.id = broadcast_recipients.broadcast_id
        AND (is_account_member(b.account_id) OR is_super_admin())
    )
  );
CREATE POLICY broadcast_recipients_insert ON broadcast_recipients
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM broadcasts b
      WHERE b.id = broadcast_recipients.broadcast_id
        AND (is_account_member(b.account_id, 'agent') OR is_super_admin())
    )
  );
CREATE POLICY broadcast_recipients_update ON broadcast_recipients
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM broadcasts b
      WHERE b.id = broadcast_recipients.broadcast_id
        AND (is_account_member(b.account_id, 'agent') OR is_super_admin())
    )
  );
CREATE POLICY broadcast_recipients_delete ON broadcast_recipients
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM broadcasts b
      WHERE b.id = broadcast_recipients.broadcast_id
        AND (is_account_member(b.account_id, 'agent') OR is_super_admin())
    )
  );

-- AUTOMATIONS
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automations_select ON automations;
DROP POLICY IF EXISTS automations_insert ON automations;
DROP POLICY IF EXISTS automations_update ON automations;
DROP POLICY IF EXISTS automations_delete ON automations;
CREATE POLICY automations_select ON automations
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY automations_insert ON automations
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY automations_update ON automations
  FOR UPDATE USING (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY automations_delete ON automations
  FOR DELETE USING (is_account_member(account_id, 'agent') OR is_super_admin());

-- AUTOMATION_STEPS (via automations.account_id)
ALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_steps_select ON automation_steps;
DROP POLICY IF EXISTS automation_steps_insert ON automation_steps;
DROP POLICY IF EXISTS automation_steps_update ON automation_steps;
DROP POLICY IF EXISTS automation_steps_delete ON automation_steps;
CREATE POLICY automation_steps_select ON automation_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_steps.automation_id
        AND (is_account_member(a.account_id) OR is_super_admin())
    )
  );
CREATE POLICY automation_steps_insert ON automation_steps
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_steps.automation_id
        AND (is_account_member(a.account_id, 'agent') OR is_super_admin())
    )
  );
CREATE POLICY automation_steps_update ON automation_steps
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_steps.automation_id
        AND (is_account_member(a.account_id, 'agent') OR is_super_admin())
    )
  );
CREATE POLICY automation_steps_delete ON automation_steps
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_steps.automation_id
        AND (is_account_member(a.account_id, 'agent') OR is_super_admin())
    )
  );

-- AUTOMATION_LOGS
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_logs_select ON automation_logs;
DROP POLICY IF EXISTS automation_logs_insert ON automation_logs;
CREATE POLICY automation_logs_select ON automation_logs
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY automation_logs_insert ON automation_logs
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());

-- PIPELINES
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipelines_select ON pipelines;
DROP POLICY IF EXISTS pipelines_insert ON pipelines;
DROP POLICY IF EXISTS pipelines_update ON pipelines;
DROP POLICY IF EXISTS pipelines_delete ON pipelines;
CREATE POLICY pipelines_select ON pipelines
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY pipelines_insert ON pipelines
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY pipelines_update ON pipelines
  FOR UPDATE USING (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY pipelines_delete ON pipelines
  FOR DELETE USING (is_account_member(account_id, 'admin') OR is_super_admin());

-- PIPELINE_STAGES (via pipelines.account_id)
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipeline_stages_select ON pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_insert ON pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_update ON pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_delete ON pipeline_stages;
CREATE POLICY pipeline_stages_select ON pipeline_stages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND (is_account_member(p.account_id) OR is_super_admin())
    )
  );
CREATE POLICY pipeline_stages_insert ON pipeline_stages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND (is_account_member(p.account_id, 'admin') OR is_super_admin())
    )
  );
CREATE POLICY pipeline_stages_update ON pipeline_stages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND (is_account_member(p.account_id, 'admin') OR is_super_admin())
    )
  );
CREATE POLICY pipeline_stages_delete ON pipeline_stages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND (is_account_member(p.account_id, 'admin') OR is_super_admin())
    )
  );

-- DEALS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deals_select ON deals;
DROP POLICY IF EXISTS deals_insert ON deals;
DROP POLICY IF EXISTS deals_update ON deals;
DROP POLICY IF EXISTS deals_delete ON deals;
CREATE POLICY deals_select ON deals
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY deals_insert ON deals
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY deals_update ON deals
  FOR UPDATE USING (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY deals_delete ON deals
  FOR DELETE USING (is_account_member(account_id, 'agent') OR is_super_admin());

-- TAGS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tags_select ON tags;
DROP POLICY IF EXISTS tags_insert ON tags;
DROP POLICY IF EXISTS tags_update ON tags;
DROP POLICY IF EXISTS tags_delete ON tags;
CREATE POLICY tags_select ON tags
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY tags_insert ON tags
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY tags_update ON tags
  FOR UPDATE USING (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY tags_delete ON tags
  FOR DELETE USING (is_account_member(account_id, 'admin') OR is_super_admin());

-- CUSTOM_FIELDS
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custom_fields_select ON custom_fields;
DROP POLICY IF EXISTS custom_fields_insert ON custom_fields;
DROP POLICY IF EXISTS custom_fields_update ON custom_fields;
DROP POLICY IF EXISTS custom_fields_delete ON custom_fields;
CREATE POLICY custom_fields_select ON custom_fields
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY custom_fields_insert ON custom_fields
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY custom_fields_update ON custom_fields
  FOR UPDATE USING (is_account_member(account_id, 'admin') OR is_super_admin());
CREATE POLICY custom_fields_delete ON custom_fields
  FOR DELETE USING (is_account_member(account_id, 'admin') OR is_super_admin());

-- CONTACT_NOTES
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_notes_select ON contact_notes;
DROP POLICY IF EXISTS contact_notes_insert ON contact_notes;
DROP POLICY IF EXISTS contact_notes_update ON contact_notes;
DROP POLICY IF EXISTS contact_notes_delete ON contact_notes;
CREATE POLICY contact_notes_select ON contact_notes
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY contact_notes_insert ON contact_notes
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY contact_notes_update ON contact_notes
  FOR UPDATE USING (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY contact_notes_delete ON contact_notes
  FOR DELETE USING (is_account_member(account_id, 'agent') OR is_super_admin());

-- FLOWS
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flows_select ON flows;
DROP POLICY IF EXISTS flows_insert ON flows;
DROP POLICY IF EXISTS flows_update ON flows;
DROP POLICY IF EXISTS flows_delete ON flows;
CREATE POLICY flows_select ON flows
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY flows_insert ON flows
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY flows_update ON flows
  FOR UPDATE USING (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY flows_delete ON flows
  FOR DELETE USING (is_account_member(account_id, 'agent') OR is_super_admin());

-- FLOW_NODES (via flows.account_id)
ALTER TABLE flow_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flow_nodes_select ON flow_nodes;
DROP POLICY IF EXISTS flow_nodes_insert ON flow_nodes;
DROP POLICY IF EXISTS flow_nodes_update ON flow_nodes;
DROP POLICY IF EXISTS flow_nodes_delete ON flow_nodes;
CREATE POLICY flow_nodes_select ON flow_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id
        AND (is_account_member(f.account_id) OR is_super_admin())
    )
  );
CREATE POLICY flow_nodes_insert ON flow_nodes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id
        AND (is_account_member(f.account_id, 'agent') OR is_super_admin())
    )
  );
CREATE POLICY flow_nodes_update ON flow_nodes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id
        AND (is_account_member(f.account_id, 'agent') OR is_super_admin())
    )
  );
CREATE POLICY flow_nodes_delete ON flow_nodes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id
        AND (is_account_member(f.account_id, 'agent') OR is_super_admin())
    )
  );

-- FLOW_RUNS
ALTER TABLE flow_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flow_runs_select ON flow_runs;
DROP POLICY IF EXISTS flow_runs_insert ON flow_runs;
CREATE POLICY flow_runs_select ON flow_runs
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY flow_runs_insert ON flow_runs
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());

-- FLOW_RUN_EVENTS (via flow_runs.account_id)
ALTER TABLE flow_run_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flow_run_events_select ON flow_run_events;
DROP POLICY IF EXISTS flow_run_events_insert ON flow_run_events;
CREATE POLICY flow_run_events_select ON flow_run_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM flow_runs fr WHERE fr.id = flow_run_events.flow_run_id
        AND (is_account_member(fr.account_id) OR is_super_admin())
    )
  );
CREATE POLICY flow_run_events_insert ON flow_run_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM flow_runs fr WHERE fr.id = flow_run_events.flow_run_id
        AND (is_account_member(fr.account_id, 'agent') OR is_super_admin())
    )
  );

-- MESSAGE_REACTIONS (via messages -> conversations)
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_reactions_select ON message_reactions;
DROP POLICY IF EXISTS message_reactions_insert ON message_reactions;
DROP POLICY IF EXISTS message_reactions_delete ON message_reactions;
CREATE POLICY message_reactions_select ON message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND (is_account_member(c.account_id) OR is_super_admin())
    )
  );
CREATE POLICY message_reactions_insert ON message_reactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND (is_account_member(c.account_id, 'agent') OR is_super_admin())
    )
  );
CREATE POLICY message_reactions_delete ON message_reactions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND (is_account_member(c.account_id, 'agent') OR is_super_admin())
    )
  );

-- AUTOMATION_PENDING_EXECUTIONS
ALTER TABLE automation_pending_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_pending_executions_select ON automation_pending_executions;
DROP POLICY IF EXISTS automation_pending_executions_insert ON automation_pending_executions;
DROP POLICY IF EXISTS automation_pending_executions_delete ON automation_pending_executions;
CREATE POLICY automation_pending_executions_select ON automation_pending_executions
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY automation_pending_executions_insert ON automation_pending_executions
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent') OR is_super_admin());
CREATE POLICY automation_pending_executions_delete ON automation_pending_executions
  FOR DELETE USING (is_account_member(account_id, 'agent') OR is_super_admin());

-- ============================================================
-- PART 5: SaaS Billing Infrastructure
-- ============================================================

-- Subscription plans (platform-defined)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  -- Price (stored as integer cents to avoid floating-point issues)
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  price_yearly_cents INTEGER NOT NULL DEFAULT 0,
  -- Resource limits (-1 = unlimited)
  max_contacts INTEGER NOT NULL DEFAULT 100,
  max_team_members INTEGER NOT NULL DEFAULT 2,
  max_whatsapp_numbers INTEGER NOT NULL DEFAULT 1,
  max_monthly_messages INTEGER NOT NULL DEFAULT 1000,
  max_broadcasts_per_month INTEGER NOT NULL DEFAULT 10,
  max_automations INTEGER NOT NULL DEFAULT 5,
  max_flows INTEGER NOT NULL DEFAULT 5,
  max_ai_requests_per_month INTEGER NOT NULL DEFAULT 100,
  max_api_requests_per_day INTEGER NOT NULL DEFAULT 1000,
  max_storage_mb INTEGER NOT NULL DEFAULT 100,
  -- Feature flags
  features JSONB NOT NULL DEFAULT '{}',
  -- Metadata
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
-- Plans are readable by all authenticated users (for pricing page)
DROP POLICY IF EXISTS subscription_plans_select ON subscription_plans;
CREATE POLICY subscription_plans_select ON subscription_plans
  FOR SELECT USING (auth.role() = 'authenticated' OR is_super_admin());
-- Only super_admins can modify plans
DROP POLICY IF EXISTS subscription_plans_insert ON subscription_plans;
DROP POLICY IF EXISTS subscription_plans_update ON subscription_plans;
DROP POLICY IF EXISTS subscription_plans_delete ON subscription_plans;
CREATE POLICY subscription_plans_insert ON subscription_plans
  FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY subscription_plans_update ON subscription_plans
  FOR UPDATE USING (is_super_admin());
CREATE POLICY subscription_plans_delete ON subscription_plans
  FOR DELETE USING (is_super_admin());

-- Business subscriptions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
    CREATE TYPE subscription_status_enum AS ENUM (
      'trialing', 'active', 'past_due', 'canceled', 'expired', 'paused'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS business_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status subscription_status_enum NOT NULL DEFAULT 'trialing',
  billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
  -- Trial
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  -- Billing
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  -- External billing references
  billing_customer_id TEXT,
  billing_subscription_id TEXT,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id)
);

ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_subscriptions_select ON business_subscriptions;
DROP POLICY IF EXISTS business_subscriptions_insert ON business_subscriptions;
DROP POLICY IF EXISTS business_subscriptions_update ON business_subscriptions;
DROP POLICY IF EXISTS business_subscriptions_delete ON business_subscriptions;
CREATE POLICY business_subscriptions_select ON business_subscriptions
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY business_subscriptions_insert ON business_subscriptions
  FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY business_subscriptions_update ON business_subscriptions
  FOR UPDATE USING (is_super_admin());
CREATE POLICY business_subscriptions_delete ON business_subscriptions
  FOR DELETE USING (is_super_admin());

-- Resource usage tracking (monthly aggregates)
CREATE TABLE IF NOT EXISTS resource_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  -- Usage counters
  messages_sent INTEGER NOT NULL DEFAULT 0,
  messages_received INTEGER NOT NULL DEFAULT 0,
  contacts_created INTEGER NOT NULL DEFAULT 0,
  broadcasts_created INTEGER NOT NULL DEFAULT 0,
  automations_executed INTEGER NOT NULL DEFAULT 0,
  ai_requests INTEGER NOT NULL DEFAULT 0,
  api_requests INTEGER NOT NULL DEFAULT 0,
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, period_start)
);

ALTER TABLE resource_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS resource_usage_select ON resource_usage;
DROP POLICY IF EXISTS resource_usage_insert ON resource_usage;
DROP POLICY IF EXISTS resource_usage_update ON resource_usage;
CREATE POLICY resource_usage_select ON resource_usage
  FOR SELECT USING (is_account_member(account_id) OR is_super_admin());
CREATE POLICY resource_usage_insert ON resource_usage
  FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY resource_usage_update ON resource_usage
  FOR UPDATE USING (is_super_admin());

-- Platform-level business management (for super_admin)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT;

-- Audit log for platform-level actions
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  account_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_account ON audit_log(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_select ON audit_log;
DROP POLICY IF EXISTS audit_log_insert ON audit_log;
-- Only super_admins can read audit logs
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT USING (is_super_admin());
-- Service role inserts audit logs; RLS allows any insert for authenticated
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- PART 6: Seed default plans
-- ============================================================

INSERT INTO subscription_plans (slug, name, description, price_monthly_cents, price_yearly_cents, max_contacts, max_team_members, max_whatsapp_numbers, max_monthly_messages, max_broadcasts_per_month, max_automations, max_flows, max_ai_requests_per_month, max_api_requests_per_day, max_storage_mb, is_default, sort_order)
VALUES
  ('free', 'Free', 'Perfect for getting started', 0, 0, 100, 2, 1, 500, 5, 3, 3, 50, 100, 100, true, 0),
  ('starter', 'Starter', 'For small businesses', 2900, 29000, 1000, 5, 1, 5000, 50, 20, 20, 500, 5000, 1000, false, 1),
  ('professional', 'Professional', 'For growing teams', 7900, 79000, 10000, 20, 3, 50000, 200, 100, 50, 2000, 20000, 10000, false, 2),
  ('enterprise', 'Enterprise', 'For large organizations', 19900, 199000, -1, -1, 10, -1, -1, -1, -1, -1, 100000, -1, false, 3)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- PART 7: Helper functions for subscription checks
-- ============================================================

-- Get the current plan limits for an account
CREATE OR REPLACE FUNCTION get_account_limits(target_account_id UUID)
RETURNS TABLE (
  plan_slug TEXT,
  plan_name TEXT,
  max_contacts INTEGER,
  max_team_members INTEGER,
  max_whatsapp_numbers INTEGER,
  max_monthly_messages INTEGER,
  max_broadcasts_per_month INTEGER,
  max_automations INTEGER,
  max_flows INTEGER,
  max_ai_requests_per_month INTEGER,
  max_api_requests_per_day INTEGER,
  max_storage_mb INTEGER,
  subscription_status subscription_status_enum,
  trial_ends_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sp.slug,
    sp.name,
    sp.max_contacts,
    sp.max_team_members,
    sp.max_whatsapp_numbers,
    sp.max_monthly_messages,
    sp.max_broadcasts_per_month,
    sp.max_automations,
    sp.max_flows,
    sp.max_ai_requests_per_month,
    sp.max_api_requests_per_day,
    sp.max_storage_mb,
    bs.status,
    bs.trial_ends_at
  FROM business_subscriptions bs
  JOIN subscription_plans sp ON sp.id = bs.plan_id
  WHERE bs.account_id = target_account_id;
$$;

ALTER FUNCTION get_account_limits(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_account_limits(UUID) TO authenticated, service_role;

-- Check if an account is within a specific resource limit
CREATE OR REPLACE FUNCTION check_resource_limit(
  target_account_id UUID,
  resource_name TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN sp.slug = 'enterprise' THEN true  -- enterprise has no limits
    WHEN resource_name = 'contacts' AND sp.max_contacts = -1 THEN true
    WHEN resource_name = 'contacts' THEN
      (SELECT COUNT(*)::INTEGER FROM contacts c WHERE c.account_id = target_account_id) < sp.max_contacts
    WHEN resource_name = 'team_members' AND sp.max_team_members = -1 THEN true
    WHEN resource_name = 'team_members' THEN
      (SELECT COUNT(*)::INTEGER FROM profiles p WHERE p.account_id = target_account_id) < sp.max_team_members
    WHEN resource_name = 'whatsapp_numbers' AND sp.max_whatsapp_numbers = -1 THEN true
    WHEN resource_name = 'whatsapp_numbers' THEN
      (SELECT COUNT(*)::INTEGER FROM whatsapp_config w WHERE w.account_id = target_account_id) < sp.max_whatsapp_numbers
    WHEN resource_name = 'automations' AND sp.max_automations = -1 THEN true
    WHEN resource_name = 'automations' THEN
      (SELECT COUNT(*)::INTEGER FROM automations a WHERE a.account_id = target_account_id) < sp.max_automations
    WHEN resource_name = 'flows' AND sp.max_flows = -1 THEN true
    WHEN resource_name = 'flows' THEN
      (SELECT COUNT(*)::INTEGER FROM flows f WHERE f.account_id = target_account_id) < sp.max_flows
    ELSE true
  END
  FROM business_subscriptions bs
  JOIN subscription_plans sp ON sp.id = bs.plan_id
  WHERE bs.account_id = target_account_id;
$$;

ALTER FUNCTION check_resource_limit(UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION check_resource_limit(UUID, TEXT) TO authenticated, service_role;

-- ============================================================
-- PART 8: Auto-create free subscription on new account
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_account_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  -- Find the default (free) plan
  SELECT id INTO free_plan_id
  FROM subscription_plans
  WHERE is_default = true
  LIMIT 1;

  IF free_plan_id IS NOT NULL THEN
    INSERT INTO business_subscriptions (account_id, plan_id, status, trial_started_at, trial_ends_at, current_period_start, current_period_end)
    VALUES (
      NEW.id,
      free_plan_id,
      'trialing',
      NOW(),
      NOW() + INTERVAL '14 days',
      NOW(),
      NOW() + INTERVAL '14 days'
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION handle_new_account_subscription() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_account_created_subscription ON accounts;
CREATE TRIGGER on_account_created_subscription
  AFTER INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_account_subscription();
