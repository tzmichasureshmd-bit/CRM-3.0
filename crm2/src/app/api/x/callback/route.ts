import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt, encrypt } from '@/lib/whatsapp/encryption'
import { exchangeCodeForToken, getMe, XApiError } from '@/lib/x/x-api'

export const dynamic = 'force-dynamic'

function siteOrigin(request: Request): string {
  const override = process.env.NEXT_PUBLIC_SITE_URL
  if (override) return override.replace(/\/+$/, '')
  const { protocol, host } = new URL(request.url)
  return `${protocol}//${host}`
}

function redirectTo(origin: string, path: string, params: Record<string, string>): NextResponse {
  const url = new URL(path, origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url.toString())
}

/**
 * GET /api/x/callback
 * Handles the OAuth 2.0 PKCE redirect from X.
 * Validates state, exchanges code + verifier for tokens, stores encrypted tokens.
 */
export async function GET(request: Request) {
  const origin = siteOrigin(request)
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  // User denied authorization
  if (errorParam) {
    console.warn('[x/callback] user denied authorization:', errorParam)
    return redirectTo(origin, '/integrations', { x_oauth: 'cancelled' })
  }

  if (!code || !state) {
    return redirectTo(origin, '/integrations', { x_oauth: 'invalid' })
  }

  const admin = supabaseAdmin()

  // Validate CSRF state and retrieve code verifier
  const { data: stateRow, error: stateErr } = await admin
    .from('social_oauth_states')
    .select('account_id, user_id, code_verifier, expires_at')
    .eq('platform', 'x')
    .eq('state', state)
    .maybeSingle()

  if (stateErr || !stateRow) {
    console.warn('[x/callback] invalid or missing state')
    return redirectTo(origin, '/integrations', { x_oauth: 'invalid_state' })
  }

  if (new Date(stateRow.expires_at as string) < new Date()) {
    console.warn('[x/callback] state expired')
    await admin.from('social_oauth_states').delete().eq('state', state)
    return redirectTo(origin, '/integrations', { x_oauth: 'state_expired' })
  }

  if (!stateRow.code_verifier) {
    console.error('[x/callback] code_verifier missing from state row')
    await admin.from('social_oauth_states').delete().eq('state', state)
    return redirectTo(origin, '/integrations', { x_oauth: 'invalid_state' })
  }

  // Consume state (one-time use)
  await admin.from('social_oauth_states').delete().eq('state', state)

  const accountId = stateRow.account_id as string
  const userId = stateRow.user_id as string
  const codeVerifier = decrypt(stateRow.code_verifier as string)

  const clientId = process.env.X_CLIENT_ID
  const clientSecret = process.env.X_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('[x/callback] X_CLIENT_ID or X_CLIENT_SECRET not configured')
    return redirectTo(origin, '/integrations', { x_oauth: 'config_error' })
  }

  const redirectUri = `${origin}/api/x/callback`

  // Exchange code + PKCE verifier for tokens
  let tokens
  try {
    tokens = await exchangeCodeForToken({ clientId, clientSecret, redirectUri }, code, codeVerifier)
  } catch (err) {
    const msg = err instanceof XApiError ? err.message : String(err)
    console.error('[x/callback] code exchange failed:', msg)
    return redirectTo(origin, '/integrations', { x_oauth: 'token_error' })
  }

  // Fetch user profile
  let xUser
  try {
    xUser = await getMe(tokens.access_token)
  } catch (err) {
    const msg = err instanceof XApiError ? err.message : String(err)
    console.error('[x/callback] profile fetch failed:', msg)
    return redirectTo(origin, '/integrations', { x_oauth: 'profile_error' })
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  // Build metadata — store encrypted refresh token inside metadata JSONB
  // so it is never returned to the frontend (the column is excluded from
  // the GET /api/x/connect response).
  const metadata: Record<string, unknown> = {
    username: xUser.username,
    name: xUser.name,
    profile_image_url: xUser.profile_image_url ?? null,
    followers_count: xUser.public_metrics?.followers_count ?? null,
    tweet_count: xUser.public_metrics?.tweet_count ?? null,
    verified: xUser.verified ?? false,
    // Scopes granted by the user
    scopes: tokens.scope,
    // access_level is inferred from granted scopes
    access_level: tokens.scope.includes('dm.read') ? 'pro' : 'free',
  }

  if (tokens.refresh_token) {
    metadata.refresh_token_encrypted = encrypt(tokens.refresh_token)
  }

  const { error: upsertErr } = await admin
    .from('channel_integrations')
    .upsert(
      {
        account_id: accountId,
        user_id: userId,
        platform: 'x',
        account_name: xUser.name,
        external_account_id: xUser.id,
        status: 'connected',
        access_token: encrypt(tokens.access_token),
        access_token_expires_at: expiresAt,
        metadata,
        last_error: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // page_id is NULL for X — use a partial unique index workaround:
      // delete any existing row first, then insert fresh.
      { onConflict: 'account_id,platform,page_id' },
    )

  if (upsertErr) {
    // Fallback: delete + insert if the NULL page_id conflict key fails
    const { error: delErr } = await admin
      .from('channel_integrations')
      .delete()
      .eq('account_id', accountId)
      .eq('platform', 'x')
    if (!delErr) {
      const { error: insErr } = await admin
        .from('channel_integrations')
        .insert({
          account_id: accountId,
          user_id: userId,
          platform: 'x',
          account_name: xUser.name,
          external_account_id: xUser.id,
          status: 'connected',
          access_token: encrypt(tokens.access_token),
          access_token_expires_at: expiresAt,
          metadata,
          last_error: null,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      if (insErr) {
        console.error('[x/callback] insert error:', insErr.message)
        return redirectTo(origin, '/integrations', { x_oauth: 'save_error' })
      }
    } else {
      console.error('[x/callback] upsert error:', upsertErr.message)
      return redirectTo(origin, '/integrations', { x_oauth: 'save_error' })
    }
  }

  return redirectTo(origin, '/integrations', { x_oauth: 'connected' })
}
