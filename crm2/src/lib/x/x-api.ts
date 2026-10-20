/**
 * X (Twitter) API v2 client.
 * Official API only: https://developer.x.com/en/docs/x-api
 *
 * OAuth 2.0 with PKCE (Authorization Code Flow with PKCE).
 * Tokens are always decrypted server-side, never sent to frontend.
 *
 * ACCESS LEVEL NOTES (as of 2025):
 *   Free tier  — read own timeline, post up to 1,500 tweets/month per app
 *   Basic      — $100/mo — broader read, filtered stream
 *   Pro        — $5,000/mo — DMs (dm.read, dm.write), higher limits
 *   Enterprise — Account Activity API (webhooks for real-time events)
 *
 * This client implements only what is available on Free/Basic tiers:
 *   - Profile retrieval
 *   - Tweet publishing
 *   - Reading own tweets
 *   - Mentions lookup (Basic+)
 *
 * DMs and real-time webhooks are NOT implemented — they require Pro/Enterprise.
 */

const X_API_BASE = 'https://api.twitter.com/2'
const X_AUTH_BASE = 'https://twitter.com/i/oauth2'
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'

export class XApiError extends Error {
  readonly status: number
  readonly detail: string | null
  readonly operation: string

  constructor(opts: { status: number; detail?: string | null; message: string; operation: string }) {
    super(`${opts.operation}: ${opts.message}`)
    this.status = opts.status
    this.detail = opts.detail ?? null
    this.operation = opts.operation
    this.name = 'XApiError'
  }
}

interface XErrorBody {
  title?: string
  detail?: string
  errors?: Array<{ message?: string }>
}

async function apiGet<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${X_API_BASE}/${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as XErrorBody
    throw new XApiError({
      status: res.status,
      detail: body.detail ?? body.errors?.[0]?.message ?? null,
      message: body.title ?? body.detail ?? `HTTP ${res.status}`,
      operation: path,
    })
  }
  return res.json() as Promise<T>
}

async function apiPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${X_API_BASE}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as XErrorBody
    throw new XApiError({
      status: res.status,
      detail: errBody.detail ?? errBody.errors?.[0]?.message ?? null,
      message: errBody.title ?? errBody.detail ?? `HTTP ${res.status}`,
      operation: path,
    })
  }
  return res.json() as Promise<T>
}

// ── PKCE helpers ──────────────────────────────────────────────

import crypto from 'node:crypto'

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// ── OAuth 2.0 PKCE ────────────────────────────────────────────

export interface XOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * Build the X OAuth 2.0 PKCE authorization URL.
 * Scopes: tweet.read tweet.write users.read offline.access
 * offline.access is required to receive a refresh token.
 */
export function buildAuthUrl(
  config: XOAuthConfig,
  state: string,
  codeChallenge: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${X_AUTH_BASE}/authorize?${params.toString()}`
}

export interface XTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  scope: string
}

/**
 * Exchange authorization code for tokens using PKCE.
 */
export async function exchangeCodeForToken(
  config: XOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
    client_id: config.clientId,
  })

  // X requires Basic auth with client_id:client_secret for confidential clients
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as XErrorBody
    throw new XApiError({
      status: res.status,
      message: errBody.detail ?? errBody.title ?? `Token exchange failed (HTTP ${res.status})`,
      operation: 'exchangeCodeForToken',
    })
  }
  return res.json() as Promise<XTokenResponse>
}

/**
 * Refresh an access token using the refresh token.
 * Requires offline.access scope to have been granted.
 */
export async function refreshAccessToken(
  config: XOAuthConfig,
  refreshToken: string,
): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  })

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as XErrorBody
    throw new XApiError({
      status: res.status,
      message: errBody.detail ?? errBody.title ?? `Token refresh failed (HTTP ${res.status})`,
      operation: 'refreshAccessToken',
    })
  }
  return res.json() as Promise<XTokenResponse>
}

/**
 * Revoke an access or refresh token.
 */
export async function revokeToken(
  config: XOAuthConfig,
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token',
): Promise<void> {
  const body = new URLSearchParams({
    token,
    token_type_hint: tokenTypeHint,
    client_id: config.clientId,
  })
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  await fetch('https://api.twitter.com/2/oauth2/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  }).catch(() => {
    // Best-effort revocation — don't throw
  })
}

// ── Profile ───────────────────────────────────────────────────

export interface XUser {
  id: string
  name: string
  username: string
  profile_image_url?: string
  description?: string
  public_metrics?: {
    followers_count: number
    following_count: number
    tweet_count: number
  }
  verified?: boolean
}

interface XUserResponse {
  data: XUser
}

export async function getMe(accessToken: string): Promise<XUser> {
  const res = await apiGet<XUserResponse>('users/me', accessToken, {
    'user.fields': 'id,name,username,profile_image_url,description,public_metrics,verified',
  })
  return res.data
}

// ── Tweets ────────────────────────────────────────────────────

export interface XTweet {
  id: string
  text: string
  created_at?: string
  public_metrics?: {
    retweet_count: number
    like_count: number
    reply_count: number
    impression_count: number
  }
}

interface XTweetResponse {
  data: XTweet
}

interface XTweetsResponse {
  data: XTweet[]
  meta?: { result_count: number; newest_id?: string; oldest_id?: string }
}

/**
 * Post a tweet.
 * Requires tweet.write scope.
 * Free tier: up to 1,500 tweets/month per app.
 */
export async function postTweet(
  accessToken: string,
  text: string,
  replyToTweetId?: string,
): Promise<XTweet> {
  const body: Record<string, unknown> = { text }
  if (replyToTweetId) {
    body.reply = { in_reply_to_tweet_id: replyToTweetId }
  }
  const res = await apiPost<XTweetResponse>('tweets', accessToken, body)
  return res.data
}

/**
 * Get the authenticated user's own tweets.
 * Requires tweet.read scope.
 */
export async function getMyTweets(
  accessToken: string,
  userId: string,
  maxResults = 10,
): Promise<XTweet[]> {
  const res = await apiGet<XTweetsResponse>(`users/${userId}/tweets`, accessToken, {
    max_results: String(Math.min(maxResults, 100)),
    'tweet.fields': 'id,text,created_at,public_metrics',
  })
  return res.data ?? []
}

/**
 * Get mentions of the authenticated user.
 * Requires tweet.read scope.
 * NOTE: On Free tier this may return limited results.
 */
export async function getMentions(
  accessToken: string,
  userId: string,
  maxResults = 10,
): Promise<XTweet[]> {
  const res = await apiGet<XTweetsResponse>(`users/${userId}/mentions`, accessToken, {
    max_results: String(Math.min(maxResults, 100)),
    'tweet.fields': 'id,text,created_at,public_metrics',
  })
  return res.data ?? []
}

/**
 * Verify a token is still valid by fetching the user profile.
 */
export async function verifyToken(accessToken: string): Promise<XUser> {
  return getMe(accessToken)
}
