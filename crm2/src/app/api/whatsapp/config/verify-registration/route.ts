import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { runVerification } from '@/lib/whatsapp/verify'

/**
 * GET /api/whatsapp/config/verify-registration
 *
 * Legacy diagnostic endpoint — kept for backward compatibility. Runs the
 * same real Meta verification suite as GET /api/whatsapp/verify and also
 * maps the per-check results to the older boolean-shaped `checks` object
 * the original UI consumed.
 *
 * Returns 200 in every case so the UI can render diagnostic detail rather
 * than a generic error toast. Never exposes secrets.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json({
      live: false,
      checks: { config_exists: false },
      message: 'Your profile is not linked to an account.',
    })
  }

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!config) {
    return NextResponse.json({
      live: false,
      checks: { config_exists: false },
      message: 'No WhatsApp configuration saved yet.',
    })
  }

  let accessToken: string
  try {
    accessToken = decrypt(config.access_token)
  } catch {
    return NextResponse.json({
      live: false,
      checks: { config_exists: true, token_decryptable: false },
      message:
        'Stored access token can\'t be decrypted — likely ENCRYPTION_KEY changed. Re-enter the token to repair.',
    })
  }

  const result = await runVerification({
    phoneNumberId: config.phone_number_id,
    wabaId: config.waba_id ?? null,
    accessToken,
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
  })

  // Map the structured checks back to the legacy boolean shape.
  const byKey: Record<string, boolean> = {}
  for (const c of result.checks) {
    byKey[c.key] = c.status === 'ok'
  }

  return NextResponse.json({
    live: result.ready,
    checks: {
      config_exists: true,
      token_decryptable: true,
      phone_metadata_ok: byKey.phone_number === true,
      waba_subscribed_to_app: byKey.waba_subscription ?? null,
      locally_marked_registered: byKey.registration === true,
    },
    errors: result.checks
      .filter((c) => c.status !== 'ok')
      .map((c) => `[${c.label}] ${c.detail ?? (c.error?.message ?? 'not configured')}`),
    last_registration_error: config.last_registration_error ?? null,
    registered_at: config.registered_at ?? null,
    subscribed_apps_at: config.subscribed_apps_at ?? null,
  })
}
