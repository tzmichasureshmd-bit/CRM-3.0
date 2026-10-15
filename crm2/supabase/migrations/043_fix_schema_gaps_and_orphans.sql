-- ============================================================
-- 043_fix_schema_gaps_and_orphans.sql
--
-- Fixes two issues that can leave authenticated users unable to
-- load their profile or save WhatsApp configuration:
--
--   1. Migration 042 (production bootstrap) recreates tables from
--      scratch and omits columns added by later migrations
--      (beta_features, default_currency). This adds them back if
--      missing.
--
--   2. The signup trigger (handle_new_user) can leave an orphaned
--      account row when the profile insert fails after the account
--      insert succeeds. We fix the trigger to clean up the account
--      on failure, and backfill missing profiles/accounts for any
--      existing users affected by the old behaviour.
-- ============================================================

-- ============================================================
-- 1. SCHEMA GAPS
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS beta_features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_default_currency_format;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_default_currency_format
    CHECK (default_currency ~ '^[A-Z]{3}$');

-- ============================================================
-- 2. FIX SIGNUP TRIGGER
-- ============================================================
-- The old trigger could leave an orphaned `accounts` row when the
-- `profiles` insert failed after the `accounts` insert succeeded.
-- The new version deletes the just-created account in the EXCEPTION
-- handler so the database stays consistent.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Clean up the account we just created so we don't leave orphans.
  BEGIN
    DELETE FROM public.accounts WHERE id = v_account_id;
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort cleanup; ignore secondary failures.
    NULL;
  END;
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. BACKFILL ORPHANS
-- ============================================================
-- Heal any users affected by the old trigger behaviour:
--   - auth.users with no profile row
--   - profiles with no account_id
-- Wrapped in a DO block so it's idempotent on re-run.

DO $$
DECLARE
  v_user_id UUID;
  v_account_id UUID;
BEGIN
  -- (a) Create missing profiles for authenticated users.
  INSERT INTO public.profiles (user_id, full_name, email)
  SELECT u.id,
         COALESCE(u.raw_user_meta_data->>'full_name', ''),
         COALESCE(u.email, '')
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = u.id
  )
  RETURNING user_id INTO v_user_id;

  -- (b) Create missing accounts for profiles that lack one.
  INSERT INTO public.accounts (name, owner_user_id)
  SELECT COALESCE(NULLIF(p.full_name, ''), p.email, 'My account'),
         p.user_id
  FROM profiles p
  WHERE p.account_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.owner_user_id = p.user_id
    )
  RETURNING id, owner_user_id INTO v_account_id, v_user_id;

  -- (c) Link profiles to their accounts.
  UPDATE profiles p
  SET account_id = a.id,
      account_role = 'owner'
  FROM accounts a
  WHERE a.owner_user_id = p.user_id
    AND p.account_id IS NULL;
END $$;
