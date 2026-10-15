import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { registerPhoneNumber } from '@/lib/whatsapp/meta-api'

/**
 * POST /api/whatsapp/register
 *
 * Dedicated registration endpoint for the WhatsApp Settings "Register"
 * button. The browser NEVER talks to Meta directly — it sends only the
 * 6-digit two-step verification PIN, and this route performs the Meta
 * `/register` call server-side using the stored (encrypted) access token.
 *
 * Emits HTTP 200 on success, and returns structured 2xx/4xx errors the UI
 * renders as useful messages. Never exposes the access token, the app
 * secret, the webhook secret, or the PIN.
 *
 * Request body:
 *   { "pin": "123456" }               (pin is optional — Meta can confirm an
 *                                      already-registered number without one)
 *
 * Success:
 *   { success: true, registered: true, message: "..." }
 *
 * The number may already be registered to this app; in that case Meta
 * reports "already registered" to ANY pin/status probe, so we treat it as
 * success and refresh the local registration state rather than forcing the
 * user to enter another PIN.
 */

function logError(context: string, operation: string, opts: {
  userId?: string | null
  accountId?: string | null
  message: string
  code?: string | null
  hint?: string | null
  details?: string | null
}) {
  // Structured, secret-free logging — never tokens, never PINs.
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
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    logError('register', 'fetch profile', {
      userId,
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
    })
    return null
  }
  return data?.account_id ?? null
}

/**
 * Detect whether a column exists on `whatsapp_config`. Returns true if
 * the column is present, false otherwise. Never throws.
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
 * Build a safe update body for whatsapp_config that only includes
 * columns that actually exist. The `registration_state` column was added
 * by migration 055 and may not exist in all environments.
 */
async function buildSafeUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const hasRegistrationState = await supportsColumn(supabase, 'registration_state')
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'registration_state' && !hasRegistrationState) continue
    safe[key] = value
  }
  return safe
}

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
      return NextResponse.json(
        {
          success: false,
          registered: false,
          message: 'Your profile is not linked to an account. Please refresh and try again.',
        },
        { status: 403 },
      )
    }

    // Only accept a PIN — never let the client influence which credentials
    // or numbers are used (they are resolved server-side from the tenant).
    let body: { pin?: unknown }
    try {
      body = (await request.json()) as { pin?: unknown }
    } catch {
      return NextResponse.json(
        {
          success: false,
          registered: false,
          message: 'Invalid request body. Expected JSON with a "pin" field.',
        },
        { status: 400 },
      )
    }

    const rawPin = typeof body.pin === 'string' ? body.pin.trim() : ''
    const hasPin = rawPin.length > 0

    // PIN, when supplied, must be exactly 6 numeric digits, no spaces,
    // no separators. This is validated server-side too (the client also
    // enforces it) so we never forward an invalid PIN to Meta.
    if (hasPin && !/^\d{6}$/.test(rawPin)) {
      return NextResponse.json(
        {
          success: false,
          registered: false,
          message: 'Enter the 6-digit WhatsApp two-step verification PIN.',
        },
        { status: 400 },
      )
    }

    // Load the tenant's WhatsApp configuration (scoped to account_id so a
    // number from another tenant can never be touched).
    // IMPORTANT: Only select columns GUARANTEED to exist (initial schema +
    // migration 052). Do NOT include registration_state (migration 055)
    // which may not exist in the production database.
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('id, phone_number_id, waba_id, access_token, registered_at, last_registration_error')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (configError) {
      logError('register', 'fetch config', {
        userId,
        accountId,
        message: configError.message,
        code: configError.code,
        details: configError.details,
      })
      return NextResponse.json(
        {
          success: false,
          registered: false,
          message: 'Unable to load WhatsApp configuration. Please try again.',
        },
        { status: 500 },
      )
    }

    if (!config) {
      return NextResponse.json(
        {
          success: false,
          registered: false,
          message: 'No WhatsApp configuration exists yet. Save your phone number and access token first.',
        },
        { status: 404 },
      )
    }

    if (!config.phone_number_id) {
      return NextResponse.json(
        {
          success: false,
          registered: false,
          message: 'The WhatsApp phone number ID is not configured. Please re-enter it and save.',
        },
        { status: 400 },
      )
    }

    if (!config.access_token) {
      return NextResponse.json(
        {
          success: false,
          registered: false,
          message: 'No access token is stored. Please re-enter it and save.',
        },
        { status: 400 },
      )
    }

    // Decrypt the stored token server-side. Never sent to the browser.
    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch (err) {
      logError('register', 'decrypt token', {
        userId,
        accountId,
        message: err instanceof Error ? err.message : 'decrypt failed',
      })
      return NextResponse.json(
        {
          success: false,
          registered: false,
          message: 'Stored access token cannot be decrypted. Re-enter the access token to repair it.',
        },
        { status: 400 },
      )
    }

    // Call Meta server-side. If a PIN was supplied we use it to complete a
    // fresh registration; /register also reports "already registered to this
    // app" without a valid PIN, so an already-wired number is handled without
    // forcing the user to enter a PIN they don't have.
    const now = new Date().toISOString()
    try {
      const result = await registerPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken,
        pin: hasPin ? rawPin : '000000',
      })

      const state = result.success ? 'REGISTERED' : 'REGISTRATION_REQUIRED'

      // Refresh local status: mark confirmed / connected and clear the last
      // registration error so the UI stops asking for a PIN on a working number.
      const updateFields = await buildSafeUpdate(supabase, {
        registration_state: state,
        registered_at: now,
        last_registration_error: null,
        status: 'connected',
        connection_status: 'connected',
        updated_at: now,
      })
      await supabase
        .from('whatsapp_config')
        .update(updateFields)
        .eq('id', config.id)
        .eq('account_id', accountId)

      return NextResponse.json({
        success: true,
        registered: true,
        already_registered: result.alreadyRegistered,
        message: result.alreadyRegistered
          ? 'The WhatsApp number is already registered with Meta. Connection refreshed.'
          : 'WhatsApp number registered successfully.',
      })
    } catch (err) {
      // Meta rejected the registration — surface a safe, human-readable reason.
      // We never log the token or PIN.
      const message = err instanceof Error ? err.message : 'Unknown registration error'
      logError('register', 'meta register', {
        userId,
        accountId,
        message,
      })

      // Map Meta's rejection to a useful error message and persist the
      // registration state so the diagnostics panel is honest.
      let safeMessage = 'Meta registration failed.'
      if (/already.*registered/i.test(message)) {
        safeMessage = 'The WhatsApp number is already registered with Meta.'
        const regFields = await buildSafeUpdate(supabase, {
          registration_state: 'REGISTERED',
          registered_at: now,
          last_registration_error: null,
          status: 'connected',
          connection_status: 'connected',
          updated_at: now,
        })
        await supabase
          .from('whatsapp_config')
          .update(regFields)
          .eq('id', config.id)
          .eq('account_id', accountId)
        return NextResponse.json({
          success: true,
          registered: true,
          already_registered: true,
          message: safeMessage,
        })
      }
      if (/two.step verification pin required/i.test(message) || /pin.*required/i.test(message)) {
        safeMessage = 'Meta rejected the registration PIN. The number requires the two-step verification PIN set in WhatsApp Manager.'
      } else if (/incorrect pin|wrong pin|invalid pin/i.test(message)) {
        safeMessage = 'Meta rejected the registration PIN. Enter the correct 6-digit two-step verification PIN.'
      } else if (/two.factor authentication is not on|2fa is not enabled|enabled on this phone/i.test(message)) {
        safeMessage = 'Two-factor authentication is not enabled on this number. Enable it in WhatsApp Manager, then try again.'
      } else if (/registered.*(another app|another waba|different app)/i.test(message)) {
        safeMessage = 'This WhatsApp number is registered under another WhatsApp Business Account / app. It must be registered to this app to receive inbound messages here.'
      } else if (/access.*token|permission|(#200|oauth|expired)/i.test(message)) {
        safeMessage = 'The access token is invalid or expired. Re-enter a valid token and save.'
      } else if (/not.*access.*phone|phone number id|does not belong/i.test(message)) {
        safeMessage = 'The phone number ID does not belong to this WhatsApp Business Account.'
      }

      const errorFields = await buildSafeUpdate(supabase, {
        registration_state: 'REGISTRATION_ERROR',
        last_registration_error: safeMessage,
        updated_at: now,
      })
      await supabase
        .from('whatsapp_config')
        .update(errorFields)
        .eq('id', config.id)
        .eq('account_id', accountId)

      return NextResponse.json(
        {
          success: false,
          registered: false,
          message: safeMessage,
          details: safeMessage,
        },
        { status: 400 },
      )
    }
  } catch (error) {
    logError('register', 'route handler', {
      userId,
      accountId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return NextResponse.json(
      {
        success: false,
        registered: false,
        message: 'Unable to complete registration. Please try again.',
      },
      { status: 500 },
    )
  }
}
