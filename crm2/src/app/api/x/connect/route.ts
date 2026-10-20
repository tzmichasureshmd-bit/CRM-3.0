import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { requireRole } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt, encrypt } from '@/lib/whatsapp/encryption'
import { generateCodeVerifier, generateCodeChallenge, buildAuthUrl, XApiError } from '@/lib/x/x-api'

export const dynamic = 'force-dynamic'

function siteOrigin(request: Request): string {
  const override = process.env.NEXT_PUBLIC_SITE_URL
  if (override) return override.replace(/\/+$/, '')
  const { protocol, host } = new URL(request.url)
  return `${protocol}//${host}`
}

/**
 * GET /api/x/connect
 * Returns current X connection status for the caller's account.
 * Never returns tokens.
 */
export async function GET() {
  try {
    const ctx = await requireRole('viewer')
    const admin = supabaseAdmin()

    const { data } = await admin
      .from('channel_integrations')
      .select(
        'id, account_name, external_account_id, status, access_token_expires_at, ' +
          'connected_at, metadata, last_error',
      )
      .eq('account_id', ctx.accountId)
      .eq('platform', 'x')
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
        xUserId: data.external_account_id ?? null,
        status: data.status,
        expiresAt: data.access_token_expires_at ?? null,
        connectedAt: data.connected_at ?? null,
        lastError: data.last_error ?? null,
        accessLevel: meta.access_level ?? 'free',
      },
    })
  } catch (err) {
    console.error('[x/connect] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/x/connect
 * Initiates the X OAuth 2.0 PKCE flow. Returns the authorization URL.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')

    const clientId = process.env.X_CLIENT_ID
    if (!clientId) {
      return NextResponse.json(
        { error: 'X_CLIENT_ID is not configured on this server.' },
        { status: 503 },
      )
    }
    const clientSecret = process.env.X_CLIENT_SECRET
    if (!clientSecret) {
      return NextResponse.json(
        { error: 'X_CLIENT_SECRET is not configured on this server.' },
        { status: 503 },
      )
    }

    const origin = siteOrigin(request)
    const redirectUri = `${origin}/api/x/callback`
    const state = crypto.randomBytes(24).toString('hex')
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    // Store state + encrypted code verifier in DB
    const admin = supabaseAdmin()
    await admin.from('social_oauth_states').insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      platform: 'x',
      state,
      // Store code verifier encrypted — it's a secret that must not leak
      code_verifier: encrypt(codeVerifier),
      return_to: '/integrations',
    })

    const authUrl = buildAuthUrl({ clientId, clientSecret, redirectUri }, state, codeChallenge)
    return NextResponse.json({ authUrl })
  } catch (err) {
    console.error('[x/connect] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/x/connect
 * Disconnects the X account. Best-effort token revocation.
 */
export async function DELETE() {
  try {
    const ctx = await requireRole('admin')
    const admin = supabaseAdmin()

    const { data: row } = await admin
      .from('channel_integrations')
      .select('access_token, metadata')
      .eq('account_id', ctx.accountId)
      .eq('platform', 'x')
      .maybeSingle() as unknown as { data: Record<string, unknown> | null }

    // Best-effort revocation
    if (row?.access_token) {
      try {
        const clientId = process.env.X_CLIENT_ID
        const clientSecret = process.env.X_CLIENT_SECRET
        if (clientId && clientSecret) {
          const { revokeToken } = await import('@/lib/x/x-api')
          const token = decrypt(row.access_token as string)
          const meta = (row.metadata ?? {}) as Record<string, unknown>
          const refreshToken = meta.refresh_token_encrypted
            ? decrypt(meta.refresh_token_encrypted as string)
            : null
          await revokeToken({ clientId, clientSecret, redirectUri: '' }, token, 'access_token')
          if (refreshToken) {
            await revokeToken(
              { clientId, clientSecret, redirectUri: '' },
              refreshToken,
              'refresh_token',
            )
          }
        }
      } catch {
        // Best-effort — still mark disconnected
      }
    }

    await admin
      .from('channel_integrations')
      .update({
        status: 'disconnected',
        access_token: null,
        metadata: {},
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId)
      .eq('platform', 'x')

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[x/connect] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/x/connect
 * Refreshes the X access token using the stored refresh token.
 */
export async function PATCH() {
  try {
    const ctx = await requireRole('admin')
    const admin = supabaseAdmin()

    const { data: row } = await admin
      .from('channel_integrations')
      .select('id, access_token, metadata')
      .eq('account_id', ctx.accountId)
      .eq('platform', 'x')
      .eq('status', 'connected')
      .maybeSingle() as unknown as { data: Record<string, unknown> | null }

    if (!row) {
      return NextResponse.json({ error: 'No connected X account found.' }, { status: 404 })
    }

    const meta = (row.metadata ?? {}) as Record<string, unknown>
    if (!meta.refresh_token_encrypted) {
      return NextResponse.json(
        { error: 'No refresh token stored. Please reconnect your X account.' },
        { status: 400 },
      )
    }

    const clientId = process.env.X_CLIENT_ID
    const clientSecret = process.env.X_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'X credentials not configured.' }, { status: 503 })
    }

    const refreshToken = decrypt(meta.refresh_token_encrypted as string)
    const { refreshAccessToken } = await import('@/lib/x/x-api')

    let refreshed
    try {
      refreshed = await refreshAccessToken(
        { clientId, clientSecret, redirectUri: '' },
        refreshToken,
      )
    } catch (err) {
      const msg = err instanceof XApiError ? err.message : 'Token refresh failed'
      await admin
        .from('channel_integrations')
        .update({ last_error: msg, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const expiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : null

    const updatedMeta = {
      ...meta,
      refresh_token_encrypted: refreshed.refresh_token
        ? encrypt(refreshed.refresh_token)
        : meta.refresh_token_encrypted,
    }

    await admin
      .from('channel_integrations')
      .update({
        access_token: encrypt(refreshed.access_token),
        access_token_expires_at: expiresAt,
        metadata: updatedMeta,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    return NextResponse.json({ success: true, expiresAt })
  } catch (err) {
    console.error('[x/connect] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
