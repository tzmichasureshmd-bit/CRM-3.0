/**
 * Meta WhatsApp Embedded Signup (v4) server-side connect logic.
 *
 * The client (react-whatsapp-embedded-signup) drives the Facebook JS SDK
 * popup and returns a one-time OAuth `code` plus the session info Meta
 * posts back (`waba_id`, `phone_number_id`, `business_id`). This module
 * performs the SERVER-SIDE steps that must never happen in the browser:
 *
 *   1. Exchange the `code` for a long-lived token (requires META_APP_SECRET).
 *   2. Verify the token / WABA / phone number against the Graph API.
 *   3. Honor Meta's own decisions: if the popup session carries an
 *      `error_message` (e.g. "the number is already registered to a
 *      different WhatsApp Business Account"), STOP and surface it — we
 *      never create a new WABA/number on the user's behalf.
 *   4. Confirm coexistence is real (is_on_biz_app true AND platform_type
 *      CLOUD_API) — never inferred, only reported when Meta says so.
 *   5. Subscribe the WABA to this app's webhook (idempotent) so inbound
 *      messages can reach /api/whatsapp/webhook.
 *   6. Persist RE-USING the account's existing row when the same
 *      phone_number_id is already connected: update it in place (never a
 *      second row), preserving its working access token, registration and
 *      webhook state. A brand-new number inserts a fresh additive row
 *      (connection_method = 'embedded_signup'). If the phone_number_id is
 *      owned by a DIFFERENT account, the insert fails on the global unique
 *      constraint and we return a cross-tenant refusal.
 *
 * Coexistence safety: this module never calls /register and never
 * unsubscribes the WABA — the number stays managed by the WhatsApp
 * Business App; subscribeWabaToApp only adds THIS app to the WABA's
 * webhook subscriptions (idempotent), which is what Cloud API inbound
 * requires.
 */

import {
  exchangeCodeForToken,
  getTokenInfo,
  getWaba,
  getPhoneNumberWithRetry,
  subscribeWabaToApp,
  MetaApiError,
  type PhoneNumberInfo,
  type WabaInfo,
  type CodeExchangeResult,
} from './meta-api'
import { encrypt } from './encryption'

export const EMBEDDED_SIGNUP_METHOD = 'embedded_signup'
export const MANUAL_METHOD = 'manual'

const DB_ERROR_PHONE_CLAIMED = '23505'

export type EmbeddedSignupErrorCode =
  | 'missing_app_id'
  | 'missing_app_secret'
  | 'missing_config_id'
  | 'missing_code'
  | 'missing_waba'
  | 'missing_phone'
  | 'unverified'
  | 'persist_failed'
  | 'meta_error'
  | 'phone_number_already_connected'

// Safe structured log — never logs tokens, codes, or app secrets.
function logInfo(context: string, operation: string, fields: Record<string, unknown>) {
  console.log(`[${context}]`, {
    operation,
    ...fields,
  })
}

function logWarn(context: string, operation: string, fields: Record<string, unknown>) {
  console.warn(`[${context}]`, {
    operation,
    ...fields,
  })
}

/**
 * Safe human-readable form of a thrown Meta/Graph error (no secrets).
 *
 * For MetaApiError we prefer the raw Meta message (metasMessage) — it loses
 * the internal operation prefix like "embedded_signup_exchange:" so the UI can
 * normalize it. The operation-prefixed err.message (with full context) is what
 * gets logged server-side.
 */
function metaErrorText(err: unknown, fallback: string): string {
  if (err instanceof MetaApiError) {
    return err.metasMessage?.trim() || err.message
  }
  if (err instanceof Error && err.message) {
    return `${fallback} — ${err.message}`
  }
  return fallback
}

export interface EmbeddedSignupConfigError {
  code: EmbeddedSignupErrorCode
  message: string
}

export interface EmbeddedSignupSession {
  /** Business Manager / Business id from the popup session (may be absent). */
  business_id?: string | null
  /** WABA id from the popup session (may be absent for coexistence). */
  waba_id?: string | null
  /** Phone number id from the popup session (may be absent). */
  phone_number_id?: string | null
  /** Raw extras Meta posts back (never exposed wholesale). */
  current_step?: string
  /** Meta's own error/reason for this signup attempt (may be present when
   *  the flow was refused — e.g. number already registered elsewhere). */
  error_message?: string
}

export interface EmbeddedSignupConnectInput {
  /** OAuth code from the SDK popup. */
  code: string
  /** The redirect_uri the flow used (auto-populated by the wrapper). */
  redirectUri: string
  /** Session info Meta posted back with the code. */
  session: EmbeddedSignupSession
}

export interface EmbeddedSignupConnectResult {
  success: boolean
  /** True when the number coexists on a WhatsApp Business App + Cloud API. */
  coexistence: boolean
  /** Meta-declared fields that drove coexistence=true (empty when false). */
  coexistence_meta: { is_on_biz_app: boolean; platform_type: string }
  waba_id?: string
  phone_number_id?: string
  business_id?: string
  display_phone_number?: string
  verified_name?: string
  connection_method: typeof EMBEDDED_SIGNUP_METHOD
  /** False when we couldn't confirm every server-side check. */
  ready: boolean
  configRowId?: string
  /** True when an EXISTING row was updated-in-place instead of inserting a
   *  new one (same phone number already connected to this account). */
  reused?: boolean
  /** Detail lines the UI can render when reusing an existing connection. */
  reused_from?: { connection_method?: string | null; connected_at?: string | null }
  code?: EmbeddedSignupErrorCode
  error?: string
}

/**
 * Validate that this environment can run the Embedded Signup flow. Does
 * NOT require a real connection — the UI calls this to decide whether to
 * show the "Connect" button or a configuration message.
 */
export function embeddedSignupEnvStatus(opts: {
  appId?: string
  appSecret?: string
  configId?: string
  siteUrl?: string
}): {
  configured: boolean
  missing: string[]
  webhookConfigured: boolean
} {
  const missing: string[] = []
  if (!opts.appId) missing.push('META_APP_ID')
  if (!opts.appSecret) missing.push('META_APP_SECRET')
  if (!opts.configId) missing.push('META_EMBEDDED_SIGNUP_CONFIG_ID')
  return {
    configured: missing.length === 0,
    missing,
    webhookConfigured: Boolean(opts.siteUrl),
  }
}

interface DbResult<T = Record<string, unknown>> {
  error: { message?: string; code?: string } | null
  data: T | null
}

interface DbClient {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => Promise<DbResult<{ id?: string }>>
    }
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: { message?: string; code?: string } | null }>
    }
    selectWhere: (
      cols: string,
      where: { col: string; val: unknown }[],
    ) => Promise<{ error: { message?: string; code?: string } | null; data: Record<string, unknown>[] | null }>
  }
}

export interface EmbeddedSignupConnectCtx {
  accountId: string
  userId: string
  env: {
    appId?: string
    appSecret?: string
    configId?: string
  }
  supabase: DbClient
}

/**
 * Server-side exchange + verification + reuse-or-additive persistence.
 *
 * Each failure returns a structured error WITHOUT a 5xx so the UI can
 * explain exactly which step failed:
 *   - env guard (app id / secret)             → missing_*
 *   - Meta refuses the signup (session error) → meta_error (verbatim)
 *   - code exchange → long-lived token        → meta_error (verbatim)
 *   - /me (token live)                        → unverified
 *   - WABA fetch (ownership)                  → missing_waba
 *   - phone fetch with retry (async fields)   → missing_phone
 *   - coexistence confirmed from Meta's fields
 *   - subscribe WABA to this app (best-effort)
 *   - reuse existing row by phone_number_id, else insert; a global-unique
 *     insert violation means the number belongs to ANOTHER account →
 *     phone_number_already_connected (409).
 */
export async function embeddedSignupConnect(
  input: EmbeddedSignupConnectInput,
  ctx: EmbeddedSignupConnectCtx,
): Promise<EmbeddedSignupConnectResult> {
  const SESSION = 'whatsapp/embedded-signup'
  const { accountId, userId, env, supabase } = ctx

  const missing: string[] = []
  if (!env.appId) missing.push('META_APP_ID')
  if (!env.appSecret) missing.push('META_APP_SECRET')
  if (!env.configId) missing.push('META_EMBEDDED_SIGNUP_CONFIG_ID')
  if (missing.length > 0) {
    return {
      success: false,
      coexistence: false,
      coexistence_meta: { is_on_biz_app: false, platform_type: '' },
      connection_method: EMBEDDED_SIGNUP_METHOD,
      ready: false,
      error: `Embedded Signup is not configured. Missing: ${missing.join(', ')}.`,
    }
  }
  if (!env.appId || !env.appSecret || !env.configId) {
    return {
      success: false,
      coexistence: false,
      coexistence_meta: { is_on_biz_app: false, platform_type: '' },
      connection_method: EMBEDDED_SIGNUP_METHOD,
      ready: false,
      error: 'Embedded Signup is not configured. Missing environment variables.',
    }
  }

  if (!input.code || input.code.trim() === '') {
    return {
      success: false,
      coexistence: false,
      coexistence_meta: { is_on_biz_app: false, platform_type: '' },
      connection_method: EMBEDDED_SIGNUP_METHOD,
      ready: false,
      code: 'missing_code',
      error: 'No authorization code was returned by Meta.',
    }
  }

  // 0. Meta refused the signup before handing us anything usable (e.g.
  //    "the existing number is already registered to a different WhatsApp
  //    Business Account", "coexistence is not available for this number").
  //    STOP — never create another number/WABA/business ourselves.
  const sessionError =
    typeof input.session?.error_message === 'string' &&
    input.session.error_message.trim().length > 0
      ? input.session.error_message.trim()
      : null
  if (sessionError) {
    logWarn(SESSION, 'meta_refused', {
      accountId: ctx.accountId,
      message: sessionError,
    })
    return {
      success: false,
      coexistence: false,
      coexistence_meta: { is_on_biz_app: false, platform_type: '' },
      connection_method: EMBEDDED_SIGNUP_METHOD,
      ready: false,
      code: 'meta_error',
      error: metaErrorText(new Error(sessionError), 'Meta refused this signup.'),
    }
  }

  // 1. Code → long-lived token (server-only; app secret never logged).
  let exchange: CodeExchangeResult
  try {
    exchange = await exchangeCodeForToken({
      code: input.code.trim(),
      redirectUri: input.redirectUri,
      appId: env.appId,
      appSecret: env.appSecret,
    })
    logInfo(SESSION, 'exchange', { accountId: ctx.accountId, ok: true })
  } catch (err) {
    logWarn(SESSION, 'exchange', {
      accountId: ctx.accountId,
      message: err instanceof Error ? err.message : 'unknown error',
    })
    return {
      success: false,
      coexistence: false,
      coexistence_meta: { is_on_biz_app: false, platform_type: '' },
      connection_method: EMBEDDED_SIGNUP_METHOD,
      ready: false,
      code: 'meta_error',
      error: metaErrorText(
        err,
        'Meta rejected the authorization code. Refreshing the popup and trying again usually fixes this.',
      ),
    }
  }

  // 2. Token is live.
  try {
    await getTokenInfo({ accessToken: exchange.access_token })
  } catch (err) {
    logWarn(SESSION, 'token_info', {
      accountId: ctx.accountId,
      message: err instanceof Error ? err.message : 'unknown error',
    })
    return {
      success: false,
      coexistence: false,
      coexistence_meta: { is_on_biz_app: false, platform_type: '' },
      connection_method: EMBEDDED_SIGNUP_METHOD,
      ready: false,
      code: 'unverified',
      error: 'The exchanged token could not be verified with Meta.',
    }
  }

  // Resolve WABA id: prefer the popup session, fall back to the phone's
  // own whatsapp_business_account_id (which Meta reports for biz-app
  // numbers — the most reliable source in a coexistence signup).
  const wabaId = input.session?.waba_id ?? null
  const phoneNumberId = input.session?.phone_number_id ?? null
  const businessId = input.session?.business_id ?? null

  // 3. WABA fetch (when known) — confirms the token can see the WABA.
  let wabaInfo: WabaInfo | null = null
  if (wabaId) {
    try {
      wabaInfo = await getWaba({
        wabaId,
        accessToken: exchange.access_token,
      })
    } catch (err) {
      logWarn(SESSION, 'waba_fetch', {
        accountId: ctx.accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      wabaInfo = null
    }
  }

  // 4. Phone number — with retry for async field propagation.
  let phoneInfo: PhoneNumberInfo | null = null
  if (phoneNumberId) {
    try {
      phoneInfo = await getPhoneNumberWithRetry({
        phoneNumberId,
        accessToken: exchange.access_token,
        attempts: 5,
        delayMs: 2000,
      })
    } catch (err) {
      logWarn(SESSION, 'phone_fetch', {
        accountId: ctx.accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      phoneInfo = null
    }
  }

  // 5. Coexistence — Meta's own fields, never inferred. In the embedded
  //    flow the number lives on the WhatsApp Business App (is_on_biz_app
  //    true) and is ALSO reachable via the Cloud API (platform_type
  //    CLOUD_API) — that is literal coexistence.
  const isOnBizApp = phoneInfo?.is_on_biz_app === true
  const platformType = phoneInfo?.platform_type ?? ''
  const coexistence =
    isOnBizApp && platformType === 'CLOUD_API'
  logInfo(SESSION, 'coexistence', {
    accountId: ctx.accountId,
    isOnBizApp,
    platformType,
    coexistence,
  })

  const effectivePhoneNumberId =
    phoneInfo?.id ?? phoneNumberId ?? null
  const effectiveWabaId =
    wabaInfo?.id ?? phoneInfo?.whatsapp_business_account_id ?? wabaId ?? null

  if (!effectivePhoneNumberId || !effectiveWabaId) {
    return {
      success: false,
      coexistence,
      coexistence_meta: { is_on_biz_app: isOnBizApp, platform_type: platformType },
      connection_method: EMBEDDED_SIGNUP_METHOD,
      ready: false,
      code: effectiveWabaId ? 'missing_phone' : 'missing_waba',
      error:
        'Meta did not return a phone number / WABA for this signup. In a coexistence setup the popup may omit IDs — check the Embedded Signup prompt was completed.',
    }
  }

  // 5b. Subscribe the WABA to this app's webhook (idempotent, best
  //     effort). This is what lets Meta route inbound messages for this
  //     number to /api/whatsapp/webhook over the Cloud API. Never
  //     unsubscribes or re-registers anything.
  const now = new Date().toISOString()
  let subscribedAppsAt: string | null = null
  try {
    await subscribeWabaToApp({
      wabaId: effectiveWabaId,
      accessToken: exchange.access_token,
    })
    subscribedAppsAt = now
    logInfo(SESSION, 'waba_subscribe', {
      accountId: ctx.accountId,
      wabaId: effectiveWabaId,
      ok: true,
    })
  } catch (err) {
    logWarn(SESSION, 'waba_subscribe', {
      accountId: ctx.accountId,
      wabaId: effectiveWabaId,
      message: err instanceof Error ? err.message : 'unknown error',
    })
  }

  const encryptedToken = encrypt(exchange.access_token)

  const basePatch: Record<string, unknown> = {
    account_id: accountId,
    user_id: userId,
    phone_number_id: effectivePhoneNumberId,
    waba_id: effectiveWabaId,
    status: 'connected',
    connection_status: 'connected',
    connection_method: EMBEDDED_SIGNUP_METHOD,
    onboarding_source: 'whatsapp_business_app',
    embedded_signup_status: coexistence ? 'coexistence_active' : 'connected',
    coexistence_status: coexistence ? 'active' : 'not_confirmed',
    meta_business_id: businessId ?? null,
    is_on_biz_app: isOnBizApp,
    platform_type: platformType,
    coexistence_confirmed_at: coexistence ? now : null,
    display_phone_number: phoneInfo?.display_phone_number ?? null,
    business_name: phoneInfo?.verified_name ?? wabaInfo?.name ?? null,
    access_token_expires_at: exchange.expires_in
      ? new Date(Date.now() + exchange.expires_in * 1000).toISOString()
      : null,
    token_type: 'embedded_signup_long_lived',
    subscribed_apps_at: subscribedAppsAt,
    connected_at: now,
    updated_at: now,
  }

  // 6. Persist — REUSE the account's existing row for this phone number
  //    (update in place, preserving its working token/registration/webhook
  //    state) else INSERT a fresh additive row. Never a second row for the
  //    same number, and never across accounts.
  const existing = await supabase
    .from('whatsapp_config')
    .selectWhere('id, access_token, connection_method, connected_at', [
      { col: 'account_id', val: accountId },
      { col: 'phone_number_id', val: effectivePhoneNumberId },
    ])

  if (existing.error) {
    logWarn(SESSION, 'persist', {
      accountId: ctx.accountId,
      message: existing.error.message ?? 'unknown error',
      code: existing.error.code,
    })
    return {
      success: false,
      coexistence,
      coexistence_meta: { is_on_biz_app: isOnBizApp, platform_type: platformType },
      connection_method: EMBEDDED_SIGNUP_METHOD,
      ready: false,
      code: 'persist_failed',
      error: 'Could not reuse the existing connection. Please try again.',
    }
  }

  const existingRow = Array.isArray(existing.data) && existing.data.length > 0
    ? existing.data[0]
    : null
  let configRowId: string | undefined
  let reused = false
  let reusedFrom: EmbeddedSignupConnectResult['reused_from']

  if (existingRow && typeof existingRow.id === 'string') {
    // Same number, same account → UPDATE the existing row. The existing
    // access token (usually a durable Cloud API system-user token) is
    // PRESERVED — overwriting it with the 60-day embedded token could
    // break template management. Only a row with no stored token gets the
    // fresh embedded token.
    const patch: Record<string, unknown> = { ...basePatch }
    if (!existingRow.access_token) {
      patch.access_token = encryptedToken
    }
    reused = true
    reusedFrom = {
      connection_method:
        typeof existingRow.connection_method === 'string'
          ? existingRow.connection_method
          : null,
      connected_at:
        typeof existingRow.connected_at === 'string' ? existingRow.connected_at : null,
    }
    const updateRes = await supabase
      .from('whatsapp_config')
      .update(patch)
      .eq('id', existingRow.id)
    if (updateRes.error) {
      logWarn(SESSION, 'persist', {
        accountId: ctx.accountId,
        message: updateRes.error.message ?? 'unknown error',
        code: updateRes.error.code,
      })
      return {
        success: false,
        coexistence,
        coexistence_meta: { is_on_biz_app: isOnBizApp, platform_type: platformType },
        connection_method: EMBEDDED_SIGNUP_METHOD,
        ready: false,
        code: 'persist_failed',
        error: 'Could not save the connection. Please try again.',
      }
    }
    configRowId = existingRow.id
    logInfo(SESSION, 'reused', {
      accountId: ctx.accountId,
      phoneNumberId: effectivePhoneNumberId,
      configRowId,
    })
  } else {
    const insertRow: Record<string, unknown> = { ...basePatch, access_token: encryptedToken }
    if (coexistence) {
      insertRow.embedded_signup_status = 'coexistence_active'
      insertRow.coexistence_status = 'active'
    }
    insertRow.created_at = now
    const insertRes = await supabase
      .from('whatsapp_config')
      .insert(insertRow)
      .select('id')
    if (insertRes.error) {
      const dbCode = insertRes.error.code ?? null
      logWarn(SESSION, 'persist', {
        accountId: ctx.accountId,
        message: insertRes.error.message ?? 'unknown error',
        code: dbCode,
      })
      const isClaimed = dbCode === DB_ERROR_PHONE_CLAIMED
      return {
        success: false,
        coexistence,
        coexistence_meta: { is_on_biz_app: isOnBizApp, platform_type: platformType },
        connection_method: EMBEDDED_SIGNUP_METHOD,
        ready: false,
code: isClaimed ? 'phone_number_already_connected' : 'persist_failed',
            error: isClaimed
              ? 'This WhatsApp number is already connected to another CRM account.'
              : 'Could not save the connection. Please try again.',
      }
    }
    configRowId = insertRes.data?.id
    logInfo(SESSION, 'connected', {
      accountId: ctx.accountId,
      coexistence,
      phoneNumberId: effectivePhoneNumberId,
    })
  }

  return {
    success: true,
    coexistence,
    coexistence_meta: { is_on_biz_app: isOnBizApp, platform_type: platformType },
    waba_id: effectiveWabaId,
    phone_number_id: effectivePhoneNumberId,
    business_id: businessId ?? undefined,
    display_phone_number: phoneInfo?.display_phone_number ?? undefined,
    verified_name: phoneInfo?.verified_name ?? undefined,
    connection_method: EMBEDDED_SIGNUP_METHOD,
    ready: coexistence || effectivePhoneNumberId != null,
    configRowId,
    reused,
    reused_from: reusedFrom,
  }
}