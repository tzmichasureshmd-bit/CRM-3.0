import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  verifyPhoneNumber,
  MetaApiError,
  type MetaPhoneInfo,
} from '@/lib/whatsapp/meta-api'

/**
 * POST /api/whatsapp/test
 *
 * "Test API Connection" — performs a REAL Meta Cloud API round-trip using
 * the account's STORED credentials (Phone Number ID + Permanent Access
 * Token decrypted server-side). It does not just check that config rows
 * exist in the database; it asks Meta whether the credentials actually
 * work so the UI never shows "Connected" based on metadata alone.
 *
 * The browser never talks to Meta directly and never sees the access
 * token — it POSTs nothing meaningful (the body is ignored); everything
 * is resolved server-side from the authenticated tenant.
 *
 * Success (Meta verified the number with this token):
 *   { success: true, connected: true, message: "...", phone: {...} }
 * Failure:
 *   { success: false, connected: false, message: "...", reason: "..." }
 *
 * Never logs or returns the access token / app secret / webhook secret /
 * PIN. Uses HTTP 200 for "test ran but connection is bad" so the UI can
 * render the safe reason; a genuine server/db problem returns 500.
 */

function logError(context: string, operation: string, opts: {
  userId?: string | null
  accountId?: string | null
  message: string
}) {
  console.error(`[${context}]`, {
    operation,
    userId: opts.userId ?? null,
    accountId: opts.accountId ?? null,
    message: opts.message,
  })
}

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    logError('whatsapp/test', 'fetch profile', {
      userId,
      message: error.message,
    })
    return null
  }
  return data?.account_id ?? null
}

/**
 * Translate a Meta rejection into a safe human-readable reason. Matches
 * the wording/style of the register route's mapping so the UI reads
 * consistently. Never embeds secrets.
 */
function translateMetaError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown Meta API error'
  const status = err instanceof MetaApiError ? err.status : null
  const lower = message.toLowerCase()

  if (/access token|oauth|expired|session has expired|#190|#200/i.test(lower)) {
    return 'The access token is invalid or expired. Re-enter a valid token and save it in your WhatsApp configuration.'
  }
  if (/phone number id|does not belong|not.*access.*phone/i.test(lower)) {
    return 'The Phone Number ID is invalid or does not belong to this WhatsApp Business Account.'
  }
  if (/waba|business account|ad account|not found/i.test(lower) && /#100|#803|#10|not found/i.test(lower)) {
    return 'The WhatsApp Business Account could not be accessed with this token.'
  }
  if (/permission|(#200|user hasn.t granted)/i.test(lower)) {
    return 'The access token does not have permission to access this WhatsApp Business Account / phone number.'
  }
  if (status === 401 || status === 403) {
    return 'Meta rejected the credentials (unauthorized). Check the access token and Business Account access.'
  }
  return 'Meta rejected the request. Check the Phone Number ID and access token.'
}

export async function POST(request: Request) {
  let userId: string | null = null
  let accountId: string | null = null

  try {
    // Body is intentionally ignored — the test uses the tenant's STORED
    // credentials only, so a caller can never point it at a different
    // number/token. Read it (if any) so the request drains cleanly, but
    // nothing from it is trusted.
    try {
      await request.json()
    } catch {
      /* no body — fine */
    }

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
      return NextResponse.json(
        {
          success: false,
          connected: false,
          message: 'Your profile is not linked to an account.',
          reason: 'no_account',
        },
        { status: 200 },
      )
    }

    // Load the tenant's WhatsApp config — scope to account_id so a number
    // from another tenant can never be tested. Prefer the primary number,
    // else the most recently updated one.
    let config: {
      id: string
      phone_number_id: string
      waba_id: string | null
      access_token: string | null
      business_name: string | null
    } | null = null

    try {
      const { data: rows, error } = await supabase
        .from('whatsapp_config')
        .select('id, phone_number_id, waba_id, access_token, business_name')
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false })
      if (error) {
        logError('whatsapp/test', 'fetch configs', {
          userId,
          accountId,
          message: error.message,
        })
        return NextResponse.json(
          {
            success: false,
            connected: false,
            message: 'Unable to load WhatsApp configuration.',
            reason: 'config_load_error',
          },
          { status: 500 },
        )
      }
      config = rows && rows.length > 0 ? rows[0] : null
    } catch (err) {
      logError('whatsapp/test', 'fetch configs', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'unknown error',
      })
      return NextResponse.json(
        {
          success: false,
          connected: false,
          message: 'Unable to load WhatsApp configuration.',
          reason: 'config_load_error',
        },
        { status: 500 },
      )
    }

    if (!config) {
      return NextResponse.json(
        {
          success: false,
          connected: false,
          message:
            'No WhatsApp configuration exists yet. Save your Phone Number ID and Access Token first.',
          reason: 'not_configured',
        },
        { status: 200 },
      )
    }

    if (!config.phone_number_id) {
      return NextResponse.json(
        {
          success: false,
          connected: false,
          message: 'The WhatsApp Phone Number ID is not configured.',
          reason: 'missing_phone_number_id',
        },
        { status: 200 },
      )
    }

    if (!config.access_token) {
      return NextResponse.json(
        {
          success: false,
          connected: false,
          message: 'No access token is stored. Re-enter it and save.',
          reason: 'missing_access_token',
        },
        { status: 200 },
      )
    }

    // Decrypt the stored token server-side. Never sent to the browser.
    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch (err) {
      logError('whatsapp/test', 'decrypt token', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'decrypt failed',
      })
      return NextResponse.json(
        {
          success: false,
          connected: false,
          message:
            'Stored access token cannot be decrypted (ENCRYPTION_KEY may have changed). Re-enter the access token to repair it.',
          reason: 'token_corrupted',
        },
        { status: 200 },
      )
    }

    // The REAL connection test: ask Meta whether this token can access
    // the stored Phone Number ID. A 200 confirms the credentials work.
    let phoneInfo: MetaPhoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken,
      })
    } catch (err) {
      const reason = translateMetaError(err)
      logError('whatsapp/test', 'meta verify', {
        userId,
        accountId,
        message: reason,
      })
      return NextResponse.json(
        {
          success: false,
          connected: false,
          message: 'WhatsApp API connection failed.',
          reason,
          phone_number_id: config.phone_number_id,
        },
        { status: 200 },
      )
    }

    // Success — Meta validated the credentials. Return safe identity info
    // only (display_phone_number, verified_name). Never the token.
    return NextResponse.json({
      success: true,
      connected: true,
      message: 'WhatsApp API connection is working.',
      phone_number_id: config.phone_number_id,
      phone: {
        display_phone_number: phoneInfo.display_phone_number ?? null,
        verified_name: phoneInfo.verified_name ?? null,
        quality_rating: phoneInfo.quality_rating ?? null,
      },
      business_name: config.business_name ?? phoneInfo.verified_name ?? null,
    })
  } catch (error) {
    logError('whatsapp/test', 'route handler', {
      userId,
      accountId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return NextResponse.json(
      {
        success: false,
        connected: false,
        message: 'Unable to test the WhatsApp connection. Please try again.',
        reason: 'internal_error',
      },
      { status: 500 },
    )
  }
}
