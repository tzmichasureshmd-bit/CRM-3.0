import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  embeddedSignupConnect,
  type EmbeddedSignupConnectCtx,
} from '@/lib/whatsapp/embedded-signup'

/**
 * POST /api/whatsapp/embedded/connect
 *
 * Completes the Meta Embedded Signup / WhatsApp Business App coexist
 * connection. The client has already driven the Facebook SDK popup and
 * received a one-time OAuth `code` + session info. This route:
 *
 *   1. Resolves the authenticated user's account and guards the
 *      phone_number_id against cross-account conflicts (admin client —
 *      RLS hides other accounts' rows).
 *   2. Exchanges the code → long-lived token (server-only, META_APP_SECRET).
 *   3. Verifies token / WABA / phone against the Graph API.
 *   4. Surfaces Meta's own refusal verbatim (session error_message) and
 *      never creates a new WABA/number on the user's behalf.
 *   5. Confirms coexistence (is_on_biz_app = true && platform_type =
 *      CLOUD_API) — reported ONLY when Meta says so.
 *   6. Subscribes the WABA to this app's webhook (idempotent).
 *   7. Persists by REUSING the account's existing row for the same
 *      phone_number_id, otherwise inserts ONE additive row with
 *      connection_method = 'embedded_signup'. Existing manual Cloud API
 *      rows are never deleted, and the existing access token is preserved
 *      unless the row had none.
 *
 * SAFETY: This route NEVER calls /register and NEVER unsubscribes the
 * WABA — the number stays managed by the WhatsApp Business App.
 */
export async function POST(request: Request) {
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
    return NextResponse.json(
      {
        success: false,
        error: 'Your profile is not linked to an account.',
        code: 'no_account',
      },
      { status: 403 },
    )
  }

  let body: {
    code?: unknown
    redirectUri?: unknown
    session?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body. Expected JSON.', code: 'bad_body' },
      { status: 400 },
    )
  }

  if (typeof body.code !== 'string' || body.code.trim() === '') {
    return NextResponse.json(
      { success: false, error: 'Missing authorization code.', code: 'missing_code' },
      { status: 400 },
    )
  }
  const redirectUri =
    typeof body.redirectUri === 'string' && body.redirectUri.trim()
      ? body.redirectUri.trim()
      : ''

  // Normalize the session info (Meta posts back waba_id/phone_number_id/
  // business_id, but in coexistence these may be absent; error_message is
  // Meta's own reason when the flow was refused).
  const sessionRaw = (typeof body.session === 'object' && body.session !== null
    ? body.session
    : {}) as Record<string, unknown>
  const session = {
    business_id:
      typeof sessionRaw.business_id === 'string' ? sessionRaw.business_id : null,
    waba_id: typeof sessionRaw.waba_id === 'string' ? sessionRaw.waba_id : null,
    phone_number_id:
      typeof sessionRaw.phone_number_id === 'string'
        ? sessionRaw.phone_number_id
        : null,
    current_step:
      typeof sessionRaw.current_step === 'string' ? sessionRaw.current_step : undefined,
    error_message:
      typeof sessionRaw.error_message === 'string' ? sessionRaw.error_message : undefined,
  }

  // Guard against cross-tenant duplicates BEFORE spending a Meta call:
  // the phone_number_id must not already belong to ANOTHER account. Uses
  // the service-role client because RLS hides other accounts' rows.
  const preclaimedPhoneNumberId = session.phone_number_id
  if (preclaimedPhoneNumberId) {
    try {
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data: claimed, error: claimedError } = await admin
        .from('whatsapp_config')
        .select('account_id')
        .eq('phone_number_id', preclaimedPhoneNumberId)
        .neq('account_id', accountId)
        .limit(1)
      if (!claimedError && Array.isArray(claimed) && claimed.length > 0) {
        return NextResponse.json(
          {
            success: false,
            coexistence: false,
            coexistence_meta: { is_on_biz_app: false, platform_type: '' },
            connection_method: 'embedded_signup',
            ready: false,
            code: 'phone_number_already_connected',
            error:
              'This WhatsApp number is already connected to another CRM account.',
          },
          { status: 409 },
        )
      }
    } catch (err) {
      console.error('[whatsapp/embedded/connect] cross-account guard skipped:', err)
    }
  }

  const ctx: EmbeddedSignupConnectCtx = {
    accountId,
    userId: user.id,
    env: {
      appId: process.env.META_APP_ID,
      appSecret: process.env.META_APP_SECRET,
      configId: process.env.META_EMBEDDED_SIGNUP_CONFIG_ID,
    },
    supabase: {
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => ({
          select: async (cols: string) => {
            const { data, error } = await supabase
              .from(table)
              .insert(row)
              .select(cols)
            const first = Array.isArray(data) ? ((data[0] ?? null) as { id?: string } | null) : null
            return { error, data: first }
          },
        }),
        update: (row: Record<string, unknown>) => ({
          eq: async (col: string, val: unknown) => {
            const { error } = await supabase
              .from(table)
              .update(row)
              .eq(col, val)
            return { error }
          },
        }),
        selectWhere: async (
          cols: string,
          where: { col: string; val: unknown }[],
        ) => {
          let q = supabase.from(table).select(cols)
          for (const w of where) q = q.eq(w.col, w.val)
          const { data, error } = await q.limit(1)
          return { error, data: ((data ?? []) as unknown) as Record<string, unknown>[] }
        },
      }),
    },
  }

  const result = await embeddedSignupConnect(
    { code: body.code.trim(), redirectUri, session },
    ctx,
  )

  // 409 when the number/connection is genuinely already claimed elsewhere;
  // 400 for anything else (Meta refusal, missing ids, persistence error).
  const status = result.success ? 200 : result.code === 'phone_number_already_connected' ? 409 : 400
  return NextResponse.json(result, { status })
}