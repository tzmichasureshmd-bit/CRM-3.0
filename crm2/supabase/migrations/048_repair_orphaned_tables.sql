-- ============================================================
-- 048_repair_orphaned_tables.sql
--
-- Recreates tables that application code depends on but which were
-- lost from the shipped migration history (files 030–034 are missing:
-- the AI-assistant and webhook-endpoint migrations referenced from
-- CHANGELOG.md and .env.local.example never made it into this copy).
--
-- Against a fresh deployment the missing tables made these features
-- fail at runtime:
--   * /api/v1/webhooks + src/lib/webhooks/deliver.ts  → webhook_endpoints
--   * AI assistant config / usage log / knowledge base → ai_configs,
--     ai_usage_log, ai_knowledge_documents, ai_knowledge_chunks
--
-- Everything here is idempotent (IF NOT EXISTS / OR REPLACE) so it is
-- safe to run against databases that already have some or all of the
-- objects (e.g. projects where the original 030–032 files were applied
-- before being lost).
--
-- RLS follows the platform conventions:
--   * account-scoped reads via is_account_member(account_id)
--   * admin-gated writes where the feature is settings-class
--   * service_role bypasses RLS and is used by server routes/engine
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. pgvector (optional dependency for semantic knowledge search)
-- ──────────────────────────────────────────────────────────────
-- Supabase ships the extension; wrap in DO blocks so local Postgres
-- without pgvector can still apply the rest of the migration.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgvector unavailable — semantic KB search will be disabled (lexical FTS still works)';
END
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. webhook_endpoints — outbound customer webhooks (/api/v1)
-- ──────────────────────────────────────────────────────────────
-- Columns mirror src/lib/webhooks/endpoints.ts WEBHOOK_PUBLIC_COLUMNS
-- and the INSERT shape in /api/v1/webhooks/route.ts. The signing
-- secret is stored AES-256-GCM encrypted (see encryption.ts).

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  url              TEXT NOT NULL,
  -- AES-256-GCM ciphertext; never returned after creation.
  secret           TEXT NOT NULL,
  events           TEXT[] NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  failure_count    INTEGER NOT NULL DEFAULT 0,
  last_delivery_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_account
  ON webhook_endpoints(account_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_account_active
  ON webhook_endpoints(account_id) WHERE is_active = TRUE;

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_endpoints_select ON webhook_endpoints;
CREATE POLICY webhook_endpoints_select ON webhook_endpoints
  FOR SELECT USING (
    is_account_member(account_id) OR is_super_admin()
  );

DROP POLICY IF EXISTS webhook_endpoints_insert ON webhook_endpoints;
CREATE POLICY webhook_endpoints_insert ON webhook_endpoints
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'admin')
  );

DROP POLICY IF EXISTS webhook_endpoints_update ON webhook_endpoints;
CREATE POLICY webhook_endpoints_update ON webhook_endpoints
  FOR UPDATE USING (
    is_account_member(account_id, 'admin')
  );

DROP POLICY IF EXISTS webhook_endpoints_delete ON webhook_endpoints;
CREATE POLICY webhook_endpoints_delete ON webhook_endpoints
  FOR DELETE USING (
    is_account_member(account_id, 'admin')
  );

-- Atomic failure-counter used by src/lib/webhooks/deliver.ts.
-- Read-modify-write from concurrent deliveries loses increments, so
-- the increment + auto-disable threshold must be a single SQL step.

CREATE OR REPLACE FUNCTION record_webhook_failure(
  endpoint_id UUID,
  max_failures INTEGER DEFAULT 15
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE webhook_endpoints
  SET failure_count = failure_count + 1,
      is_active = CASE
        WHEN failure_count + 1 >= max_failures THEN FALSE
        ELSE is_active
      END
  WHERE id = endpoint_id;
$$;

ALTER FUNCTION record_webhook_failure(UUID, INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION record_webhook_failure(UUID, INTEGER)
  TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────
-- 3. ai_configs — per-account BYO-key AI assistant configuration
-- ──────────────────────────────────────────────────────────────
-- Column contract: src/lib/ai/config.ts CONFIG_COLUMNS and the
-- insert/update shapes in /api/ai/config/route.ts. api_key and
-- embeddings_api_key hold AES-256-GCM ciphertext.

CREATE TABLE IF NOT EXISTS ai_configs (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id                      UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  created_by                      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider                        TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model                           TEXT NOT NULL,
  api_key                         TEXT,
  system_prompt                   TEXT,
  is_active                       BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reply_enabled              BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reply_max_per_conversation INTEGER NOT NULL DEFAULT 5 CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 50),
  handoff_agent_id                UUID REFERENCES profiles(user_id) ON DELETE SET NULL,
  embeddings_api_key              TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_configs_select ON ai_configs;
CREATE POLICY ai_configs_select ON ai_configs
  FOR SELECT USING (
    is_account_member(account_id, 'admin')
  );

DROP POLICY IF EXISTS ai_configs_insert ON ai_configs;
CREATE POLICY ai_configs_insert ON ai_configs
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'admin')
  );

DROP POLICY IF EXISTS ai_configs_update ON ai_configs;
CREATE POLICY ai_configs_update ON ai_configs
  FOR UPDATE USING (
    is_account_member(account_id, 'admin')
  );

DROP POLICY IF EXISTS ai_configs_delete ON ai_configs;
CREATE POLICY ai_configs_delete ON ai_configs
  FOR DELETE USING (
    is_account_member(account_id, 'admin')
  );

-- ──────────────────────────────────────────────────────────────
-- 4. ai_usage_log — one row per LLM call (token accounting)
-- ──────────────────────────────────────────────────────────────
-- Contract: src/lib/ai/usage.ts logAiUsage() insert + /api/ai/usage
-- aggregates (grouped by day/mode/provider/model over created_at).
-- No authenticated INSERT policy by design — writes go through the
-- service-role client so usage logging never depends on caller role.

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  mode             TEXT NOT NULL CHECK (mode IN ('auto_reply', 'draft')),
  provider         TEXT NOT NULL,
  model            TEXT NOT NULL,
  prompt_tokens    INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_account_created
  ON ai_usage_log(account_id, created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_log_select ON ai_usage_log;
CREATE POLICY ai_usage_log_select ON ai_usage_log
  FOR SELECT USING (
    is_account_member(account_id, 'admin')
  );

-- ──────────────────────────────────────────────────────────────
-- 5. ai_knowledge_documents + ai_knowledge_chunks
-- ──────────────────────────────────────────────────────────────
-- Contracts: /api/ai/knowledge* routes (documents: id/title/content/
-- created_by/updated_at; chunks inserted by lib/ai/knowledge.ts) and
-- the retrieval RPCs match_ai_knowledge_semantic / match_ai_knowledge_fts
-- called from retrieveKnowledge(). Chunks carry their own account_id
-- (denormalized on purpose — the semantic RPC filters without a join).

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_docs_account
  ON ai_knowledge_documents(account_id);

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  -- Lexical search index (generated — always in sync with content).
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  -- Optional semantic vector; text-embedding-3-small = 1536 dims.
  embedding   VECTOR(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_account
  ON ai_knowledge_chunks(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_tsv
  ON ai_knowledge_chunks USING GIN (content_tsv);

-- Cosine-similarity index only applies when pgvector is present.
DO $$
BEGIN
  CREATE INDEX idx_ai_knowledge_chunks_embedding
    ON ai_knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'ivfflat index skipped (pgvector unavailable?)';
END
$$;

ALTER TABLE ai_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_knowledge_documents_select ON ai_knowledge_documents;
CREATE POLICY ai_knowledge_documents_select ON ai_knowledge_documents
  FOR SELECT USING (
    is_account_member(account_id) OR is_super_admin()
  );

DROP POLICY IF EXISTS ai_knowledge_documents_insert ON ai_knowledge_documents;
CREATE POLICY ai_knowledge_documents_insert ON ai_knowledge_documents
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'admin')
  );

DROP POLICY IF EXISTS ai_knowledge_documents_update ON ai_knowledge_documents;
CREATE POLICY ai_knowledge_documents_update ON ai_knowledge_documents
  FOR UPDATE USING (
    is_account_member(account_id, 'admin')
  );

DROP POLICY IF EXISTS ai_knowledge_documents_delete ON ai_knowledge_documents;
CREATE POLICY ai_knowledge_documents_delete ON ai_knowledge_documents
  FOR DELETE USING (
    is_account_member(account_id, 'admin')
  );

-- Chunks are written/read through the parent's policies via the
-- service role (ingest) and the RPCs below; keep an account-member
-- SELECT policy so dashboards can count rows under RLS.

DROP POLICY IF EXISTS ai_knowledge_chunks_select ON ai_knowledge_chunks;
CREATE POLICY ai_knowledge_chunks_select ON ai_knowledge_chunks
  FOR SELECT USING (
    is_account_member(account_id) OR is_super_admin()
  );

-- Semantic retrieval: cosine-nearest chunks for one account.
CREATE OR REPLACE FUNCTION match_ai_knowledge_semantic(
  p_account_id UUID,
  p_query_embedding VECTOR(1536),
  p_match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id      UUID,
  content TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.content
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT LEAST(GREATEST(p_match_count, 1), 50);
$$;

ALTER FUNCTION match_ai_knowledge_semantic(UUID, VECTOR(1536), INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION match_ai_knowledge_semantic(UUID, VECTOR(1536), INTEGER)
  TO authenticated, service_role;

-- Lexical top-up / fallback path.
CREATE OR REPLACE FUNCTION match_ai_knowledge_fts(
  p_account_id UUID,
  p_query TEXT,
  p_match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id      UUID,
  content TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.content
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND c.content_tsv @@ websearch_to_tsquery('english', p_query)
  ORDER BY ts_rank(c.content_tsv, websearch_to_tsquery('english', p_query)) DESC
  LIMIT LEAST(GREATEST(p_match_count, 1), 50);
$$;

ALTER FUNCTION match_ai_knowledge_fts(UUID, TEXT, INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION match_ai_knowledge_fts(UUID, TEXT, INTEGER)
  TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────
-- 6. Standard grants (matches 041 default-grant posture)
-- ──────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_endpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_configs TO authenticated;
GRANT SELECT ON ai_usage_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_knowledge_documents TO authenticated;
GRANT SELECT ON ai_knowledge_chunks TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 7. Audit trail entry
-- ──────────────────────────────────────────────────────────────

INSERT INTO audit_log (actor_email, action, resource_type, details)
VALUES (
  'system@migration-048',
  'ORPHANED_TABLES_REPAIRED',
  'platform',
  jsonb_build_object(
    'migration', '048',
    'tables', jsonb_build_array(
      'webhook_endpoints',
      'ai_configs',
      'ai_usage_log',
      'ai_knowledge_documents',
      'ai_knowledge_chunks'
    ),
    'functions', jsonb_build_array(
      'record_webhook_failure',
      'match_ai_knowledge_semantic',
      'match_ai_knowledge_fts'
    )
  )
);
