-- ============================================================
-- 074: Threads and X (Twitter) integration support
-- ============================================================
-- 1. Widens conversations.platform CHECK to include 'threads' and 'x'
-- 2. Widens channel_integrations.platform CHECK to include 'threads' and 'x'
-- 3. Adds contacts.threads_user_id and contacts.x_user_id
-- 4. Creates social_oauth_states table for CSRF state validation
-- 5. Preserves all existing data and relationships
-- ============================================================

-- ── 1. Widen conversations.platform ──────────────────────────
DO $$
BEGIN
  ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS conversations_platform_check;

  ALTER TABLE conversations
    ADD CONSTRAINT conversations_platform_check
    CHECK (platform IN ('whatsapp', 'facebook', 'instagram', 'telegram', 'threads', 'x'));

  RAISE NOTICE '074: conversations.platform CHECK widened to include threads, x';
EXCEPTION WHEN others THEN
  RAISE NOTICE '074: conversations.platform CHECK update skipped: %', SQLERRM;
END $$;

-- ── 2. Widen channel_integrations.platform ───────────────────
DO $$
BEGIN
  ALTER TABLE channel_integrations
    DROP CONSTRAINT IF EXISTS channel_integrations_platform_check;

  ALTER TABLE channel_integrations
    ADD CONSTRAINT channel_integrations_platform_check
    CHECK (platform IN ('whatsapp', 'instagram', 'facebook', 'telegram', 'threads', 'x'));

  RAISE NOTICE '074: channel_integrations.platform CHECK widened to include threads, x';
EXCEPTION WHEN others THEN
  RAISE NOTICE '074: channel_integrations.platform CHECK update skipped: %', SQLERRM;
END $$;

-- ── 3. contacts.threads_user_id ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND column_name = 'threads_user_id'
  ) THEN
    ALTER TABLE contacts ADD COLUMN threads_user_id TEXT;
    RAISE NOTICE '074: Added contacts.threads_user_id';
  ELSE
    RAISE NOTICE '074: contacts.threads_user_id already exists, skipping';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_threads_user_id
  ON contacts (account_id, threads_user_id)
  WHERE threads_user_id IS NOT NULL;

-- ── 4. contacts.x_user_id ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND column_name = 'x_user_id'
  ) THEN
    ALTER TABLE contacts ADD COLUMN x_user_id TEXT;
    RAISE NOTICE '074: Added contacts.x_user_id';
  ELSE
    RAISE NOTICE '074: contacts.x_user_id already exists, skipping';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_x_user_id
  ON contacts (account_id, x_user_id)
  WHERE x_user_id IS NOT NULL;

-- ── 5. social_oauth_states — CSRF state store ─────────────────
-- Short-lived server-side state records for OAuth flows.
-- Supplements the HttpOnly cookie approach used by Meta OAuth
-- with a DB-backed record so the callback can validate state
-- even across load-balanced instances.
CREATE TABLE IF NOT EXISTS social_oauth_states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('threads', 'x')),
  state       TEXT NOT NULL UNIQUE,
  -- PKCE code verifier (X OAuth 2.0 only, stored encrypted)
  code_verifier TEXT,
  -- Where to redirect after successful OAuth
  return_to   TEXT NOT NULL DEFAULT '/integrations',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  -- States expire after 10 minutes
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_social_oauth_states_state
  ON social_oauth_states (state);

CREATE INDEX IF NOT EXISTS idx_social_oauth_states_account
  ON social_oauth_states (account_id, platform);

-- RLS: only the owning account can read/write state rows
ALTER TABLE social_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_oauth_states_select ON social_oauth_states
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY social_oauth_states_insert ON social_oauth_states
  FOR INSERT WITH CHECK (is_account_member(account_id));

CREATE POLICY social_oauth_states_delete ON social_oauth_states
  FOR DELETE USING (is_account_member(account_id));

-- ── Cleanup index for expired states ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_social_oauth_states_expires
  ON social_oauth_states (expires_at);
