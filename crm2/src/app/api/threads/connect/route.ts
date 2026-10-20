import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { requireRole } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt, encrypt } from '@/lib/whatsapp/encryption'
import { ThreadsApiError } from '@/lib/threads/threads-api'

export const dynamic = 'force-dynamic'

function siteOrigin(request: Request): string {
  const override = process.env.NEXT_PUBLIC_SITE_URL
  if (override) return override.replace(/\/+$/, '')
  const { protocol, host } = new URL(request.url)
  return `${protocol}//${host}`
}

/**
 * GET /api/threads/connect
 * Returns current Threads connection status for the caller's account.
 * Never returns the access token.
 */
export async function GET() {
  try {
    const ctx = await requireRole('viewer')
    const admin = supabaseAdmin()

    const { data } = await admin
      .from('channel_integrations')
      .select(
        'id, account_name, external_account_id, status, access_token_expires_at, ' +
          'last_inbound_at, connected_at, metadata, last_error',
      )
      .eq('account_id', ctx.accountId)
      .eq('platform', 'threads')
      .maybeSingle() as unknown as { data: Record<string, unknown> | null }

    if (!data) {
      return NextResponse.json({ connected: false, integration: null })
    }

    const meta = (data.metadata ?? {}) as Record<string, unknown>
    return NextResponse.json({
      connected: data.status === 'connected',
      integration: {
        id: data.id,
        username: meta.username ?? null,
        name: data.account_name ?? null,
        threadsUserId: data.external_account_id ?? null,
        status: data.status,
        expiresAt: data.access_token_expires_at ?? null,
        connectedAt: data.connected_at ?? null,
        lastError: data.last_error ?? null,
      },
    })
  } catch (err) {
    console.error('[threads/connect] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/threads/connect
 * Initiates the Threads OAuth flow. Returns the authorization URL.
 * The frontend redirects the user to this URL.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')

    const appId = process.env.THREADS_APP_ID
    if (!appId) {
      return NextResponse.json(
        { error: 'THREADS_APP_ID is not configured on this server.' },
        { status: 503 },
      )
    }

    const origin = siteOrigin(request)
    const redirectUri = `${origin}/api/threads/callback`
    const state = crypto.randomBytes(24).toString('hex')

    // Store state in DB for CSRF validation (survives load-balanced instances)
    const admin = supabaseAdmin()
    await admin.from('social_oauth_states').insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      platform: 'threads',
      state,
      return_to: '/integrations',
    })

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: 'threads_basic,threads_content_publish,threads_manage_replies',
      response_type: 'code',
      state,
    })

    const authUrl = `https://threads.net/oauth/authorize?${params.toString()}`
    return NextResponse.json({ authUrl })
  } catch (err) {
    console.error('[threads/connect] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/threads/connect
 * Disconnects the Threads account for the caller's account.
 */
export async function DELETE() {
  try {
    const ctx = await requireRole('admin')
    const admin = supabaseAdmin()

    await admin
      .from('channel_integrations')
      .update({
        status: 'disconnected',
        access_token: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId)
      .eq('platform', 'threads')

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[threads/connect] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/threads/connect
 * Refreshes the Threads long-lived token if it is within 7 days of expiry.
 */
export async function PATCH() {
  try {
    const ctx = await requireRole('admin')
    const admin = supabaseAdmin()

    const { data: row } = await admin
      .from('channel_integrations')
      .select('id, access_token, access_token_expires_at')
      .eq('account_id', ctx.accountId)
      .eq('platform', 'threads')
      .eq('status', 'connected')
      .maybeSingle() as unknown as { data: Record<string, unknown> | null }

    if (!row?.access_token) {
      return NextResponse.json({ error: 'No connected Threads account found.' }, { status: 404 })
    }

    const { refreshLongLivedToken } = await import('@/lib/threads/threads-api')
    const currentToken = decrypt(row.access_token as string)

    let refreshed
    try {
      refreshed = await refreshLongLivedToken(currentToken)
    } catch (err) {
      const msg = err instanceof ThreadsApiError ? err.message : 'Token refresh failed'
      await admin
        .from('channel_integrations')
        .update({ last_error: msg, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await admin
      .from('channel_integrations')
      .update({
        access_token: encrypt(refreshed.access_token),
        access_token_expires_at: expiresAt,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    return NextResponse.json({ success: true, expiresAt })
  } catch (err) {
    console.error('[threads/connect] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
