import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embeddedSignupEnvStatus } from '@/lib/whatsapp/embedded-signup'

/**
 * GET /api/whatsapp/embedded/status
 *
 * Reports whether the Meta Embedded Signup (v4) / WhatsApp Business App
 * coexistence flow is configured in this deployment, WITHOUT requiring a
 * real Meta connection.
 *
 * Response never contains secrets (no tokens, no app secret). It tells
 * the UI:
 *   - configured: META_APP_ID + META_APP_SECRET + config ID all set
 *   - missing: which env vars are absent (name-only)
 *   - has_manual_connection: the account already has a manual Cloud API
 *     number (so coexistence is "additive", not first-connect)
 *   - webhookConfigured: whether an app-level webhook (META_APP_SECRET)
 *     exists to receive inbound for a coexisting number
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
      configured: false,
      missing: [],
      has_manual_connection: false,
      accountId: null,
    })
  }

  const { count, error } = await supabase
    .from('whatsapp_config')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)

  const hasManual =
    count !== null &&
    (count ?? 0) > 0

  if (error) {
    return NextResponse.json({
      configured: false,
      missing: [],
      has_manual_connection: false,
      accountId,
      error: 'Unable to read connection state.',
    })
  }

  const env = embeddedSignupEnvStatus({
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    configId: process.env.META_EMBEDDED_SIGNUP_CONFIG_ID,
  })

  return NextResponse.json({
    configured: env.configured,
    missing: env.missing,
    has_manual_connection: hasManual,
    webhookConfigured: env.webhookConfigured,
    accountId,
    // The FB JS SDK needs the app id + config id in the browser. These are
    // public by nature (the SDK exposes the app id in every visitor's JS);
    // the private META_APP_SECRET is never returned and stays server-only.
    appId: process.env.META_APP_ID ? process.env.META_APP_ID : null,
    configId: process.env.META_EMBEDDED_SIGNUP_CONFIG_ID
      ? process.env.META_EMBEDDED_SIGNUP_CONFIG_ID
      : null,
  })
}