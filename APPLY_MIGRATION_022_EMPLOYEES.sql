-- ============================================================
-- Migration 022 — Employees, RBAC, Invitations, Audit Logs
-- Run this in Supabase SQL Editor to activate team access
-- Idempotent — safe to run multiple times
-- ============================================================

-- ── Employees ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id                  uuid,
  name                     text NOT NULL,
  email                    text NOT NULL,
  role                     text NOT NULL DEFAULT 'agent'
                             CHECK (role IN ('owner','admin','manager','sales','support','marketing','agent')),
  channel_permissions      jsonb NOT NULL DEFAULT '{"whatsapp":true,"instagram":true,"facebook":true,"email":true,"telegram":true}',
  can_view_conversations   boolean NOT NULL DEFAULT true,
  can_reply_messages       boolean NOT NULL DEFAULT true,
  can_manage_contacts      boolean NOT NULL DEFAULT false,
  can_assign_conversations boolean NOT NULL DEFAULT false,
  can_access_reports       boolean NOT NULL DEFAULT false,
  can_manage_integrations  boolean NOT NULL DEFAULT false,
  can_invite_employees     boolean NOT NULL DEFAULT false,
  can_view_audit_logs      boolean NOT NULL DEFAULT false,
  is_active                boolean NOT NULL DEFAULT true,
  invited_at               timestamptz NOT NULL DEFAULT now(),
  joined_at                timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, email)
);
CREATE INDEX IF NOT EXISTS employees_account_idx ON employees(account_id);
CREATE INDEX IF NOT EXISTS employees_user_idx    ON employees(user_id) WHERE user_id IS NOT NULL;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employees_rls ON employees;
CREATE POLICY employees_rls ON employees USING (account_id = get_my_account_id());

-- ── Employee Invitations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         text NOT NULL DEFAULT 'agent',
  token_hash   text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by   uuid,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_account_idx ON employee_invitations(account_id);
CREATE INDEX IF NOT EXISTS invitations_token_idx   ON employee_invitations(token_hash);
ALTER TABLE employee_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitations_rls ON employee_invitations;
CREATE POLICY invitations_rls ON employee_invitations USING (account_id = get_my_account_id());

-- ── Audit Logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actor_type   text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user','system','integration','ai_agent')),
  actor_id     uuid,
  actor_name   text,
  action       text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  result       text NOT NULL DEFAULT 'success' CHECK (result IN ('success','failure','denied')),
  metadata     jsonb DEFAULT '{}',
  ip_address   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_account_idx ON audit_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_actor_idx   ON audit_logs(actor_id);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_rls ON audit_logs;
CREATE POLICY audit_rls ON audit_logs USING (account_id = get_my_account_id());

-- ── Super admin + conversation assignment ────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS conv_employee_idx ON conversations(assigned_employee_id) WHERE assigned_employee_id IS NOT NULL;

-- ============================================================
-- DONE! Team access system is now active.
-- Go to: https://crm3.tzmicha.com/settings/team
-- ============================================================
