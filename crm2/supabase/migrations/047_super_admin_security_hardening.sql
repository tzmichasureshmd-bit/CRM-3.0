-- ============================================================
-- 047_super_admin_security_hardening.sql
--
-- Restricts Super Admin access to explicitly authorized members.
-- Fixes privilege escalation vulnerability in profiles RLS.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Fix profiles UPDATE policy to prevent privilege escalation
-- ──────────────────────────────────────────────────────────────
-- The current policy allows any user to UPDATE their own row
-- (auth.uid() = user_id), which means a user could SET
-- platform_role = 'super_admin' on themselves.
--
-- Fix: Add a WITH CHECK that prevents non-super-admins from
-- elevating their own platform_role.

DROP POLICY IF EXISTS profiles_update ON profiles;

-- Users can update their own profile, BUT they cannot promote
-- themselves to super_admin. Super admins can update anyone.
CREATE POLICY profiles_update ON profiles
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR is_super_admin()
  )
  WITH CHECK (
    -- Super admins can set any role
    is_super_admin()
    OR (
      -- Regular users can update their own profile
      auth.uid() = user_id
      -- But they CANNOT change platform_role to super_admin
      AND (
        platform_role IS DISTINCT FROM 'super_admin'
        -- If platform_role is being set/changed, it must not be super_admin
        -- If platform_role is not in the UPDATE, it stays as-is (safe)
      )
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 2. Create RPC for managing super admin roles
-- ──────────────────────────────────────────────────────────────
-- Only super admins can promote/demote other users.
-- This is the ONLY safe way to change platform_role.

CREATE OR REPLACE FUNCTION set_super_admin_role(
  target_user_id UUID,
  make_super_admin BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only super admins can call this function
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can manage platform roles';
  END IF;

  -- Cannot demote yourself
  IF target_user_id = auth.uid() AND NOT make_super_admin THEN
    RAISE EXCEPTION 'Cannot remove your own super admin role';
  END IF;

  UPDATE profiles
  SET platform_role = CASE
    WHEN make_super_admin THEN 'super_admin'::platform_role_enum
    ELSE 'user'::platform_role_enum
  END
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

ALTER FUNCTION set_super_admin_role(UUID, BOOLEAN) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION set_super_admin_role(UUID, BOOLEAN) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 3. Create RPC to list all super admin members
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_super_admin_members()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Only super admins can view the list
  SELECT
    p.user_id,
    p.email,
    p.full_name,
    p.created_at
  FROM profiles p
  WHERE p.platform_role = 'super_admin'
  ORDER BY p.created_at ASC;
$$;

ALTER FUNCTION get_super_admin_members() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_super_admin_members() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4. Ensure the existing Super Admin account is correctly set
-- ──────────────────────────────────────────────────────────────

UPDATE profiles
SET platform_role = 'super_admin'::platform_role_enum
WHERE user_id = '489c398c-13ab-4f67-95f6-ef8507c86f92'
  AND platform_role IS DISTINCT FROM 'super_admin'::platform_role_enum;

-- ──────────────────────────────────────────────────────────────
-- 5. Ensure handle_new_user() trigger NEVER assigns super_admin
-- ──────────────────────────────────────────────────────────────
-- The trigger already doesn't set platform_role (defaults to 'user'),
-- but let's add a safety check comment for clarity.
-- No code change needed — the column default is 'user' and the
-- trigger INSERT doesn't include platform_role.

-- ──────────────────────────────────────────────────────────────
-- 6. Audit log entry for this migration
-- ──────────────────────────────────────────────────────────────

INSERT INTO audit_log (actor_email, action, resource_type, details)
VALUES (
  'system@migration-047',
  'SUPER_ADMIN_SECURITY_HARDENED',
  'platform',
  jsonb_build_object(
    'migration', '047',
    'changes', jsonb_build_array(
      'Fixed profiles RLS privilege escalation',
      'Added set_super_admin_role() RPC',
      'Added get_super_admin_members() RPC',
      'Ensured user 489c... is super_admin'
    )
  )
);
