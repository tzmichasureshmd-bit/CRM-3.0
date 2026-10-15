-- ============================================================
-- Migration 051: Automation & AI Flow Platform Upgrade
--
-- Adds tables for:
--   - Tickets & ticket comments
--   - Appointments & appointment reminders
--   - AI follow-up sequences & executions
--   - AI call campaigns & call records
--   - Wallets & wallet transactions
--   - Pricing rules (configurable Meta rates)
--   - Smart broadcasts (enhanced broadcasts)
--   - Keyboard shortcuts (configurable)
--   - Workflow templates
--   - Automation execution logs (enhanced)
--
-- All tables are account-scoped with RLS via is_account_member().
-- Idempotent — safe to run multiple times.
-- ============================================================

BEGIN;

-- ============================================================
-- TICKETS
-- ============================================================

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ticket_number SERIAL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_account ON tickets(account_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(account_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_contact ON tickets(contact_id);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS tickets_insert ON tickets;
CREATE POLICY tickets_insert ON tickets
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS tickets_update ON tickets;
CREATE POLICY tickets_update ON tickets
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS tickets_delete ON tickets;
CREATE POLICY tickets_delete ON tickets
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Ticket comments
CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_comments_select ON ticket_comments;
CREATE POLICY ticket_comments_select ON ticket_comments
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS ticket_comments_insert ON ticket_comments;
CREATE POLICY ticket_comments_insert ON ticket_comments
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- ============================================================
-- APPOINTMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  service TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','rescheduled','cancelled','completed','no_show')),
  notes TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_24h_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_1h_sent BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_appointments_account ON appointments(account_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(account_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_agent ON appointments(agent_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(account_id, status);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select ON appointments;
CREATE POLICY appointments_select ON appointments
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS appointments_insert ON appointments;
CREATE POLICY appointments_insert ON appointments
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS appointments_update ON appointments;
CREATE POLICY appointments_update ON appointments
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS appointments_delete ON appointments;
CREATE POLICY appointments_delete ON appointments
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- AI FOLLOW-UPS
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual','new_contact','tag_added','deal_created','no_response','keyword','webhook','scheduled')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  max_followups INTEGER NOT NULL DEFAULT 3,
  delay_hours INTEGER NOT NULL DEFAULT 24,
  working_hours_only BOOLEAN NOT NULL DEFAULT false,
  working_hours_start TIME DEFAULT '09:00',
  working_hours_end TIME DEFAULT '18:00',
  stop_on_reply BOOLEAN NOT NULL DEFAULT true,
  stop_on_opt_out BOOLEAN NOT NULL DEFAULT true,
  ai_provider TEXT,
  ai_model TEXT,
  ai_system_prompt TEXT,
  ai_temperature NUMERIC(3,2) DEFAULT 0.7,
  ai_max_tokens INTEGER DEFAULT 500,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  use_template BOOLEAN NOT NULL DEFAULT false,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_followups_account ON ai_followups(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_followups_status ON ai_followups(account_id, status);

ALTER TABLE ai_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_followups_select ON ai_followups;
CREATE POLICY ai_followups_select ON ai_followups
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS ai_followups_insert ON ai_followups;
CREATE POLICY ai_followups_insert ON ai_followups
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS ai_followups_update ON ai_followups;
CREATE POLICY ai_followups_update ON ai_followups
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS ai_followups_delete ON ai_followups;
CREATE POLICY ai_followups_delete ON ai_followups
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- AI follow-up executions
CREATE TABLE IF NOT EXISTS ai_followup_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  followup_id UUID NOT NULL REFERENCES ai_followups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','stopped','failed','waiting')),
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 0,
  last_message_id UUID,
  last_sent_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  ai_generated_message TEXT,
  stop_reason TEXT,
  error_message TEXT,
  vars JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_followup_exec_account ON ai_followup_executions(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_followup_exec_followup ON ai_followup_executions(followup_id);
CREATE INDEX IF NOT EXISTS idx_ai_followup_exec_contact ON ai_followup_executions(contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_followup_exec_status ON ai_followup_executions(status);
CREATE INDEX IF NOT EXISTS idx_ai_followup_exec_next_action ON ai_followup_executions(next_action_at) WHERE status = 'waiting';

ALTER TABLE ai_followup_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_followup_exec_select ON ai_followup_executions;
CREATE POLICY ai_followup_exec_select ON ai_followup_executions
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS ai_followup_exec_insert ON ai_followup_executions;
CREATE POLICY ai_followup_exec_insert ON ai_followup_executions
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS ai_followup_exec_update ON ai_followup_executions;
CREATE POLICY ai_followup_exec_update ON ai_followup_executions
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

-- ============================================================
-- AI CALL CAMPAIGNS
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_call_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed','failed')),
  voice_agent_id TEXT,
  call_objective TEXT,
  calling_hours_start TIME DEFAULT '09:00',
  calling_hours_end TIME DEFAULT '18:00',
  calling_days INTEGER[] DEFAULT '{1,2,3,4,5}',
  max_calls INTEGER NOT NULL DEFAULT 100,
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_delay_hours INTEGER NOT NULL DEFAULT 4,
  contact_filter JSONB NOT NULL DEFAULT '{}',
  contact_ids UUID[] DEFAULT '{}',
  total_calls INTEGER NOT NULL DEFAULT 0,
  completed_calls INTEGER NOT NULL DEFAULT 0,
  failed_calls INTEGER NOT NULL DEFAULT 0,
  interested_count INTEGER NOT NULL DEFAULT 0,
  not_interested_count INTEGER NOT NULL DEFAULT 0,
  converted_count INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_campaigns_account ON ai_call_campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_campaigns_status ON ai_call_campaigns(account_id, status);

ALTER TABLE ai_call_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_call_campaigns_select ON ai_call_campaigns;
CREATE POLICY ai_call_campaigns_select ON ai_call_campaigns
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS ai_call_campaigns_insert ON ai_call_campaigns;
CREATE POLICY ai_call_campaigns_insert ON ai_call_campaigns
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS ai_call_campaigns_update ON ai_call_campaigns;
CREATE POLICY ai_call_campaigns_update ON ai_call_campaigns
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS ai_call_campaigns_delete ON ai_call_campaigns;
CREATE POLICY ai_call_campaigns_delete ON ai_call_campaigns
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- AI call records
CREATE TABLE IF NOT EXISTS ai_call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ai_call_campaigns(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','calling','completed','no_answer','busy','failed','retry')),
  outcome TEXT CHECK (outcome IN ('interested','not_interested','call_later','converted','no_outcome')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  transcript TEXT,
  ai_summary TEXT,
  ai_sentiment TEXT,
  next_action TEXT,
  followup_required BOOLEAN NOT NULL DEFAULT false,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_records_account ON ai_call_records(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_campaign ON ai_call_records(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_contact ON ai_call_records(contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_status ON ai_call_records(status);

ALTER TABLE ai_call_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_call_records_select ON ai_call_records;
CREATE POLICY ai_call_records_select ON ai_call_records
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS ai_call_records_insert ON ai_call_records;
CREATE POLICY ai_call_records_insert ON ai_call_records
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS ai_call_records_update ON ai_call_records;
CREATE POLICY ai_call_records_update ON ai_call_records
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

-- ============================================================
-- WALLETS
-- ============================================================

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  reserved_cents INTEGER NOT NULL DEFAULT 0,
  used_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_account ON wallets(account_id);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallets_select ON wallets;
CREATE POLICY wallets_select ON wallets
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS wallets_insert ON wallets;
CREATE POLICY wallets_insert ON wallets
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS wallets_update ON wallets;
CREATE POLICY wallets_update ON wallets
  FOR UPDATE USING (is_account_member(account_id, 'admin'));

-- Wallet transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit_purchase','campaign_usage','ai_usage','voice_usage','refund','adjustment','subscription_payment')),
  amount_cents INTEGER NOT NULL,
  balance_before_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','refunded')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_account ON wallet_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(account_id, type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created ON wallet_transactions(created_at);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_transactions_select ON wallet_transactions;
CREATE POLICY wallet_transactions_select ON wallet_transactions
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS wallet_transactions_insert ON wallet_transactions;
CREATE POLICY wallet_transactions_insert ON wallet_transactions
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

-- ============================================================
-- PRICING RULES (configurable Meta rates)
-- ============================================================

CREATE TABLE IF NOT EXISTS pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('marketing','utility','authentication')),
  rate_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  destination TEXT NOT NULL DEFAULT 'IN',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, category, destination)
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_account ON pricing_rules(account_id);

ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_rules_select ON pricing_rules;
CREATE POLICY pricing_rules_select ON pricing_rules
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS pricing_rules_insert ON pricing_rules;
CREATE POLICY pricing_rules_insert ON pricing_rules
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS pricing_rules_update ON pricing_rules;
CREATE POLICY pricing_rules_update ON pricing_rules
  FOR UPDATE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS pricing_rules_delete ON pricing_rules;
CREATE POLICY pricing_rules_delete ON pricing_rules
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- SMART BROADCASTS (enhanced broadcasts)
-- ============================================================

CREATE TABLE IF NOT EXISTS smart_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  template_id UUID REFERENCES message_templates(id),
  template_category TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','paused','completed','failed')),
  audience_type TEXT NOT NULL DEFAULT 'all' CHECK (audience_type IN ('all','tags','segment','contacts','uploaded')),
  audience_config JSONB NOT NULL DEFAULT '{}',
  audience_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  variable_mapping JSONB NOT NULL DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_cost_cents INTEGER DEFAULT 0,
  actual_cost_cents INTEGER DEFAULT 0,
  meta_category TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_broadcasts_account ON smart_broadcasts(account_id);
CREATE INDEX IF NOT EXISTS idx_smart_broadcasts_status ON smart_broadcasts(account_id, status);

ALTER TABLE smart_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS smart_broadcasts_select ON smart_broadcasts;
CREATE POLICY smart_broadcasts_select ON smart_broadcasts
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS smart_broadcasts_insert ON smart_broadcasts;
CREATE POLICY smart_broadcasts_insert ON smart_broadcasts
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS smart_broadcasts_update ON smart_broadcasts;
CREATE POLICY smart_broadcasts_update ON smart_broadcasts
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS smart_broadcasts_delete ON smart_broadcasts;
CREATE POLICY smart_broadcasts_delete ON smart_broadcasts
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- KEYBOARD SHORTCUTS
-- ============================================================

CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action_key TEXT NOT NULL,
  shortcut TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, user_id, action_key)
);

CREATE INDEX IF NOT EXISTS idx_keyboard_shortcuts_user ON keyboard_shortcuts(user_id);

ALTER TABLE keyboard_shortcuts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS keyboard_shortcuts_select ON keyboard_shortcuts;
CREATE POLICY keyboard_shortcuts_select ON keyboard_shortcuts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS keyboard_shortcuts_insert ON keyboard_shortcuts;
CREATE POLICY keyboard_shortcuts_insert ON keyboard_shortcuts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS keyboard_shortcuts_update ON keyboard_shortcuts;
CREATE POLICY keyboard_shortcuts_update ON keyboard_shortcuts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS keyboard_shortcuts_delete ON keyboard_shortcuts;
CREATE POLICY keyboard_shortcuts_delete ON keyboard_shortcuts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- WORKFLOW TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- AUTOMATION EXECUTION LOGS (enhanced)
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL,
  workflow_type TEXT NOT NULL CHECK (workflow_type IN ('automation','flow','ai_followup')),
  execution_id UUID NOT NULL,
  node_id TEXT,
  node_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','skipped','waiting')),
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exec_logs_account ON automation_execution_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_exec_logs_workflow ON automation_execution_logs(workflow_id, workflow_type);
CREATE INDEX IF NOT EXISTS idx_exec_logs_execution ON automation_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_exec_logs_status ON automation_execution_logs(status);

ALTER TABLE automation_execution_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exec_logs_select ON automation_execution_logs;
CREATE POLICY exec_logs_select ON automation_execution_logs
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS exec_logs_insert ON automation_execution_logs;
CREATE POLICY exec_logs_insert ON automation_execution_logs
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- ============================================================
-- SEED default pricing rules for new accounts
-- ============================================================

CREATE OR REPLACE FUNCTION seed_default_pricing_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO pricing_rules (account_id, category, rate_cents, currency, destination, description) VALUES
    (NEW.id, 'marketing', 1100, 'IN', 'IN', 'India marketing template rate (per message)'),
    (NEW.id, 'utility', 500, 'IN', 'IN', 'India utility template rate (per message)'),
    (NEW.id, 'authentication', 300, 'IN', 'IN', 'India authentication template rate (per message)');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_pricing_rules ON accounts;
CREATE TRIGGER trg_seed_pricing_rules
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION seed_default_pricing_rules();

-- ============================================================
-- SEED default wallet for new accounts
-- ============================================================

CREATE OR REPLACE FUNCTION seed_default_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO wallets (account_id, balance_cents, currency) VALUES
    (NEW.id, 0, 'INR');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_wallet ON accounts;
CREATE TRIGGER trg_seed_wallet
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION seed_default_wallet();

-- ============================================================
-- Wallet balance update function (atomic)
-- ============================================================

CREATE OR REPLACE FUNCTION update_wallet_balance(
  p_wallet_id UUID,
  p_amount_cents INTEGER,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before INTEGER;
  v_balance_after INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Lock the wallet row
  SELECT balance_cents INTO v_balance_before
  FROM wallets
  WHERE id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  v_balance_after := v_balance_before + p_amount_cents;

  IF v_balance_after < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE wallets
  SET balance_cents = v_balance_after,
      updated_at = now()
  WHERE id = p_wallet_id;

  INSERT INTO wallet_transactions (
    account_id, wallet_id, type, amount_cents,
    balance_before_cents, balance_after_cents,
    reference_type, reference_id, description, created_by
  ) VALUES (
    (SELECT account_id FROM wallets WHERE id = p_wallet_id),
    p_wallet_id, p_type, p_amount_cents,
    v_balance_before, v_balance_after,
    p_reference_type, p_reference_id, p_description, p_created_by
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after
  );
END;
$$;

ALTER FUNCTION update_wallet_balance(UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION update_wallet_balance(UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- Increment automation execution counter (enhanced)
-- ============================================================

CREATE OR REPLACE FUNCTION increment_automation_execution(p_automation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE automations
  SET execution_count = execution_count + 1,
      last_executed_at = now()
  WHERE id = p_automation_id;
END;
$$;

ALTER FUNCTION increment_automation_execution(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION increment_automation_execution(UUID) TO authenticated, service_role;

-- ============================================================
-- Increment follow-up execution counter
-- ============================================================

CREATE OR REPLACE FUNCTION increment_followup_execution(p_followup_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_followups
  SET execution_count = execution_count + 1,
      last_executed_at = now()
  WHERE id = p_followup_id;
END;
$$;

ALTER FUNCTION increment_followup_execution(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION increment_followup_execution(UUID) TO authenticated, service_role;

COMMIT;
