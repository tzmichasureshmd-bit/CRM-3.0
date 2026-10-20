/**
 * Server-only Supabase service-role client.
 * Used by /api/v3/* routes after FastAPI JWT verification.
 * NEVER import this in browser code — it holds the service role key.
 */
import { createClient } from '@supabase/supabase-js';

// This service client is used against tables that are not represented in a
// generated Supabase schema in this repository. Keep the query builder dynamic
// instead of letting Supabase infer an empty schema (which makes every table
// resolve to `never`).
let _client: ReturnType<typeof createClient<any>> | null = null;

export function getServiceClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase service role credentials not configured');
    _client = createClient<any>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
