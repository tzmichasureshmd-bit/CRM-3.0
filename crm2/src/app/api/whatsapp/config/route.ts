import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  probeRegistrationState,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

/**
 * Safe structured logging helper. Never logs secrets: no access
 * tokens, no authorization headers, no app secrets, no passwords.
 */
function logError(context: string, operation: string, opts: {
  userId?: string | null
  accountId?: string | null
  message: string
  code?: string | null
  hint?: string | null
  details?: string | null
}) {
  console.error(`[${context}]`, {
    operation,
    userId: opts.userId ?? null,
    accountId: opts.accountId ?? null,
    message: opts.message,
    code: opts.code ?? null,
    hint: opts.hint ?? null,
    details: opts.details ?? null,
  })
}

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    logError('resolveAccountId', 'fetch profile', {
      userId,
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
    })
    return null
  }

  if (!data) {
    return await createProfileAndAccount(supabase, userId)
  }

  if (data.account_id) {
    return data.account_id
  }

  return await linkOrCreateAccount(supabase, userId, data)
}

async function createProfileAndAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logError('resolveAccountId', 'createAccount', {
      userId,
      message: 'SUPABASE_SERVICE_ROLE_KEY is not set',
    })
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any
  try {
    admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  } catch (err) {
    logError('resolveAccountId', 'createAccount', {
      userId,
      message: err instanceof Error ? err.message : 'admin client threw',
    })
    return null
  }

  let accountId: string
  try {
    const { data: existingAccount, error: lookupErr } = await admin
      .from('accounts')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle()

    if (lookupErr) {
      logError('resolveAccountId', 'lookup account', {
        userId,
        message: lookupErr.message,
        code: lookupErr.code,
      })
      return null
    }

    if (existingAccount?.id) {
      accountId = existingAccount.id
    } else {
      const { data: account, error: accountErr } = await admin
        .from('accounts')
        .insert({ name: 'My account', owner_user_id: userId })
        .select('id')
        .maybeSingle()

      if (accountErr || !account?.id) {
        logError('resolveAccountId', 'create account', {
          userId,
          message: accountErr?.message ?? 'no account id returned',
          code: accountErr?.code,
        })
        return null
      }
      accountId = account.id
    }
  } catch (err) {
    logError('resolveAccountId', 'create account', {
      userId,
      message: err instanceof Error ? err.message : 'unknown error',
    })
    return null
  }

  try {
    const { error: profileErr } = await supabase
      .from('profiles')
      .insert({
        user_id: userId,
        full_name: '',
        email: '',
        account_id: accountId,
        account_role: 'owner',
      })

    if (profileErr) {
      if (profileErr.code === '23505') {
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ account_id: accountId, account_role: 'owner' })
          .eq('user_id', userId)

        if (updateErr) {
          logError('resolveAccountId', 'link existing profile', {
            userId,
            message: updateErr.message,
            code: updateErr.code,
          })
          return null
        }
        return accountId
      }

      logError('resolveAccountId', 'create profile', {
        userId,
        message: profileErr.message,
        code: profileErr.code,
      })
      return null
    }
  } catch (err) {
    logError('resolveAccountId', 'create profile', {
      userId,
      message: err instanceof Error ? err.message : 'unknown error',
    })
    return null
  }

  return accountId
}

async function linkOrCreateAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  profileData: { full_name?: string | null; email?: string | null },
): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logError('resolveAccountId', 'link account', {
      userId,
      message: 'SUPABASE_SERVICE_ROLE_KEY is not set',
    })
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any
  try {
    admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  } catch (err) {
    logError('resolveAccountId', 'link account', {
      userId,
      message: err instanceof Error ? err.message : 'admin client threw',
    })
    return null
  }

  const accountName = profileData.full_name || profileData.email || 'My account'

  let accountId: string
  try {
    const { data: existingAccount, error: lookupErr } = await admin
      .from('accounts')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle()

    if (lookupErr) {
      logError('resolveAccountId', 'lookup account', {
        userId,
        message: lookupErr.message,
        code: lookupErr.code,
      })
      return null
    }

    if (existingAccount?.id) {
      accountId = existingAccount.id
    } else {
      const { data: account, error: accountErr } = await admin
        .from('accounts')
        .insert({ name: accountName, owner_user_id: userId })
        .select('id')
        .maybeSingle()

      if (accountErr || !account?.id) {
        logError('resolveAccountId', 'create account', {
          userId,
          message: accountErr?.message ?? 'no account id returned',
          code: accountErr?.code,
        })
        return null
      }
      accountId = account.id
    }
  } catch (err) {
    logError('resolveAccountId', 'create account', {
      userId,
      message: err instanceof Error ? err.message : 'unknown error',
    })
    return null
  }

  try {
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ account_id: accountId, account_role: 'owner' })
      .eq('user_id', userId)

    if (updateErr) {
      logError('resolveAccountId', 'link profile', {
        userId,
        message: updateErr.message,
        code: updateErr.code,
      })
      return null
    }
  } catch (err) {
    logError('resolveAccountId', 'link profile', {
      userId,
      message: err instanceof Error ? err.message : 'unknown error',
    })
    return null
  }

  return accountId
}

// Lazy-initialised service-role client, used only to detect a
// phone_number_id already claimed by a *different* account — under RLS
// the user's own session can't see other users' rows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
    }
    if (!key) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    }
    _adminClient = createAdminClient(url, key)
  }
  return _adminClient
}

/**
 * GET /api/whatsapp/config
 *
 * Authenticates the user, resolves their account, and returns the
 * LIST of connected WhatsApp numbers for that account, each with its
 * live per-number health (verified against Meta). With multi-number
 * support an account can own many rows — one per phone_number_id.
 *
 * Never throws a 500 simply because no configuration exists yet.
 *
 * Response shape:
 *   { numbers: [...], connected: bool, primary_phone_number_id: string|null }
 *   { error: '...' }                          (401 / 500)
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)

    if (!accountId) {
      return NextResponse.json(
        {
          configured: false,
          connected: false,
          registrationStatus: 'not_configured',
          numbers: [],
          primary_phone_number_id: null,
          reason: 'no_account',
        },
        { status: 200 },
      )
    }

    // is_primary may not exist in this environment yet (migration 053).
    // Detect once so we never 500 with 42703 against an older schema
    // (this was the production bug). We always select the stable base
    // columns and, when the column exists, read the primary flags via a
    // separate type-safe query instead of an interpolated SELECT string.
    const hasIsPrimary = await supportsIsPrimary(supabase)
    const primaryPhoneNumberIds = new Set<string>()
    if (hasIsPrimary) {
      const { data: primaries } = await supabase
        .from('whatsapp_config')
        .select('phone_number_id, is_primary')
        .eq('account_id', accountId)
        .eq('is_primary', true)
      for (const p of primaries ?? []) {
        if (p.is_primary) primaryPhoneNumberIds.add(p.phone_number_id)
      }
    }

    // Detect which optional columns (diagnostics 054, registration_state
    // 055) exist in this environment. Only SELECT columns that actually
    // exist — this prevents the 500 that occurs when migrations 054/055
    // have not been applied to the production database.
    const optionalCols = await detectOptionalColumns(supabase)
    const extraCols = [...optionalCols].join(', ')
    const selectCols = extraCols ? `${CONFIG_BASE_COLS}, ${extraCols}` : CONFIG_BASE_COLS

    // One row per phone number — return the whole list for this account,
    // most-recently-updated first (so the "default" is stable even before
    // migration 053 adds is_primary).
    const { data: rawRows, error: listError } = await supabase
      .from('whatsapp_config')
      .select(selectCols)
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
    const rows = (rawRows ?? []) as unknown as WhatsAppConfigRow[]

    if (listError) {
      logError('GET /api/whatsapp/config', 'fetch configs', {
        userId: user.id,
        accountId,
        message: listError.message,
        code: listError.code,
        details: listError.details,
      })
      // A missing table (42P01), missing column (42703), or ambiguous
      // column (42702) means the deployed schema is out of step with the
      // code (a migration like 054/055 not applied). That is NOT a reason
      // to 500 — degrade to the safe "not configured" response so the
      // Settings page loads and the operator can see the real state
      // instead of a bare 500. Genuine unexpected errors still 500.
      const schemaLikeCode = ['42P01', '42703', '42702', '42804'].includes(listError.code ?? '')
      if (schemaLikeCode) {
        return NextResponse.json({
          configured: false,
          connected: false,
          registrationStatus: 'not_configured',
          numbers: [],
          primary_phone_number_id: null,
          reason: 'schema_missing_columns',
        })
      }
      return NextResponse.json(
        { error: 'Unable to read your WhatsApp configuration. Please try again.' },
        { status: 500 },
      )
    }

    // Best-effort per-number health check against Meta (decrypt token,
    // verify the number exists for that token).
    const numbers = []
    for (const row of rows ?? []) {
      let accessToken: string | null = null
      try {
        accessToken = decrypt(row.access_token)
      } catch {
        void persistConnectionStatus(supabase, row.id, 'error')
        numbers.push({
          id: row.id,
          phone_number_id: row.phone_number_id,
          waba_id: row.waba_id,
          display_phone_number: row.display_phone_number,
          business_name: row.business_name,
          is_primary: primaryPhoneNumberIds.has(row.phone_number_id),
          status: row.status,
          connection_status: 'error',
          connected: false,
          needs_reset: true,
          registered_at: row.registered_at,
          subscribed_apps_at: row.subscribed_apps_at,
          last_registration_error: row.last_registration_error,
          registration_state: row.registration_state ?? 'REGISTRATION_UNKNOWN',
          last_webhook_at: row.last_webhook_at ?? null,
          last_inbound_at: row.last_inbound_at ?? null,
          webhook_verified_at: row.webhook_verified_at ?? null,
          last_api_error: row.last_api_error ?? null,
          last_api_error_at: row.last_api_error_at ?? null,
        })
        continue
      }

      let connected = false
      let errorMessage: string | null = null
      if (accessToken) {
        try {
          const phoneInfo = await verifyPhoneNumber({
            phoneNumberId: row.phone_number_id,
            accessToken,
          })
          await persistConnectionStatus(supabase, row.id, 'connected')
          connected = Boolean(phoneInfo)
        } catch (err) {
          errorMessage = err instanceof Error ? err.message : 'unknown error'
          await persistConnectionStatus(supabase, row.id, 'error')
        }
      }

      numbers.push({
        id: row.id,
        phone_number_id: row.phone_number_id,
        waba_id: row.waba_id,
        display_phone_number: row.display_phone_number,
        business_name: row.business_name,
        is_primary: primaryPhoneNumberIds.has(row.phone_number_id),
        status: row.status,
        connection_status: connected ? 'connected' : 'error',
        connected,
        error: errorMessage,
        registered_at: row.registered_at,
        subscribed_apps_at: row.subscribed_apps_at,
        last_registration_error: row.last_registration_error,
        registration_state: row.registration_state ?? 'REGISTRATION_UNKNOWN',
        last_webhook_at: row.last_webhook_at ?? null,
        last_inbound_at: row.last_inbound_at ?? null,
        webhook_verified_at: row.webhook_verified_at ?? null,
        last_api_error: row.last_api_error ?? null,
        last_api_error_at: row.last_api_error_at ?? null,
      })
    }

    // Primary = the flagged number when the column exists; otherwise the
    // most-recently-updated number (rows are already sorted updated_at
    // desc when is_primary is absent).
    const primary =
      numbers.find((n: { is_primary: boolean }) => !!n.is_primary) ?? numbers[0] ?? null

    return NextResponse.json({
      configured: numbers.length > 0,
      // `connected` is true ONLY when at least one number was actually
      // verified against Meta with its stored token — never merely because
      // config rows exist (that would be fake success). Each `number` entry
      // carries its own accurate `connected` flag.
      connected: numbers.some((n: { connected: boolean }) => !!n.connected),
      registrationStatus: numbers.length > 0 ? 'configured' : 'not_configured',
      numbers,
      primary_phone_number_id: primary?.phone_number_id ?? null,
    })
  } catch (error) {
    logError('GET /api/whatsapp/config', 'route handler', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 },
    )
  }
}

/**
 * Best-effort persistence of the connection-health flag. Fire-and-forget:
 * a failed status write must never break the health check itself.
 */
async function persistConnectionStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  configId: string,
  status: 'connected' | 'disconnected' | 'pending' | 'error',
) {
  try {
    await supabase
      .from('whatsapp_config')
      .update({ connection_status: status })
      .eq('id', configId)
  } catch (err) {
    console.warn('[whatsapp/config] connection_status write skipped:', err)
  }
}

/**
 * Whether `whatsapp_config.is_primary` exists in the current schema.
 *
 * The `is_primary` column is introduced by migration 053 (drops
 * UNIQUE(account_id) for multi-number support). Until that migration is
 * applied in a given environment, the column does not exist and any
 * SELECT/ORDER/upsert that references it fails with PostgreSQL 42703 —
 * which is what surfaced as the GET /api/whatsapp/config 500 in
 * production. This lets the route degrade gracefully: multi-number
 * ordering falls back to most-recent when the column is absent, and the
 * API keeps working before AND after the migration lands.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function supportsIsPrimary(supabase: any): Promise<boolean> {
  try {
    const probe = await supabase.from('whatsapp_config').select('id, is_primary').limit(1)
    return !probe.error
  } catch {
    return false
  }
}

/**
 * Detect whether a specific column exists on `whatsapp_config` by
 * probing with a lightweight SELECT. Returns true if the column exists,
 * false otherwise. Never throws.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function supportsColumn(supabase: any, column: string): Promise<boolean> {
  try {
    const probe = await supabase.from('whatsapp_config').select(`id, ${column}`).limit(1)
    return !probe.error
  } catch {
    return false
  }
}

/**
 * Detect which optional columns exist on `whatsapp_config` in a single
 * probe (one round-trip) by requesting all of them. Returns the set of
 * column names that are present in the current schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectOptionalColumns(supabase: any): Promise<Set<string>> {
  const allOptional = [...DIAGNOSTIC_COLS, HAS_REGISTRATION_STATE_COL]
  const present = new Set<string>()
  for (const col of allOptional) {
    if (await supportsColumn(supabase, col)) {
      present.add(col)
    }
  }
  return present
}

/**
 * Read the is_primary flag for a single config row when the column exists
 * (migration 053), otherwise null. Uses a fixed static SELECT (not an
 * interpolated string) so the statically-typed Supabase client parses it.
 */
async function readPrimaryFlag(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  configId: string,
  hasIsPrimary: boolean,
): Promise<boolean | null> {
  if (!hasIsPrimary) return null
  const { data } = await supabase
    .from('whatsapp_config')
    .select('is_primary')
    .eq('id', configId)
    .limit(1)
    .maybeSingle()
  return data?.is_primary ?? null
}

// Columns that are GUARANTEED to exist on every deployed schema:
//   initial (001): id, user_id, account_id, phone_number_id, waba_id,
//                  access_token, verify_token, status, connected_at,
//                  registered_at, subscribed_apps_at, last_registration_error,
//                  created_at, updated_at
//   052:          + display_phone_number, business_name, connection_status
//
// Columns that may NOT exist yet (and MUST NOT appear in SELECT or
// INSERT/UPDATE until we probe for them):
//   053: is_primary      (detected by supportsIsPrimary)
//   054: last_webhook_at, last_inbound_at, webhook_verified_at,
//        last_api_error, last_api_error_at
//   055: registration_state
//
// The test endpoint already proves the 052 columns exist (it reads
// business_name), so we can safely include those.
const CONFIG_BASE_COLS =
  'id, phone_number_id, waba_id, access_token, status, connection_status, display_phone_number, business_name, registered_at, subscribed_apps_at, last_registration_error, connected_at, updated_at'

// Optional diagnostic columns added by migration 054.
const DIAGNOSTIC_COLS = ['last_webhook_at', 'last_inbound_at', 'webhook_verified_at', 'last_api_error', 'last_api_error_at']

// Optional registration_state column added by migration 055.
const HAS_REGISTRATION_STATE_COL = 'registration_state'

// Row shape for the dynamic SELECT query. The actual columns returned depend
// on which optional migrations (054/055) have been applied, so every
// potentially-missing column is optional here.
interface WhatsAppConfigRow {
  id: string
  phone_number_id: string
  waba_id: string | null
  access_token: string
  status: string | null
  connection_status: string | null
  display_phone_number: string | null
  business_name: string | null
  registered_at: string | null
  subscribed_apps_at: string | null
  last_registration_error: string | null
  connected_at: string | null
  updated_at: string | null
  last_webhook_at?: string | null
  last_inbound_at?: string | null
  webhook_verified_at?: string | null
  last_api_error?: string | null
  last_api_error_at?: string | null
  registration_state?: string | null
}

interface NumberPayload {
  phone_number_id?: unknown
  waba_id?: unknown
  access_token?: unknown
  verify_token?: unknown
  pin?: unknown
  is_primary?: unknown
  set_primary?: unknown
}

/**
 * POST /api/whatsapp/config
 *
 * Saves (creates or updates) ONE WhatsApp phone number for the
 * authenticated user's account. Multi-number aware: each save upserts
 * a single row keyed on `phone_number_id`, so an account can connect
 * many numbers (each row keeps its own encrypted token — the same
 * Meta System User token may be shared across numbers under the same
 * WABA, which is valid and supported; uniqueness is enforced on
 * phone_number_id, NOT on access_token).
 *
 * Flow: auth → account → validate → cross-account duplicate (409) →
 * Meta verify (400 on rejection) → encrypt → persist → register/WABA
 * subscribe (best effort).
 *
 * Returns meaningful 400/401/403/409/500 codes and never echoes an
 * access token.
 */
export async function POST(request: Request) {
  let userId: string | null = null
  let accountId: string | null = null

  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id

    accountId = await resolveAccountId(supabase, user.id)

    if (!accountId) {
      logError('POST /api/whatsapp/config', 'resolve account', {
        userId,
        message: 'could not resolve account_id',
      })
      return NextResponse.json(
        {
          error: 'Account setup failed',
          message:
            'We could not set up your account automatically. Please refresh the page and try again. If the problem persists, contact support.',
        },
        { status: 500 },
      )
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON.' },
        { status: 400 },
      )
    }

    // is_primary may not exist on this schema yet (migration 053) —
    // detect once so every SELECT/update/upsert that references it stays
    // conditional and never 500s with 42703 on an older deployment.
    const hasIsPrimary = await supportsIsPrimary(supabase)

    // Detect optional columns (diagnostics 054, registration_state 055)
    // so we never INSERT/UPDATE a column that doesn't exist.
    const optionalCols = await detectOptionalColumns(supabase)

    const {
      phone_number_id,
      waba_id,
      access_token,
      verify_token,
      pin,
      is_primary,
      set_primary,
    } = body as NumberPayload

    if (typeof phone_number_id !== 'string' || phone_number_id.trim() === '') {
      return NextResponse.json(
        { error: 'phone_number_id must be a non-empty string' },
        { status: 400 },
      )
    }
    // access_token is required for a brand-new number, but OPTIONAL when
    // updating an existing row (e.g. re-sending the 2FA PIN to finish
    // registration). When omitted, the server reuses the stored encrypted
    // token. See the `existing` lookup + token resolution below.
    if (
      access_token !== undefined &&
      access_token !== null &&
      (typeof access_token !== 'string' || access_token.trim() === '')
    ) {
      return NextResponse.json(
        { error: 'access_token must be a non-empty string' },
        { status: 400 },
      )
    }
    if (waba_id !== undefined && waba_id !== null && typeof waba_id !== 'string') {
      return NextResponse.json({ error: 'waba_id must be a string' }, { status: 400 })
    }
    if (
      pin !== undefined &&
      pin !== null &&
      pin !== '' &&
      (typeof pin !== 'string' || !/^\d{6}$/.test(pin))
    ) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 })
    }

    // Reject if ANOTHER account has already claimed this phone_number_id
    // (instance-level: each phone number can only be connected once).
    // Uses the service-role client because RLS hides other accounts' rows.
    let adminClient: ReturnType<typeof supabaseAdmin>
    try {
      adminClient = supabaseAdmin()
    } catch (err) {
      logError('POST /api/whatsapp/config', 'admin client', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      return NextResponse.json(
        { error: 'Server is not configured to check number conflicts.' },
        { status: 500 },
      )
    }

    try {
      const { data: claimed, error: claimedError } = await adminClient
        .from('whatsapp_config')
        .select('account_id')
        .eq('phone_number_id', phone_number_id)
        .neq('account_id', accountId)
        .limit(1)

      if (claimedError) {
        logError('POST /api/whatsapp/config', 'conflict check', {
          userId,
          accountId,
          message: claimedError.message,
          code: claimedError.code,
          hint: claimedError.hint,
          details: claimedError.details,
        })
        return NextResponse.json(
          { error: 'Failed to validate configuration' },
          { status: 500 },
        )
      }

      if (Array.isArray(claimed) && claimed.length > 0) {
        return NextResponse.json(
          {
            error:
              'This WhatsApp phone number is already connected to another account on this instance. Each phone number can only be connected to one account.',
            code: 'phone_number_already_connected',
          },
          { status: 409 },
        )
      }
    } catch (err) {
      logError('POST /api/whatsapp/config', 'conflict check', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      return NextResponse.json({ error: 'Failed to validate configuration' }, { status: 500 })
    }

    const trimmedNumber = phone_number_id.trim()

    // Does this account already have a row for this exact number? That
    // decides update vs insert, whether this is the account's FIRST
    // number (which is automatically made primary), and whether we can
    // reuse the stored encrypted access token (a PIN-only re-register
    // sends no access_token).
    //
    // IMPORTANT: Only select columns that are GUARANTEED to exist
    // (initial schema + migration 052). Do NOT include registration_state
    // (055) or diagnostics (054) — if those columns don't exist, the
    // query would fail with 42703 and return "Failed to load your
    // current configuration".
    let existing:
      | {
          id: string
          access_token: string | null
          verify_token: string | null
          registered_at: string | null
        }
      | null = null
    try {
      const result = await supabase
        .from('whatsapp_config')
        .select('id, access_token, verify_token, registered_at')
        .eq('account_id', accountId)
        .eq('phone_number_id', trimmedNumber)
        .limit(1)
      if (result.error) {
        logError('POST /api/whatsapp/config', 'fetch existing', {
          userId,
          accountId,
          message: result.error.message,
          code: result.error.code,
          details: result.error.details,
        })
        return NextResponse.json(
          { error: 'Failed to load your current configuration.' },
          { status: 500 },
        )
      }
      existing = Array.isArray(result.data) && result.data.length > 0 ? result.data[0] : null
    } catch (err) {
      logError('POST /api/whatsapp/config', 'fetch existing', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      return NextResponse.json({ error: 'Failed to load your current configuration.' }, { status: 500 })
    }

    // Resolve which token drives the Meta checks below. A re-save (e.g.
    // supplying/repairing the 2FA PIN to finish registration) may omit
    // access_token — reuse the stored encrypted token in that case. A
    // brand-new number must supply one.
    const freshToken = typeof access_token === 'string' && access_token.trim() !== ''
    let effectiveToken: string
    try {
      if (freshToken) {
        effectiveToken = access_token.trim()
      } else if (existing) {
        if (!existing.access_token) {
          return NextResponse.json(
            { error: 'No stored token to reuse. Please enter the Access Token.' },
            { status: 400 },
          )
        }
        effectiveToken = decrypt(existing.access_token)
      } else {
        return NextResponse.json(
          { error: 'access_token must be a non-empty string' },
          { status: 400 },
        )
      }
    } catch (err) {
      logError('POST /api/whatsapp/config', 'resolve token', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      return NextResponse.json(
        { error: 'Unable to decrypt the stored token. Re-enter the Access Token.' },
        { status: 400 },
      )
    }

    // Verify the credentials with Meta BEFORE saving. `verifyPhoneNumber`
    // calls GET /{phone_number_id} with this token — Meta returns 200 only
    // when the token (System User) has access to the number's WABA. A
    // rejection here is exactly the "token has no access to this number /
    // WABA" case, so surface Meta's own message.
    let phoneInfo: { display_phone_number?: string; verified_name?: string } | null = null
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: phone_number_id,
        accessToken: effectiveToken,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      logError('POST /api/whatsapp/config', 'meta verify', {
        userId,
        accountId,
        message,
      })
      return NextResponse.json(
        {
          error:
            'Access token does not have access to this WhatsApp phone number / WhatsApp Business Account.',
          meta_error: message,
          code: 'token_waba_access_denied',
        },
        { status: 400 },
      )
    }

    // Encrypt sensitive tokens before storing. For a PIN-only re-register
    // (no fresh token) we KEEP the stored encrypted token rather than
    // overwriting it with a re-encryption of the same value.
    let encryptedAccessToken: string
    let encryptedVerifyToken: string | null
    try {
      if (freshToken) {
        encryptedAccessToken = encrypt(access_token.trim())
        encryptedVerifyToken = verify_token ? encrypt(String(verify_token)) : null
      } else if (existing) {
        encryptedAccessToken = existing.access_token as string
        encryptedVerifyToken = verify_token
          ? encrypt(String(verify_token))
          : existing.verify_token
      } else {
        throw new Error('no token to store')
      }
    } catch (err) {
      logError('POST /api/whatsapp/config', 'encrypt', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      return NextResponse.json(
        {
          error:
            'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string in your environment variables.',
        },
        { status: 500 },
      )
    }

    // Count the account's configs to decide first-number / primary logic.
    let accountConfigCount = 0
    try {
      const { count, error: countError } = await supabase
        .from('whatsapp_config')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
      if (countError) {
        logError('POST /api/whatsapp/config', 'count configs', {
          userId,
          accountId,
          message: countError.message,
          code: countError.code,
        })
        return NextResponse.json({ error: 'Failed to load your current configuration.' }, { status: 500 })
      }
      accountConfigCount = count ?? 0
    } catch (err) {
      logError('POST /api/whatsapp/config', 'count configs', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      return NextResponse.json({ error: 'Failed to load your current configuration.' }, { status: 500 })
    }

    const requestPrimary = is_primary === true || set_primary === true
    // If this is the account's first number, force it to be primary.
    const becomesPrimary = requestPrimary || accountConfigCount === 0
    const now = new Date().toISOString()

    // Determine the number's REAL registration state by live-probing Meta's
    // /register endpoint (never guess). A correct PIN is used to complete
    // registration; without one, Meta still reports "already registered to
    // this app", "registered under another app", or "PIN required", so we
    // learn the true state even when the admin hasn't entered a PIN.
    //
    // IMPORTANT: `/register` routes THIS number's inbound events to THIS
    // app. Without it, Meta keeps sending events to whichever app last
    // claimed the number (often the one that ran Embedded Signup) — so
    // messages are received by WhatsApp but never reach the CRM inbox.
    let registeredAt: string | null = existing?.registered_at ?? null
    let registrationError: string | null = null
    let registrationState: string = 'REGISTRATION_UNKNOWN'
    let registrationSkipped = false
    let alreadyRegistered = false
    const providedPin = typeof pin === 'string' && pin.trim().length > 0 ? pin.trim() : null
    try {
      const regResult = await probeRegistrationState({
        phoneNumberId: trimmedNumber,
        accessToken: effectiveToken,
        pin: providedPin,
      })
      registrationState = regResult.state
      alreadyRegistered = regResult.state === 'REGISTERED' && !regResult.freshlyRegistered
      if (regResult.state === 'REGISTERED') {
        // Confirmed registered to THIS app (freshly, or already). Record it.
        registeredAt = now
        registrationError = null
        registrationSkipped = false
      } else {
        registeredAt = existing?.registered_at ?? null
        registrationError = regResult.message
        registrationSkipped = false
      }
    } catch (err) {
      registrationError =
        err instanceof Error ? err.message : 'Unknown Meta API error'
      registrationState = 'REGISTRATION_ERROR'
      registeredAt = existing?.registered_at ?? null
      registrationSkipped = false
      logError('POST /api/whatsapp/config', 'probe registration', {
        userId,
        accountId,
        message: registrationError,
      })
    }

    // Subscribe the WABA to this app (idempotent, best effort).
    let subscribedAppsAt: string | null = null
    if (waba_id && typeof waba_id === 'string' && waba_id.trim()) {
      try {
        await subscribeWabaToApp({
          wabaId: waba_id.trim(),
          accessToken: effectiveToken,
        })
        subscribedAppsAt = now
      } catch (err) {
        logError('POST /api/whatsapp/config', 'subscribe waba', {
          userId,
          accountId,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const baseRow = {
      phone_number_id: trimmedNumber,
      waba_id: waba_id && typeof waba_id === 'string' ? waba_id.trim() : null,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      // `status`/`connection_status` reflect CREDENTIAL connectivity
      // (access token + phone number), which was just verified against
      // Meta above — a failed verify would have returned 400 already.
      // Registration pending is shown separately via registered_at /
      // last_registration_error so a connected-but-unregistered number
      // isn't falsely labelled disconnected.
      status: 'connected',
      connection_status: 'connected',
      display_phone_number: phoneInfo?.display_phone_number ?? null,
      business_name: phoneInfo?.verified_name ?? null,
      connected_at: now,
      registered_at: registeredAt,
      subscribed_apps_at: subscribedAppsAt ?? null,
      last_registration_error: registrationError,
      updated_at: now,
    }

    // Persist: upsert on phone_number_id so create + update are atomic
    // and keyed by the number, not by account. is_primary is only written
    // when the column exists (migration 053).
    const persistenceBody: Record<string, unknown> = {
      account_id: accountId,
      user_id: user.id,
      ...baseRow,
    }
    if (hasIsPrimary) {
      persistenceBody.is_primary = becomesPrimary
    }
    // Only include registration_state if the column exists (migration 055).
    // Including a column that doesn't exist causes 42703 and a 500.
    if (optionalCols.has(HAS_REGISTRATION_STATE_COL)) {
      persistenceBody.registration_state = registrationState
    }

    const { data: saved, error: saveError } = await supabase
      .from('whatsapp_config')
      .upsert(persistenceBody, { onConflict: 'phone_number_id' })
      .select('id, phone_number_id, status, connection_status, registered_at, subscribed_apps_at, last_registration_error')
      .single()

    if (saveError) {
      logError('POST /api/whatsapp/config', 'save', {
        userId,
        accountId,
        message: saveError.message,
        code: saveError.code,
        hint: saveError.hint,
        details: saveError.details,
      })
      // Distinguish a DB constraint violation (e.g. duplicate number raced
      // in from elsewhere) from a generic failure.
      if (saveError.code === '23505') {
        return NextResponse.json(
          {
            error:
              'This WhatsApp phone number is already connected. Duplicate connections are not allowed.',
            code: 'phone_number_already_connected',
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: 'Unable to save WhatsApp configuration. Please try again.' },
        { status: 500 },
      )
    }

    // If this save promoted a NEW primary, demote any other primary rows
    // for the account (partial unique index allows only one is_primary).
    if (hasIsPrimary && becomesPrimary && saved && saved.id) {
      const { error: demoteError } = await supabase
        .from('whatsapp_config')
        .update({ is_primary: false })
        .eq('account_id', accountId)
        .eq('is_primary', true)
        .neq('id', saved.id)
      if (demoteError) {
        logError('POST /api/whatsapp/config', 'demote primary', {
          userId,
          accountId,
          message: demoteError.message,
          code: demoteError.code,
        })
      }
    }

    const savedIsPrimary =
      saved && saved.id ? await readPrimaryFlag(supabase, saved.id, hasIsPrimary) : null

    return NextResponse.json({
      success: true,
      configured: true,
      message: 'WhatsApp configuration saved successfully.',
      saved: true,
      registered: registeredAt != null,
      registration_skipped: registrationSkipped,
      already_registered: alreadyRegistered,
      registration_state: registrationState,
      requires_registration: registrationState !== 'REGISTERED',
      registration_error: registrationError,
      phone_info: phoneInfo,
      config: {
        id: saved?.id,
        phone_number_id: saved?.phone_number_id ?? trimmedNumber,
        is_primary: Boolean(savedIsPrimary ?? becomesPrimary),
        status: saved?.status,
        connection_status: saved?.connection_status,
        registered_at: saved?.registered_at,
        subscribed_apps_at: saved?.subscribed_apps_at,
        last_registration_error: saved?.last_registration_error ?? registrationError,
      },
    })
  } catch (error) {
    logError('POST /api/whatsapp/config', 'route handler', {
      userId,
      accountId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return NextResponse.json(
      { error: 'Unable to save WhatsApp configuration. Please try again.' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/whatsapp/config
 *
 * Removes ONE WhatsApp number from the account. Which number is removed
 * is given by a query parameter:
 *   ?phone_number_id=...  the number's phone_number_id, or
 *   ?id=...               the config row id.
 *
 * If the removed number was the account's primary, another connected
 * number (if any) is promoted to primary so outbound sends keep working.
 */
export async function DELETE(request: Request) {
  let userId: string | null = null
  let accountId: string | null = null

  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id

    accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'Your profile is not linked to an account.' }, { status: 403 })
    }

    const url = new URL(request.url)
    const phoneNumberId = url.searchParams.get('phone_number_id')
    const configId = url.searchParams.get('id')

    if (!phoneNumberId && !configId) {
      return NextResponse.json(
        { error: 'Specify which number to disconnect with ?phone_number_id= or ?id=.' },
        { status: 400 },
      )
    }

    const hasIsPrimary = await supportsIsPrimary(supabase)

    // Resolve which row we're deleting and whether it was primary.
    let target: { id: string; is_primary?: boolean | null } | null = null
    try {
      const query = supabase
        .from('whatsapp_config')
        .select('id')
        .eq('account_id', accountId)
      if (configId) {
        query.eq('id', configId)
      } else {
        query.eq('phone_number_id', phoneNumberId)
      }
      const { data, error } = await query.limit(1)
      if (error) {
        logError('DELETE /api/whatsapp/config', 'fetch target', {
          userId,
          accountId,
          message: error.message,
          code: error.code,
        })
        return NextResponse.json({ error: 'Failed to delete configuration. Please try again.' }, { status: 500 })
      }
      target = Array.isArray(data) && data.length > 0 ? data[0] : null
      if (target) {
        target.is_primary = await readPrimaryFlag(supabase, target.id, hasIsPrimary)
      }
    } catch (err) {
      logError('DELETE /api/whatsapp/config', 'fetch target', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      return NextResponse.json({ error: 'Failed to delete configuration. Please try again.' }, { status: 500 })
    }

    if (!target) {
      return NextResponse.json({ success: true }) // nothing to delete
    }

    const { error: deleteError } = await supabase
      .from('whatsapp_config')
      .delete()
      .eq('id', target.id)
      .eq('account_id', accountId)

    if (deleteError) {
      logError('DELETE /api/whatsapp/config', 'delete', {
        userId,
        accountId,
        message: deleteError.message,
        code: deleteError.code,
      })
      return NextResponse.json({ error: 'Failed to delete configuration. Please try again.' }, { status: 500 })
    }

    // If we removed the account's primary, promote the next available
    // number (if any) so outbound sends keep working. Only meaningful
    // when the is_primary column exists (migration 053).
    if (hasIsPrimary && target.is_primary) {
      const { data, error: promoteError } = await supabase
        .from('whatsapp_config')
        .select('id')
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (!promoteError && Array.isArray(data) && data.length > 0) {
        await supabase.from('whatsapp_config').update({ is_primary: true }).eq('id', data[0].id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('DELETE /api/whatsapp/config', 'route handler', {
      userId,
      accountId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return NextResponse.json({ error: 'Internal server error. Please try again.' }, { status: 500 })
  }
}
