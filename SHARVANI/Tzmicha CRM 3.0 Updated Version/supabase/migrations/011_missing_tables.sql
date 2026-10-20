-- ============================================================
-- Migration 011: Missing tables — API Keys & Knowledge Documents
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── API Keys (Security settings page) ────────────────────────
CREATE TABLE IF NOT EXISTS crm3_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  key_prefix   text NOT NULL,                    -- e.g. "sk-live-xxxx" (first 12 chars shown)
  key_hash     text NOT NULL,                    -- bcrypt/sha256 of full key
  last_used_at timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm3_api_keys_account_idx ON crm3_api_keys(account_id);
CREATE INDEX IF NOT EXISTS crm3_api_keys_user_idx    ON crm3_api_keys(user_id);

ALTER TABLE crm3_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_api_keys_rls ON crm3_api_keys;
CREATE POLICY crm3_api_keys_rls ON crm3_api_keys
  USING (account_id = get_my_account_id());

-- ── Knowledge Documents (RAG / AI Knowledge Base) ─────────────
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title        text NOT NULL,
  content      text NOT NULL,
  source_url   text,
  doc_type     text NOT NULL DEFAULT 'text' CHECK (doc_type IN ('text','pdf','url','faq','product')),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','indexed','failed')),
  chunk_count  integer NOT NULL DEFAULT 0,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_docs_account_idx ON knowledge_documents(account_id);
CREATE INDEX IF NOT EXISTS knowledge_docs_status_idx  ON knowledge_documents(account_id, status);

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_docs_rls ON knowledge_documents;
CREATE POLICY knowledge_docs_rls ON knowledge_documents
  USING (account_id = get_my_account_id());

-- ── Knowledge Chunks (pgvector embeddings) ────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  document_id  uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index  integer NOT NULL,
  content      text NOT NULL,
  embedding    vector(1536),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_idx     ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_account_idx ON knowledge_chunks(account_id);

-- Vector similarity index (IVFFlat — fast approximate search)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'knowledge_chunks' AND indexname = 'knowledge_chunks_embedding_idx'
  ) THEN
    CREATE INDEX knowledge_chunks_embedding_idx
      ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_chunks_rls ON knowledge_chunks;
CREATE POLICY knowledge_chunks_rls ON knowledge_chunks
  USING (account_id = get_my_account_id());
