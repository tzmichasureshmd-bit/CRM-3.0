-- ============================================================
-- 040_profiles_grants.sql
--
-- Restores missing table-level GRANTs for the `profiles` table.
--
-- Root cause: migration 017 rewrote every RLS policy on every
-- table but never included explicit GRANT statements.  In
-- Supabase the default schema grants (GRANT SELECT ON ALL
-- TABLES IN SCHEMA public TO authenticated) are applied at
-- project creation time; tables created or recreated by
-- migrations after that point can silently lose those grants
-- if the schema was dropped or the grants were not re-applied.
--
-- The symptom is the exact error seen in production:
--
--   403  code 42501  permission denied for table profiles
--
-- The authenticated role can reach the table (RLS is enabled)
-- but has no SELECT privilege, so Postgres rejects every query
-- before the RLS policy is even evaluated.
--
-- This migration is idempotent: IF NOT EXISTS on the grants
-- is not supported by GRANT, so we use DO blocks with
-- exception handling to make it safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name   = 'profiles'
      AND privilege_type = 'SELECT'
  ) THEN
    GRANT SELECT ON public.profiles TO authenticated;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '040: failed to GRANT SELECT on profiles to authenticated: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name   = 'profiles'
      AND privilege_type = 'UPDATE'
  ) THEN
    GRANT UPDATE ON public.profiles TO authenticated;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '040: failed to GRANT UPDATE on profiles to authenticated: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name   = 'profiles'
      AND privilege_type = 'INSERT'
  ) THEN
    GRANT INSERT ON public.profiles TO authenticated;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '040: failed to GRANT INSERT on profiles to authenticated: %', SQLERRM;
END $$;