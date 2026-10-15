import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared multi-number helpers for `whatsapp_config`.
 *
 * The table holds one row per connected WhatsApp phone number;
 * an account may own many rows. `is_primary` flags the account's
 * DEFAULT OUTBOUND number, so send/broadcast/template/media call
 * sites (which need "the account's number") resolve it consistently
 * instead of each copying a `.single()`-by-account_id call that would
 * throw PGRST116 as soon as a second number is added.
 */

export interface AccountConfig {
  id: string
  account_id: string
  user_id: string
  phone_number_id: string
  waba_id: string | null
  access_token: string
  verify_token: string | null
  status: string | null
  connection_status: string | null
  is_primary: boolean | null
  display_phone_number: string | null
  business_name: string | null
  connected_at: string | null
  registered_at: string | null
  subscribed_apps_at: string | null
  last_registration_error: string | null
  created_at: string
  updated_at: string
}

/**
 * Resolve an account's default outbound WhatsApp config:
 *   * the row flagged `is_primary`, else
 *   * the most recently updated row.
 *
 * Returns `{ data, error }` — never throws. This is the drop-in
 * replacement for the old `.eq('account_id', id).single()` reads.
 */
export async function getAccountPrimaryConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  accountId: string,
): Promise<{ data: AccountConfig | null; error: { message: string; code?: string } | null }> {
  const { data, error } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { data: null, error: { message: error.message, code: error.code?.toString() } }
  }
  const row = data as AccountConfig | null
  if (!row) return { data: null, error: null }
  return { data: row, error: null }
}

/**
 * List every WhatsApp config row for an account (used by the Settings
 * number list and admin views). Returns an array; never throws.
 */
export async function listAccountConfigs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  accountId: string,
): Promise<{ data: AccountConfig[]; error: { message: string; code?: string } | null }> {
  const { data, error } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) {
    return { data: [], error: { message: error.message, code: error.code?.toString() } }
  }
  return { data: (data ?? []) as AccountConfig[], error: null }
}

/**
 * Cheap existence / "does this account have WhatsApp connected?"
 * check used by banners and guards. Returns true when at least one
 * config row exists. Multi-row safe (limit 1).
 */
export async function accountHasWhatsApp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  accountId: string,
): Promise<boolean> {
  const { data } = await db
    .from('whatsapp_config')
    .select('id')
    .eq('account_id', accountId)
    .limit(1)
  return Array.isArray(data) && data.length > 0
}
