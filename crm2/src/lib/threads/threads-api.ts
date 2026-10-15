/**
 * Threads API client.
 * Official API only: https://developers.facebook.com/docs/threads
 *
 * OAuth 2.0 flow:
 *   1. Redirect user to threads.net/oauth/authorize
 *   2. Exchange code for short-lived token (1 hour)
 *   3. Exchange short-lived for long-lived token (60 days)
 *   4. Refresh long-lived token before expiry
 *
 * Tokens are always decrypted server-side, never sent to frontend.
 * DMs are NOT supported by the Threads API — this client does not
 * implement or claim DM capability.
 */

const THREADS_API_BASE = 'https://graph.threads.net/v1.0'
const THREADS_AUTH_BASE = 'https://threads.net/oauth'
const THREADS_TOKEN_URL = 'https://graph.threads.net/oauth/access_token'

export class ThreadsApiError extends Error {
  readonly code: number | null
  readonly type: string | null
  readonly operation: string

  constructor(opts: {
    code?: number | null
    type?: string | null
    message: string
    operation: string
  }) {
    super(`${opts.operation}: ${opts.message}`)
    this.code = opts.code ?? null
    this.type = opts.type ?? null
    this.operation = opts.operation
    this.name = 'ThreadsApiError'
  }
}

interface ThreadsErrorBody {
  error?: {
    message?: string
    type?: string
    code?: number
  }
}

async function apiGet<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${THREADS_API_BASE}/${path}`)
  url.searchParams.set('access_token', accessToken)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ThreadsErrorBody
    throw new ThreadsApiError({
      code: body.error?.code ?? res.status,
      type: body.error?.type ?? null,
      message: body.error?.message ?? `HTTP ${res.status}`,
      operation: path,
    })
  }
  return res.json() as Promise<T>
}

async function apiPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, string>,
): Promise<T> {
  const url = new URL(`${THREADS_API_BASE}/${path}`)
  url.searchParams.set('access_token', accessToken)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as ThreadsErrorBody
    throw new ThreadsApiError({
      code: errBody.error?.code ?? res.status,
      type: errBody.error?.type ?? null,
      message: errBody.error?.message ?? `HTTP ${res.status}`,
      operation: path,
    })
  }
  return res.json() as Promise<T>
}

// ── OAuth ─────────────────────────────────────────────────────

export interface ThreadsOAuthConfig {
  appId: string
  appSecret: string
  redirectUri: string
}

/**
 * Build the Threads OAuth authorization URL.
 * Scopes: threads_basic (required), threads_content_publish, threads_manage_replies
 */
export function buildAuthUrl(config: ThreadsOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: 'threads_basic,threads_content_publish,threads_manage_replies',
    response_type: 'code',
    state,
  })
  return `${THREADS_AUTH_BASE}/authorize?${params.toString()}`
}

export interface ThreadsShortLivedToken {
  access_token: string
  user_id: string
}

/**
 * Exchange authorization code for a short-lived access token (1 hour).
 */
export async function exchangeCodeForToken(
  config: ThreadsOAuthConfig,
  code: string,
): Promise<ThreadsShortLivedToken> {
  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    code,
  })
  const res = await fetch(THREADS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as ThreadsErrorBody
    throw new ThreadsApiError({
      code: res.status,
      message: errBody.error?.message ?? `Token exchange failed (HTTP ${res.status})`,
      operation: 'exchangeCodeForToken',
    })
  }
  return res.json() as Promise<ThreadsShortLivedToken>
}

export interface ThreadsLongLivedToken {
  access_token: string
  token_type: string
  expires_in: number // seconds
}

/**
 * Exchange a short-lived token for a long-lived token (60 days).
 */
export async function exchangeForLongLivedToken(
  appSecret: string,
  shortLivedToken: string,
): Promise<ThreadsLongLivedToken> {
  const url = new URL(`${THREADS_API_BASE}/access_token`)
  url.searchParams.set('grant_type', 'th_exchange_token')
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('access_token', shortLivedToken)
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as ThreadsErrorBody
    throw new ThreadsApiError({
      code: res.status,
      message: errBody.error?.message ?? `Long-lived token exchange failed (HTTP ${res.status})`,
      operation: 'exchangeForLongLivedToken',
    })
  }
  return res.json() as Promise<ThreadsLongLivedToken>
}

/**
 * Refresh a long-lived token before it expires.
 * Can only be refreshed when it is at least 24 hours old and not yet expired.
 */
export async function refreshLongLivedToken(
  accessToken: string,
): Promise<ThreadsLongLivedToken> {
  const url = new URL(`${THREADS_API_BASE}/refresh_access_token`)
  url.searchParams.set('grant_type', 'th_refresh_token')
  url.searchParams.set('access_token', accessToken)
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as ThreadsErrorBody
    throw new ThreadsApiError({
      code: res.status,
      message: errBody.error?.message ?? `Token refresh failed (HTTP ${res.status})`,
      operation: 'refreshLongLivedToken',
    })
  }
  return res.json() as Promise<ThreadsLongLivedToken>
}

// ── Profile ───────────────────────────────────────────────────

export interface ThreadsProfile {
  id: string
  username: string
  name: string
  threads_profile_picture_url?: string
  threads_biography?: string
  followers_count?: number
}

export async function getProfile(accessToken: string): Promise<ThreadsProfile> {
  return apiGet<ThreadsProfile>('me', accessToken, {
    fields: 'id,username,name,threads_profile_picture_url,threads_biography,followers_count',
  })
}

// ── Publishing ────────────────────────────────────────────────

export interface ThreadsMediaContainer {
  id: string
}

export interface ThreadsPublishResult {
  id: string
}

/**
 * Step 1: Create a media container for a text post.
 */
export async function createTextContainer(
  userId: string,
  accessToken: string,
  text: string,
): Promise<ThreadsMediaContainer> {
  return apiPost<ThreadsMediaContainer>(`${userId}/threads`, accessToken, {
    media_type: 'TEXT',
    text,
  })
}

/**
 * Step 2: Publish the media container.
 */
export async function publishContainer(
  userId: string,
  accessToken: string,
  creationId: string,
): Promise<ThreadsPublishResult> {
  return apiPost<ThreadsPublishResult>(`${userId}/threads_publish`, accessToken, {
    creation_id: creationId,
  })
}

/**
 * Publish a text post in one call (creates container then publishes).
 */
export async function publishTextPost(
  userId: string,
  accessToken: string,
  text: string,
): Promise<ThreadsPublishResult> {
  const container = await createTextContainer(userId, accessToken, text)
  // Threads recommends a short delay between container creation and publish
  await new Promise((r) => setTimeout(r, 1000))
  return publishContainer(userId, accessToken, container.id)
}

// ── Replies ───────────────────────────────────────────────────

export interface ThreadsReply {
  id: string
  text?: string
  username?: string
  timestamp?: string
}

export interface ThreadsRepliesResponse {
  data: ThreadsReply[]
  paging?: { cursors?: { before?: string; after?: string }; next?: string }
}

/**
 * Get replies to a specific thread post.
 * Requires threads_manage_replies scope.
 */
export async function getReplies(
  mediaId: string,
  accessToken: string,
): Promise<ThreadsRepliesResponse> {
  return apiGet<ThreadsRepliesResponse>(`${mediaId}/replies`, accessToken, {
    fields: 'id,text,username,timestamp',
  })
}

/**
 * Reply to a thread post.
 * Requires threads_manage_replies scope.
 */
export async function replyToPost(
  userId: string,
  accessToken: string,
  replyToId: string,
  text: string,
): Promise<ThreadsPublishResult> {
  const container = await apiPost<ThreadsMediaContainer>(`${userId}/threads`, accessToken, {
    media_type: 'TEXT',
    text,
    reply_to_id: replyToId,
  })
  await new Promise((r) => setTimeout(r, 1000))
  return publishContainer(userId, accessToken, container.id)
}

// ── Token validation ──────────────────────────────────────────

/**
 * Verify a token is still valid by fetching the profile.
 * Returns the profile on success, throws ThreadsApiError on failure.
 */
export async function verifyToken(accessToken: string): Promise<ThreadsProfile> {
  return getProfile(accessToken)
}
