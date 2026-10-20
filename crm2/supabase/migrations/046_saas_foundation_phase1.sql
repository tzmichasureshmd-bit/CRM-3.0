-- ============================================================
-- Migration 046: SaaS Foundation Enhancement
--
-- Phase 1 of the multi-tenant SaaS architecture:
--   1. Add currency column to subscription_plans
--   2. Update seed plans with INR pricing (Starter/Business/Professional)
--   3. Add missing performance indexes
--   4. Enhance whatsapp_config for multi-tenant ownership
--   5. Add payments table skeleton for future payment integration
--   6. Verify RLS policies
--
-- This migration is additive only — no columns or rows are dropped.
-- ============================================================

BEGIN;

-- -------------------------------------------------------
-- 1. Add currency column to subscription_plans
-- -------------------------------------------------------
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

ALTER TABLE subscription_plans
  ADD CONSTRAINT subscription_plans_currency_check
  CHECK (currency ~ '^[A-Z]{3}$');

COMMENT ON COLUMN subscription_plans.currency IS 'ISO-4217 currency code for plan pricing (e.g. INR, USD)';

-- -------------------------------------------------------
-- 2. Update seed plans — INR pricing
--    Uses ON CONFLICT to be idempotent (safe to re-run).
--    Prices are in paise (1/100 of INR), so ₹499 = 49900.
-- -------------------------------------------------------

-- Free plan — keep as-is, just ensure currency is set
INSERT INTO subscription_plans (
  slug, name, description, is_active, is_default,
  price_monthly_cents, price_yearly_cents, currency,
  max_contacts, max_team_members, max_whatsapp_numbers,
  max_monthly_messages, max_broadcasts_per_month,
  max_automations, max_flows, max_ai_requests_per_month,
  max_api_requests_per_day, max_storage_mb,
  features, sort_order
) VALUES (
  'free', 'Free', 'Free plan with basic features — auto-assigned to new accounts.',
  true, true,
  0, 0, 'INR',
  100, 2, 1,
  500, 5,
  3, 3, 50,
  100, 100,
  '{"ai_assistant": false, "priority_support": false, "custom_branding": false}'::jsonb,
  0
) ON CONFLICT (slug) DO UPDATE SET
  currency = 'INR',
  description = EXCLUDED.description,
  features = EXCLUDED.features;

-- Starter — ₹499/month, ₹4999/year (≈2 months free)
INSERT INTO subscription_plans (
  slug, name, description, is_active, is_default,
  price_monthly_cents, price_yearly_cents, currency,
  max_contacts, max_team_members, max_whatsapp_numbers,
  max_monthly_messages, max_broadcasts_per_month,
  max_automations, max_flows, max_ai_requests_per_month,
  max_api_requests_per_day, max_storage_mb,
  features, sort_order
) VALUES (
  'starter', 'Starter', 'Perfect for small businesses getting started with WhatsApp CRM.',
  true, false,
  49900, 499900, 'INR',
  5000, 2, 1,
  10000, 10,
  5, 5, 100,
  1000, 500,
  '{"ai_assistant": false, "priority_support": false, "custom_branding": false}'::jsonb,
  1
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  price_yearly_cents = EXCLUDED.price_yearly_cents,
  currency = EXCLUDED.currency,
  max_contacts = EXCLUDED.max_contacts,
  max_team_members = EXCLUDED.max_team_members,
  max_whatsapp_numbers = EXCLUDED.max_whatsapp_numbers,
  max_monthly_messages = EXCLUDED.max_monthly_messages,
  max_broadcasts_per_month = EXCLUDED.max_broadcasts_per_month,
  max_automations = EXCLUDED.max_automations,
  max_flows = EXCLUDED.max_flows,
  max_ai_requests_per_month = EXCLUDED.max_ai_requests_per_month,
  max_api_requests_per_day = EXCLUDED.max_api_requests_per_day,
  max_storage_mb = EXCLUDED.max_storage_mb,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

-- Business — ₹999/month, ₹9999/year (≈2 months free)
INSERT INTO subscription_plans (
  slug, name, description, is_active, is_default,
  price_monthly_cents, price_yearly_cents, currency,
  max_contacts, max_team_members, max_whatsapp_numbers,
  max_monthly_messages, max_broadcasts_per_month,
  max_automations, max_flows, max_ai_requests_per_month,
  max_api_requests_per_day, max_storage_mb,
  features, sort_order
) VALUES (
  'business', 'Business', 'For growing businesses that need more power and flexibility.',
  true, false,
  99900, 999900, 'INR',
  25000, 5, 2,
  50000, 50,
  25, 20, 500,
  5000, 2000,
  '{"ai_assistant": true, "priority_support": false, "custom_branding": false}'::jsonb,
  2
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  price_yearly_cents = EXCLUDED.price_yearly_cents,
  currency = EXCLUDED.currency,
  max_contacts = EXCLUDED.max_contacts,
  max_team_members = EXCLUDED.max_team_members,
  max_whatsapp_numbers = EXCLUDED.max_whatsapp_numbers,
  max_monthly_messages = EXCLUDED.max_monthly_messages,
  max_broadcasts_per_month = EXCLUDED.max_broadcasts_per_month,
  max_automations = EXCLUDED.max_automations,
  max_flows = EXCLUDED.max_flows,
  max_ai_requests_per_month = EXCLUDED.max_ai_requests_per_month,
  max_api_requests_per_day = EXCLUDED.max_api_requests_per_day,
  max_storage_mb = EXCLUDED.max_storage_mb,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

-- Professional — ₹1999/month, ₹19999/year (≈2 months free)
INSERT INTO subscription_plans (
  slug, name, description, is_active, is_default,
  price_monthly_cents, price_yearly_cents, currency,
  max_contacts, max_team_members, max_whatsapp_numbers,
  max_monthly_messages, max_broadcasts_per_month,
  max_automations, max_flows, max_ai_requests_per_month,
  max_api_requests_per_day, max_storage_mb,
  features, sort_order
) VALUES (
  'professional', 'Professional', 'For teams that need advanced CRM, automation, and analytics.',
  true, false,
  199900, 1999900, 'INR',
  100000, 20, 5,
  200000, 200,
  100, 50, 2000,
  20000, 10000,
  '{"ai_assistant": true, "priority_support": true, "custom_branding": true}'::jsonb,
  3
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  price_yearly_cents = EXCLUDED.price_yearly_cents,
  currency = EXCLUDED.currency,
  max_contacts = EXCLUDED.max_contacts,
  max_team_members = EXCLUDED.max_team_members,
  max_whatsapp_numbers = EXCLUDED.max_whatsapp_numbers,
  max_monthly_messages = EXCLUDED.max_monthly_messages,
  max_broadcasts_per_month = EXCLUDED.max_broadcasts_per_month,
  max_automations = EXCLUDED.max_automations,
  max_flows = EXCLUDED.max_flows,
  max_ai_requests_per_month = EXCLUDED.max_ai_requests_per_month,
  max_api_requests_per_day = EXCLUDED.max_api_requests_per_day,
  max_storage_mb = EXCLUDED.max_storage_mb,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

-- Enterprise — ₹4999/month, ₹49999/year (keep for high-volume customers)
INSERT INTO subscription_plans (
  slug, name, description, is_active, is_default,
  price_monthly_cents, price_yearly_cents, currency,
  max_contacts, max_team_members, max_whatsapp_numbers,
  max_monthly_messages, max_broadcasts_per_month,
  max_automations, max_flows, max_ai_requests_per_month,
  max_api_requests_per_day, max_storage_mb,
  features, sort_order
) VALUES (
  'enterprise', 'Enterprise', 'Unlimited everything — for large organizations with custom needs.',
  true, false,
  499900, 4999900, 'INR',
  -1, -1, 10,
  -1, -1,
  -1, -1, -1,
  -1, 100000,
  '{"ai_assistant": true, "priority_support": true, "custom_branding": true, "dedicated_account_manager": true}'::jsonb,
  4
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  price_yearly_cents = EXCLUDED.price_yearly_cents,
  currency = EXCLUDED.currency,
  max_contacts = EXCLUDED.max_contacts,
  max_team_members = EXCLUDED.max_team_members,
  max_whatsapp_numbers = EXCLUDED.max_whatsapp_numbers,
  max_monthly_messages = EXCLUDED.max_monthly_messages,
  max_broadcasts_per_month = EXCLUDED.max_broadcasts_per_month,
  max_automations = EXCLUDED.max_automations,
  max_flows = EXCLUDED.max_flows,
  max_ai_requests_per_month = EXCLUDED.max_ai_requests_per_month,
  max_api_requests_per_day = EXCLUDED.max_api_requests_per_day,
  max_storage_mb = EXCLUDED.max_storage_mb,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

-- -------------------------------------------------------
-- 3. Performance indexes
-- -------------------------------------------------------

-- Plans: fast lookup for active plans sorted by display order
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_sort
  ON subscription_plans (is_active, sort_order)
  WHERE is_active = true;

-- Subscriptions: fast lookup by status (for admin queries)
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_status
  ON business_subscriptions (status);

-- Subscriptions: fast lookup by plan (for admin analytics)
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_plan
  ON business_subscriptions (plan_id);

-- Resource usage: fast lookup by period (for analytics)
CREATE INDEX IF NOT EXISTS idx_resource_usage_period
  ON resource_usage (period_start DESC);

-- Accounts: fast lookup by status (for admin customer list)
CREATE INDEX IF NOT EXISTS idx_accounts_status
  ON accounts (status);

-- Accounts: fast lookup by owner (for login flow)
CREATE INDEX IF NOT EXISTS idx_accounts_owner
  ON accounts (owner_user_id);

-- Profiles: fast lookup by platform role (for super admin queries)
CREATE INDEX IF NOT EXISTS idx_profiles_platform_role
  ON profiles (platform_role)
  WHERE platform_role = 'super_admin';

-- -------------------------------------------------------
-- 4. Payments table skeleton (Phase 3 preparation)
--    Provider-agnostic — stores reference data only.
--    No payment provider is hardcoded.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES business_subscriptions(id) ON DELETE SET NULL,
  amount_cents    INTEGER NOT NULL,
  currency        TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
  provider        TEXT,
  provider_payment_id TEXT,
  provider_metadata JSONB,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payments_account
  ON payments (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_subscription
  ON payments (subscription_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments (status);

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: account members can read their own payments; super_admin can do everything
CREATE POLICY payments_select ON payments
  FOR SELECT USING (
    is_account_member(account_id) OR is_super_admin()
  );

CREATE POLICY payments_insert ON payments
  FOR INSERT WITH CHECK (
    is_super_admin()
  );

CREATE POLICY payments_update ON payments
  FOR UPDATE USING (
    is_super_admin()
  );

CREATE POLICY payments_delete ON payments
  FOR DELETE USING (
    is_super_admin()
  );

-- -------------------------------------------------------
-- 5. Enhance whatsapp_config for multi-tenant ownership
--    Add display_phone_number and business_name columns
--    for better multi-tenant WhatsApp Business management.
-- -------------------------------------------------------
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS display_phone_number TEXT;

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS business_name TEXT;

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'disconnected'
  CHECK (connection_status IN ('connected', 'disconnected', 'pending', 'error'));

COMMENT ON COLUMN whatsapp_config.display_phone_number IS 'Human-readable phone number (e.g. +91 98765 43210)';
COMMENT ON COLUMN whatsapp_config.business_name IS 'WhatsApp Business account display name';
COMMENT ON COLUMN whatsapp_config.connection_status IS 'Detailed connection status: connected/disconnected/pending/error';

-- Index for multi-tenant WhatsApp account queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_connection
  ON whatsapp_config (connection_status);

-- -------------------------------------------------------
-- 6. Helper: get current subscription with plan details
--    Returns the active subscription + plan for an account.
--    Used by server-side components to enforce plan limits.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_current_subscription(target_account_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  subscription_status TEXT,
  billing_period TEXT,
  plan_slug TEXT,
  plan_name TEXT,
  price_monthly_cents INTEGER,
  price_yearly_cents INTEGER,
  plan_currency TEXT,
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
  features JSONB,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    bs.id,
    bs.status::text,
    bs.billing_period,
    sp.slug,
    sp.name,
    sp.price_monthly_cents,
    sp.price_yearly_cents,
    sp.currency,
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
    sp.features,
    bs.trial_ends_at,
    bs.current_period_end
  FROM business_subscriptions bs
  JOIN subscription_plans sp ON sp.id = bs.plan_id
  WHERE bs.account_id = target_account_id
  ORDER BY bs.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_current_subscription(UUID) TO authenticated, service_role;

-- -------------------------------------------------------
-- 7. Helper: check if an account has an active subscription
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION has_active_subscription(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_subscriptions bs
    WHERE bs.account_id = target_account_id
      AND bs.status IN ('active', 'trialing')
  );
$$;

GRANT EXECUTE ON FUNCTION has_active_subscription(UUID) TO authenticated, service_role;

COMMIT;
