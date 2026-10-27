-- =====================================================
-- CRM 3.0 - Missing Tables (SAFE VERSION)
-- Run this SQL in your Supabase SQL Editor
-- =====================================================

-- First, create the trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- TABLE 1: Experiments (A/B Testing)
-- =====================================================
CREATE TABLE IF NOT EXISTS crm3_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  metric TEXT NOT NULL DEFAULT 'conversion_rate',
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  winner_variant TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add constraint separately
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm3_experiments_status_check') THEN
    ALTER TABLE crm3_experiments ADD CONSTRAINT crm3_experiments_status_check 
    CHECK (status IN ('draft', 'running', 'paused', 'completed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm3_experiments_account ON crm3_experiments(account_id);
CREATE INDEX IF NOT EXISTS idx_crm3_experiments_status ON crm3_experiments(status);

DROP TRIGGER IF EXISTS update_crm3_experiments_updated_at ON crm3_experiments;
CREATE TRIGGER update_crm3_experiments_updated_at BEFORE UPDATE ON crm3_experiments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLE 2: Experiment Events
-- =====================================================
CREATE TABLE IF NOT EXISTS crm3_experiment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES crm3_experiments(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  variant TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm3_experiment_events_type_check') THEN
    ALTER TABLE crm3_experiment_events ADD CONSTRAINT crm3_experiment_events_type_check 
    CHECK (event_type IN ('exposure', 'conversion'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm3_experiment_events_experiment ON crm3_experiment_events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_crm3_experiment_events_account ON crm3_experiment_events(account_id);
CREATE INDEX IF NOT EXISTS idx_crm3_experiment_events_contact ON crm3_experiment_events(contact_id);

DROP INDEX IF EXISTS idx_crm3_experiment_events_unique_exposure;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm3_experiment_events_unique_exposure 
  ON crm3_experiment_events(experiment_id, contact_id, variant) 
  WHERE event_type = 'exposure';

-- =====================================================
-- TABLE 3: Media Assets
-- =====================================================
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'other',
  mime_type TEXT,
  size_bytes BIGINT,
  storage_url TEXT NOT NULL,
  thumbnail_url TEXT,
  alt_text TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_type_check') THEN
    ALTER TABLE media_assets ADD CONSTRAINT media_assets_type_check 
    CHECK (file_type IN ('image', 'video', 'document', 'audio', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_media_assets_account ON media_assets(account_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_type ON media_assets(file_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags ON media_assets USING GIN(tags);

DROP TRIGGER IF EXISTS update_media_assets_updated_at ON media_assets;
CREATE TRIGGER update_media_assets_updated_at BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLE 4: Knowledge Documents
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'draft',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_documents_category_check') THEN
    ALTER TABLE knowledge_documents ADD CONSTRAINT knowledge_documents_category_check 
    CHECK (category IN ('faq', 'guide', 'policy', 'product', 'support', 'general'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_documents_status_check') THEN
    ALTER TABLE knowledge_documents ADD CONSTRAINT knowledge_documents_status_check 
    CHECK (status IN ('draft', 'published', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_account ON knowledge_documents(account_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_category ON knowledge_documents(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status ON knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tags ON knowledge_documents USING GIN(tags);

DROP TRIGGER IF EXISTS update_knowledge_documents_updated_at ON knowledge_documents;
CREATE TRIGGER update_knowledge_documents_updated_at BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLE 5: Company Profiles
-- =====================================================
CREATE TABLE IF NOT EXISTS company_profiles (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  company_name TEXT,
  industry TEXT,
  company_size TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  phone TEXT,
  tax_id TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_company_profiles_updated_at ON company_profiles;
CREATE TRIGGER update_company_profiles_updated_at BEFORE UPDATE ON company_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLE 6: Billing Subscriptions
-- =====================================================
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_subscriptions_plan_check') THEN
    ALTER TABLE billing_subscriptions ADD CONSTRAINT billing_subscriptions_plan_check 
    CHECK (plan IN ('free', 'pro', 'enterprise'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_subscriptions_status_check') THEN
    ALTER TABLE billing_subscriptions ADD CONSTRAINT billing_subscriptions_status_check 
    CHECK (status IN ('active', 'past_due', 'canceled', 'trialing'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_account ON billing_subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status ON billing_subscriptions(status);

DROP TRIGGER IF EXISTS update_billing_subscriptions_updated_at ON billing_subscriptions;
CREATE TRIGGER update_billing_subscriptions_updated_at BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ✅ ALL DONE! Tables created successfully.
-- =====================================================
