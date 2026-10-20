"use server";

import { createClient } from "@/lib/supabase/server";
import { assertSuperAdminProfile } from "@/lib/auth/super-admin-policy";

/**
 * Server action: verify the current session belongs to a super admin
 * (`profiles.platform_role = 'super_admin'`, plus the optional
 * SUPER_ADMIN_EMAILS allowlist) — the exact rule the /super-admin
 * layout gate applies.
 *
 * Called from the /super-admin/login page after signInWithPassword
 * succeeds, so the authorization decision happens server-side before
 * the browser ever redirects into the dashboard.
 */
export async function verifySuperAdminRole(): Promise<{
  authorized: boolean;
  reason?: string;
}> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[SUPER ADMIN] verifySuperAdminRole: getUser error:", authError.message);
      return { authorized: false, reason: `Auth error: ${authError.message}` };
    }

    if (!user) {
      console.warn("[SUPER ADMIN] verifySuperAdminRole: no authenticated user");
      return { authorized: false, reason: "No authenticated user found." };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("platform_role, email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[SUPER ADMIN] verifySuperAdminRole: profile query error:", profileError.message);
      return { authorized: false, reason: `Profile error: ${profileError.message}` };
    }

    // Shared rule — identical to the /super-admin and /admin layout
    // gates. Previously this accepted the legacy `role` column as an
    // alternative to `platform_role`, which no migration ever writes
    // and which RLS ignores; that was an unintended escalation path.
    const verdict = assertSuperAdminProfile(profile);

    if (!verdict.authorized) {
      console.warn(
        `[SUPER ADMIN] verifySuperAdminRole: denied for ${user.email ?? user.id} (${verdict.code})`,
      );
      return { authorized: false, reason: verdict.reason };
    }

    return { authorized: true };
  } catch (err) {
    console.error("[SUPER ADMIN] verifySuperAdminRole: unexpected error:", err);
    return {
      authorized: false,
      reason: err instanceof Error ? err.message : "Unknown verification error.",
    };
  }
}
