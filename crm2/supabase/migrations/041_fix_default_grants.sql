-- ============================================================
-- 041_fix_default_grants.sql
--
-- Restores the Supabase "default" grants that were missing from the
-- database, causing 500 errors on /api/whatsapp/config:1.
--
-- Root cause: migrations 001–040 created / altered tables but never
-- included explicit GRANT statements. In a standard Supabase project
-- the platform applies default grants at provisioning time
-- (GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
--  GRANT SELECT/INSERT/UPDATE/DELETE … TO authenticated, anon).
-- Those defaults are lost when the schema is dropped or tables are
-- recreated by migrations that run with a role that strips grants.
--
-- Migration 040 only restored SELECT/UPDATE/INSERT on `profiles` →
-- `authenticated`. Every other table (accounts, whatsapp_config,
-- contacts, etc.) and the `service_role` itself were still locked
-- out. The symptom:
--
--   service_role:  "permission denied for table profiles"  (and
--                  accounts, whatsapp_config, …) — the admin client
--                  in src/app/api/whatsapp/config/route.ts throws
--                  or returns errors, and resolveAccountId() could
--                  not create/link accounts.
--
--   authenticated: same "permission denied" on every table except
--                  profiles — the GET /api/whatsapp/config query
--                  against whatsapp_config failed outright.
--
-- Fix: bulk-grant the standard Supabase defaults to both roles,
-- plus ALTER DEFAULT PRIVILEGES so future tables are covered
-- automatically.
--
-- Idempotent — each GRANT/ALTER is wrapped in a DO block with
-- exception handling.
-- ============================================================

-- ============================================================
-- 1.  Ensure service_role owns and has ALL privileges.
-- ============================================================
-- The service role is the "god mode" key used only server-side
-- (webhooks, route helpers). It must bypass RLS on every table.
-- ============================================================

DO $$
BEGIN
  -- All existing tables, views, sequences, functions
  -- (TABLES covers views in Postgres' permission model)
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
  GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
  -- Schema usage
  GRANT USAGE, CREATE ON SCHEMA public TO service_role;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to grant ALL on existing objects to service_role: %', SQLERRM;
END $$;

-- Default privileges for objects created by FUTURE migrations.
-- Postgres only applies default privileges for the role that runs
-- the CREATE, so we set them while logged in as the migration
-- runner (typically `postgres` / `supabase_admin`).
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO service_role;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to set default privileges for service_role: %', SQLERRM;
END $$;

-- ============================================================
-- 2.  Grant authenticated the standard CRUD privileges.
-- ============================================================
-- RLS policies (added in migration 017) control *which rows* the
-- authenticated role can touch. But table-level privileges must
-- still exist — Postgres checks GRANT before evaluating RLS, so a
-- missing GRANT yields "permission denied" before the policy even
-- runs.
-- ============================================================

DO $$
BEGIN
  GRANT USAGE ON SCHEMA public TO authenticated;

  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to grant CRUD to authenticated: %', SQLERRM;
END $$;

-- Default privileges so future migrations' tables are accessible.
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to set default privileges for authenticated: %', SQLERRM;
END $$;

-- ============================================================
-- 3.  Same for anon (the unauthenticated role that middleware
--     lets reach /api/auth/* and /api/v1).
-- ============================================================
DO $$
BEGIN
  GRANT USAGE ON SCHEMA public TO anon;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to grant SELECT to anon: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '041: failed to set default privileges for anon: %', SQLERRM;
END $$;
