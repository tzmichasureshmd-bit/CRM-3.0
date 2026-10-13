-- ============================================================
-- Migration 009: Fix profiles RLS infinite recursion
-- Replaces the self-referential subquery in profiles_rls with
-- a SECURITY DEFINER helper function to prevent PostgreSQL
-- error 42P17 when contacts_rls or deals_rls queries profiles.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- Step 1: Create a SECURITY DEFINER helper to get current account_id
CREATE OR REPLACE FUNCTION public.get_my_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Step 2: Replace the recursive profiles policy
DROP POLICY IF EXISTS profiles_rls ON public.profiles;

CREATE POLICY profiles_rls ON public.profiles
  USING (
    user_id = auth.uid()
    OR account_id = public.get_my_account_id()
  );

-- Step 3: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_account_id() TO authenticated;
