import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { encrypt } from '@/lib/whatsapp/encryption'
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getProfile,
  ThreadsApiError,
} from '@/lib/threads/threads-api'

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
 * GET /api/threads/callback
 * Handles the OAuth redirect from Threads.
 * Validates state, exchanges code for tokens, stores encrypted token.
 */
export async function GET(request: Request) {
  const origin = siteOrigin(request)
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  // User denied authorization
  if (errorParam) {
    console.warn('[threads/callback] user denied authorization:', errorParam)
    return redirectTo(origin, '/integrations', { threads_oauth: 'cancelled' })
  }

  if (!code || !state) {
    return redirectTo(origin, '/integrations', { threads_oauth: 'invalid' })
  }

  const admin = supabaseAdmin()

  // Validate CSRF state from DB
  const { data: stateRow, error: stateErr } = await admin
    .from('social_oauth_states')
    .select('account_id, user_id, expires_at')
    .eq('platform', 'threads')
    .eq('state', state)
    .maybeSingle()

  if (stateErr || !stateRow) {
    console.warn('[threads/callback] invalid or missing state')
    return redirectTo(origin, '/integrations', { threads_oauth: 'invalid_state' })
  }

  if (new Date(stateRow.expires_at as string) < new Date()) {
    console.warn('[threads/callback] state expired')
    await admin.from('social_oauth_states').delete().eq('state', state)
    return redirectTo(origin, '/integrations', { threads_oauth: 'state_expired' })
  }

  // Consume state (one-time use)
  await admin.from('social_oauth_states').delete().eq('state', state)

  const accountId = stateRow.account_id as string
  const userId = stateRow.user_id as string

  const appId = process.env.THREADS_APP_ID
  const appSecret = process.env.THREADS_APP_SECRET
  if (!appId || !appSecret) {
    console.error('[threads/callback] THREADS_APP_ID or THREADS_APP_SECRET not configured')
    return redirectTo(origin, '/integrations', { threads_oauth: 'config_error' })
  }

  const redirectUri = `${origin}/api/threads/callback`

  // Exchange code for short-lived token
  let shortLived
  try {
    shortLived = await exchangeCodeForToken({ appId, appSecret, redirectUri }, code)
  } catch (err) {
    const msg = err instanceof ThreadsApiError ? err.message : String(err)
    console.error('[threads/callback] code exchange failed:', msg)
    return redirectTo(origin, '/integrations', { threads_oauth: 'token_error' })
  }

  // Exchange for long-lived token (60 days)
  let longLived
  try {
    longLived = await exchangeForLongLivedToken(appSecret, shortLived.access_token)
  } catch (err) {
    const msg = err instanceof ThreadsApiError ? err.message : String(err)
    console.error('[threads/callback] long-lived token exchange failed:', msg)
    return redirectTo(origin, '/integrations', { threads_oauth: 'token_error' })
  }

  // Fetch profile
  let profile
  try {
    profile = await getProfile(longLived.access_token)
  } catch (err) {
    const msg = err instanceof ThreadsApiError ? err.message : String(err)
    console.error('[threads/callback] profile fetch failed:', msg)
    return redirectTo(origin, '/integrations', { threads_oauth: 'profile_error' })
  }

  const expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString()
  const encryptedToken = encrypt(longLived.access_token)

  // Upsert into channel_integrations
  const { error: upsertErr } = await admin
    .from('channel_integrations')
    .upsert(
      {
        account_id: accountId,
        user_id: userId,
        platform: 'threads',
        account_name: profile.name ?? profile.username,
        external_account_id: profile.id,
        status: 'connected',
        access_token: encryptedToken,
        access_token_expires_at: expiresAt,
        metadata: {
          username: profile.username,
          name: profile.name,
          profile_picture_url: profile.threads_profile_picture_url ?? null,
          followers_count: profile.followers_count ?? null,
        },
        last_error: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,platform,page_id' },
    )

  if (upsertErr) {
    // Fallback: delete + insert if the NULL page_id conflict key fails
    const { error: delErr } = await admin
      .from('channel_integrations')
      .delete()
      .eq('account_id', accountId)
      .eq('platform', 'threads')
    if (!delErr) {
      const { error: insErr } = await admin
        .from('channel_integrations')
        .insert({
          account_id: accountId,
          user_id: userId,
          platform: 'threads',
          account_name: profile.name ?? profile.username,
          external_account_id: profile.id,
          status: 'connected',
          access_token: encryptedToken,
          access_token_expires_at: expiresAt,
          metadata: {
            username: profile.username,
            name: profile.name,
            profile_picture_url: profile.threads_profile_picture_url ?? null,
            followers_count: profile.followers_count ?? null,
          },
          last_error: null,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      if (insErr) {
        console.error('[threads/callback] insert error:', insErr.message)
        return redirectTo(origin, '/integrations', { threads_oauth: 'save_error' })
      }
    } else {
      console.error('[threads/callback] upsert error:', upsertErr.message)
      return redirectTo(origin, '/integrations', { threads_oauth: 'save_error' })
    }
  }

  return redirectTo(origin, '/integrations', { threads_oauth: 'connected' })
}
