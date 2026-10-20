// ============================================================
// Server-side service-role Supabase client.
//
// Use ONLY inside route handlers / server actions that have already
// authorised the caller. The service role bypasses RLS, so every
// caller must be checked first (requireSuperAdmin / requireRole).
//
//   import { serviceRoleClient, requireServiceRole } from "@/lib/supabase/admin";
//   await requireSuperAdmin();
//   const admin = serviceRoleClient();
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/** Thrown when SUPABASE_SERVICE_ROLE_KEY is not configured. */
export class ServiceRoleNotConfiguredError extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (copy from .env.local.example) and restart the dev server."
    );
    this.name = "ServiceRoleNotConfiguredError";
  }
}

/** True when a service-role key is available in this environment. */
export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Service-role client. Throws a descriptive error instead of creating
 * a client with `undefined` credentials (which would surface later as
 * a confusing 401).
 */
export function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new ServiceRoleNotConfiguredError();

  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}
