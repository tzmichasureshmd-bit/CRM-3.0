import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { runVerification } from '@/lib/whatsapp/verify'

/**
 * GET /api/whatsapp/verify
 *
 * "Verified with Meta" — runs the full real API verification suite
 * against the Graph API and returns a per-check status the UI renders.
 *
 * Checks: access token, WABA, phone number, registration, WABA-to-app
 * subscription, app-level webhook subscription + messages field,
 * webhook verify token, and inbound-readiness.
 *
 * Never returns 5xx for "not configured"; returns a structured result
 * so the UI can show exactly which step failed. Never exposes secrets.
 *
 * Optional query param `pin` is used to live-probe registration when the
 * number is not yet locally marked registered.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const pin = searchParams.get('pin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json({
      ready: false,
      checks: [{ key: 'account', label: 'Account', status: 'fail', detail: 'Profile is not linked to an account.' }],
      message: 'Your profile is not linked to an account.',
    })
  }

  const { data: config, error: configError } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (configError) {
    return NextResponse.json({ error: 'Unable to load configuration.' }, { status: 500 })
  }
  if (!config) {
    return NextResponse.json({
      ready: false,
      checks: [{ key: 'config', label: 'Configuration', status: 'fail', detail: 'No WhatsApp configuration saved yet.' }],
      message: 'No WhatsApp configuration saved yet.',
    })
  }

  let accessToken: string
  try {
    accessToken = decrypt(config.access_token)
  } catch {
    return NextResponse.json({
      ready: false,
      checks: [
        {
          key: 'config',
          label: 'Configuration',
          status: 'fail',
          detail: 'Stored access token can\'t be decrypted — likely ENCRYPTION_KEY changed. Re-enter the token.',
        },
      ],
      message: 'Stored access token can\'t be decrypted.',
    })
  }

  let verifyToken: string | null = null
  if (config.verify_token) {
    try {
      verifyToken = decrypt(config.verify_token)
    } catch {
      verifyToken = null
    }
  }

  const result = await runVerification({
    phoneNumberId: config.phone_number_id,
    wabaId: config.waba_id ?? null,
    accessToken,
    pin: pin && pin.trim() ? pin.trim() : null,
    registeredAt:
      typeof config.registered_at === 'string'
        ? config.registered_at
        : config.registered_at
          ? (config.registered_at as unknown as string)
          : null,
    subscribedAppsAt:
      typeof config.subscribed_apps_at === 'string'
        ? config.subscribed_apps_at
        : config.subscribed_apps_at
          ? (config.subscribed_apps_at as unknown as string)
          : null,
    metaAppId: process.env.META_APP_ID ?? null,
    verifyToken,
  })

  return NextResponse.json({
    ...result,
    registered_at: result.registeredAt,
    last_registration_error: config.last_registration_error ?? null,
    persisted_registration_state: config.registration_state ?? null,
    last_inbound_at: config.last_inbound_at ?? null,
    last_webhook_at: config.last_webhook_at ?? null,
    webhook_verified_at: config.webhook_verified_at ?? null,
    webhook_signature_configured: Boolean(process.env.META_APP_SECRET),
  })
}
