// ============================================================
// Super Admin authentication helper.
//
// Usage:
//   const ctx = await requireSuperAdmin();
//   // ctx.platformRole === 'super_admin'
//   // ctx.supabase — RLS client (super_admin RLS bypasses account scoping)
//   // ctx.userId, ctx.accountId, ctx.role, ctx.account
// ============================================================

import { getCurrentAccount, ForbiddenError, type AccountContext } from "./account";

export { toErrorResponse } from "./account";

export interface SuperAdminContext extends AccountContext {
  platformRole: "super_admin";
}

/**
 * Resolve the caller's account context and enforce super_admin platform role.
 *
 * Throws ForbiddenError if the caller is not a super_admin.
 */
export async function requireSuperAdmin(): Promise<SuperAdminContext> {
  const ctx = await getCurrentAccount();

  if (ctx.platformRole !== "super_admin") {
    throw new ForbiddenError("Super admin access required");
  }

  return ctx as SuperAdminContext;
}
