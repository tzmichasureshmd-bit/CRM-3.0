// ============================================================
// Single source of truth for "may this person use the platform
// admin console?".
//
// The app has two admin route trees — `src/app/admin/**` and
// `src/app/super-admin/**` — and until now each had its own
// authorization rule:
//
//   /admin/layout.tsx         platform_role === 'super_admin'
//                             AND email in SUPER_ADMIN_EMAILS
//   /super-admin/layout.tsx  platform_role === 'super_admin'
//                             OR legacy role === 'super_admin'
//   /admin/login/actions.ts   same as the /admin layout
//   /super-admin/login/…      same as the /super-admin layout
//
// Because the two layouts disagreed, the `SUPER_ADMIN_EMAILS`
// allowlist was decorative: a super admin who was not on it was
// bounced from /admin but could simply use /super-admin, and every
// RLS policy that grants cross-tenant reads keys off
// `is_super_admin()` (which only looks at platform_role) anyway — so
// the allowlist protected pages, not data.
//
// `assertSuperAdminProfile` is the one rule all four call sites now
// share.
//
// Two deliberate design points:
//
//  1. The allowlist is OPTIONAL. `SUPER_ADMIN_EMAILS` is not set in
//     most self-hosted deployments, and `/admin` already redirected
//     *everyone* to /dashboard in that case. Treating "unset" as
//     "deny" would have locked every super admin out of both
//     consoles. So an unset/empty list means "platform_role alone
//     decides", and setting it turns it into a genuine second gate.
//
//  2. The legacy `profiles.role` fallback is gone. `platform_role`
//     is the real column (added in migration 045 and used by the
//     `is_super_admin()` SQL helper), and no migration ever writes
//     `role = 'super_admin'`. The fallback was an unintended
//     escalation path: any row that ended up with the legacy value
//     would gain the whole console.
// ============================================================

import { isAuthorizedSuperAdmin, getAuthorizedSuperAdminEmails } from "./super-admin-emails";

/** The minimum shape every call site has already loaded. */
export interface SuperAdminProfileLike {
  platform_role?: string | null;
  email?: string | null;
}

export interface SuperAdminCheck {
  authorized: boolean;
  /** User-facing reason when `authorized` is false. */
  reason?: string;
  /** Machine-readable reason for logs and the /admin redirect. */
  code?: "not-super-admin" | "not-allowlisted";
}

/**
 * Decide whether a loaded `profiles` row may enter the admin console.
 *
 * Pure and side-effect free apart from a dev warning, so it is safe to
 * call from a server component, a server action, or a unit test.
 */
export function assertSuperAdminProfile(
  profile: SuperAdminProfileLike | null | undefined,
): SuperAdminCheck {
  if (!profile) {
    return { authorized: false, code: "not-super-admin", reason: "No profile found for this user." };
  }

  // The DB enum is `platform_role_enum` ('user' | 'super_admin'); this
  // mirrors the `is_super_admin()` SQL helper used by RLS.
  if (profile.platform_role !== "super_admin") {
    return {
      authorized: false,
      code: "not-super-admin",
      reason: "You do not have Super Admin access.",
    };
  }

  // Only enforced when the operator has actually configured a list.
  const allowlist = getAuthorizedSuperAdminEmails();
  if (allowlist.length > 0 && (!profile.email || !isAuthorizedSuperAdmin(profile.email))) {
    return {
      authorized: false,
      code: "not-allowlisted",
      reason: "This account is not on the Super Admin allowlist.",
    };
  }

  return { authorized: true };
}
