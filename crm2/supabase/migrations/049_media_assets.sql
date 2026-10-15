-- 049_media_assets.sql
--
-- Registry for every media file an account uploads through
-- `uploadAccountMedia()` (src/lib/storage/upload-media.ts) — the shared
-- chokepoint used by the inbox composer, flows builder and template
-- header images. Storage buckets themselves are unindexed blobs keyed
-- only by path convention; this table gives the Media Library page
-- something to query (with RLS) instead of trying to LIST bucket
-- objects client-side.
--
-- Idempotent like 048: IF NOT EXISTS / policy drop-then-create so it can
-- be replayed against any environment safely.
--
-- Tables:
--   media_assets      one row per uploaded storage object
--
-- Conventions mirror migrations 045-048:
--   - uuid PKs with DEFAULT gen_random_uuid()
--   - account_id FK -> accounts(id) ON DELETE CASCADE
--   - RLS via is_account_member()/is_super_admin() helpers
--   - GRANTs: authenticated CRUD where allowed, anon SELECT none
--   - audit_log entry recording the structural change

-- ---------------------------------------------------------------------------
-- media_assets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  bucket      TEXT NOT NULL,
  path        TEXT NOT NULL,
  public_url  TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL DEFAULT '',
  size_bytes  BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  -- image | video | audio | document (derived client-side from MIME)
  kind        TEXT NOT NULL DEFAULT 'document'
              CHECK (kind IN ('image','video','audio','document')),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, bucket, path)
);

CREATE INDEX IF NOT EXISTS idx_media_assets_account_created
  ON public.media_assets (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_account_kind
  ON public.media_assets (account_id, kind);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Members of the account can see their own media; super admins can audit.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'media_assets'
      AND policyname = 'media_assets_select_account_or_super'
  ) THEN
    CREATE POLICY media_assets_select_account_or_super
      ON public.media_assets FOR SELECT
      USING (
        is_account_member(account_id, 'viewer')
        OR is_super_admin()
      );
  END IF;

  -- Anyone who can upload through the app (agents included) registers
  -- their upload here; the insert is written by that same member.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'media_assets'
      AND policyname = 'media_assets_insert_account_member'
  ) THEN
    CREATE POLICY media_assets_insert_account_member
      ON public.media_assets FOR INSERT
      WITH CHECK (is_account_member(account_id, 'agent'));
  END IF;

  -- Deleting the registry row is an admin action (the library page also
  -- removes the underlying storage object through the same RLS-scoped
  -- storage policies).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'media_assets'
      AND policyname = 'media_assets_delete_account_admin'
  ) THEN
    CREATE POLICY media_assets_delete_account_admin
      ON public.media_assets FOR DELETE
      USING (is_account_member(account_id, 'admin'));
  END IF;
END $$;

GRANT SELECT, INSERT, DELETE ON public.media_assets TO authenticated;
REVOKE ALL ON public.media_assets FROM anon;

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
INSERT INTO public.audit_log (actor_email, action, resource_type, details)
VALUES ('migration', 'create_table', 'schema',
        jsonb_build_object('table', 'media_assets', 'migration', '049'))
ON CONFLICT DO NOTHING;
