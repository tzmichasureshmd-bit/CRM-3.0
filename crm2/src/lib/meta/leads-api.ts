/**
 * Meta Graph API helpers for Facebook + Instagram Lead Ads.
 *
 * Uses the OFFICIAL Meta Graph API (never scraping / browser
 * automation / fake data). All calls are server-side with a Bearer
 * token; secrets never leave the server.
 *
 * Permission model (2026 docs):
 *   - pages_show_list        — discover the user's Pages
 *   - pages_manage_metadata  — subscribe Pages to the leadgen webhook
 *   - leads_retrieval        — read lead form submissions
 *   - ads_management         — read ad/campaign attribution on leads
 *
 * Instagram Lead Ads are associated with a Facebook Page (an
 * Instagram Professional account is linked to the business Page), so
 * the same Page-access token + leadgen webhook covers Instagram leads
 * too. We discover the linked Instagram Professional account through
 * the Page's `instagram_business_account` edge.
 */

export const META_LEADS_API_VERSION = 'v21.0'
export const META_LEADS_API_BASE = `https://graph.facebook.com/${META_LEADS_API_VERSION}`

export interface MetaLeadApiErrorShape {
  error?: {
    message?: string
    code?: number
    type?: string
    error_subcode?: number
    fbtrace_id?: string
  }
}

export class MetaLeadsApiError extends Error {
  readonly status: number
  readonly code: number | null
  readonly type: string | null
  readonly operation: string
  readonly metaMessage: string | null

  constructor(opts: {
    status: number
    code?: number | null
    type?: string | null
    message?: string | null
    operation: string
  }) {
    super(
      opts.operation
        ? `${opts.operation}: ${opts.message || `Meta API error (HTTP ${opts.status})`}`
        : opts.message || `Meta API error (HTTP ${opts.status})`,
    )
    this.status = opts.status
    this.code = opts.code ?? null
    this.type = opts.type ?? null
    this.operation = opts.operation
    this.metaMessage = opts.message ?? null
    this.name = 'MetaLeadsApiError'
  }
}

async function throwMetaLeadsError(
  response: Response,
  fallback: string,
  operation: string,
): Promise<never> {
  let message: string | null = null
  let code: number | null = null
  let type: string | null = null
  try {
    const data = (await response.json()) as MetaLeadApiErrorShape
    if (data.error?.message) message = data.error.message
    if (typeof data.error?.code === 'number') code = data.error.code
    if (typeof data.error?.type === 'string') type = data.error.type
  } catch {
    // non-JSON body — use fallback
  }
  throw new MetaLeadsApiError({
    status: response.status,
    code,
    type,
    message: message ?? fallback,
    operation,
  })
}

async function throwIfNotOk(response: Response, operation: string): Promise<void> {
  if (!response.ok) {
    await throwMetaLeadsError(response, `Meta API error (HTTP ${response.status})`, operation)
  }
}

// ------------------------------------------------------------
// OAuth
// ------------------------------------------------------------

export interface GrantedPermission {
  permission: string
  status: 'granted' | 'declined'
}

/**
 * Inspect the permissions actually granted by the user for a given token.
 * Used after code exchange to verify required scopes before saving.
 */
export async function getGrantedPermissions(
  userAccessToken: string,
): Promise<GrantedPermission[]> {
  const res = await fetch(`${META_LEADS_API_BASE}/me/permissions`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  })
  await throwIfNotOk(res, 'get_permissions')
  const data = (await res.json()) as { data?: GrantedPermission[] }
  return data.data ?? []
}

export interface ExchangeCodeResult {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: { message?: string; code?: number }
}

/**
 * Exchange the OAuth authorization code for a (short-lived) User
 * access token, then immediately extend it to a long-lived token
 * (~60 days) via the fb_exchange_token grant. These calls use
 * META_APP_ID + META_APP_SECRET server-side.
 */
export async function exchangeCodeForLongLivedToken(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresIn?: number }> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    throw new MetaLeadsApiError({
      status: 500,
      message: 'META_APP_ID / META_APP_SECRET are not configured',
      operation: 'exchange_code',
    })
  }

  // 1. code -> short-lived user token
  const shortParams = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
    redirect_uri: redirectUri,
  })
  const shortRes = await fetch(
    `${META_LEADS_API_BASE}/oauth/access_token?${shortParams.toString()}`,
  )
  await throwIfNotOk(shortRes, 'exchange_code')
  const shortData = (await shortRes.json()) as ExchangeCodeResult
  if (!shortData.access_token) {
    throw new MetaLeadsApiError({
      status: 400,
      message:
        shortData.error?.message ?? 'Meta returned no access token for this code.',
      code: shortData.error?.code ?? null,
      operation: 'exchange_code',
    })
  }

  // 2. short-lived -> long-lived user token
  const longParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortData.access_token,
  })
  const longRes = await fetch(
    `${META_LEADS_API_BASE}/oauth/access_token?${longParams.toString()}`,
  )
  if (longRes.ok) {
    const longData = (await longRes.json()) as ExchangeCodeResult
    if (longData.access_token) {
      return {
        accessToken: longData.access_token,
        expiresIn: longData.expires_in,
      }
    }
  }
  // If the exchange failed, fall back to the short-lived token rather
  // than failing the whole connect (rare; typically fine for a one-off
  // discovery pass).
  return { accessToken: shortData.access_token }
}

// ------------------------------------------------------------
// Discovery
// ------------------------------------------------------------

export interface MetaPage {
  id: string
  name: string
  access_token?: string
  category?: string
  picture?: { data?: { url?: string } }
  /** Linked Instagram Professional account (when present). */
  instagram_business_account?: { id: string; username?: string; name?: string }
}

export interface DiscoveredPage {
  id: string
  name: string
  category?: string
  pageAccessToken: string
  instagram?: {
    id: string
    username?: string
    name?: string
  } | null
}

export interface UserPagesResponse {
  data?: MetaPage[]
  error?: { message?: string }
}

/**
 * List all Facebook Pages the user can manage (pages_show_list), and
 * for each discover the linked Instagram Professional account and the
 * Page access token (pages_manage_metadata). This runs against the
 * user's long-lived access token.
 */
export async function discoverPages(
  userAccessToken: string,
): Promise<DiscoveredPage[]> {
  const url =
    `${META_LEADS_API_BASE}/me/accounts?fields=` +
    encodeURIComponent(
      'id,name,access_token,category,picture,' +
        'instagram_business_account{id,username,name}',
    )
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  })
  await throwIfNotOk(res, 'discover_pages')
  const data = (await res.json()) as UserPagesResponse
  if (data.error?.message) {
    throw new MetaLeadsApiError({
      status: 400,
      message: data.error.message,
      operation: 'discover_pages',
    })
  }
  const pages = data.data ?? []
  return pages
    .filter((p) => p.id && p.name && p.access_token)
    .map<DiscoveredPage>((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      pageAccessToken: p.access_token!,
      instagram: p.instagram_business_account
        ? {
            id: p.instagram_business_account.id,
            username: p.instagram_business_account.username,
            name: p.instagram_business_account.name,
          }
        : null,
    }))
}

// ------------------------------------------------------------
// Webhook subscription
// ------------------------------------------------------------

/**
 * Install the app onto a Page for the `leadgen` webhook field. This is
 * what makes Meta actually deliver lead events to our webhook URL.
 * Uses the Page access token (pages_manage_metadata).
 */
export async function subscribePageToLeadgen(
  pageId: string,
  pageAccessToken: string,
): Promise<void> {
  const params = new URLSearchParams({
    subscribed_fields: 'leadgen',
    access_token: pageAccessToken,
  })
  const res = await fetch(
    `${META_LEADS_API_BASE}/${pageId}/subscribed_apps?${params.toString()}`,
    { method: 'POST' },
  )
  // Some Pages already have the app installed; Meta may return success
  // or a benign "already subscribed" error. Treat HTTP 200 as success
  // and swallow a couple of known idempotent codes.
  if (res.ok) {
    const body = (await res.json().catch(() => ({ success: true }))) as {
      success?: boolean
      error?: { code?: number }
    }
    if (body.success === false && body.error?.code !== 100) {
      throw new MetaLeadsApiError({
        status: 400,
        message: 'Could not subscribe page to leadgen webhook',
        operation: 'subscribe_page',
      })
    }
    return
  }
  const errData = (await res.json().catch(() => ({}))) as {
    error?: { code?: number }
  }
  // code 100 = "permission not granted / already installed" style benign
  if (errData.error?.code === 100) return
  await throwMetaLeadsError(res, `Subscription failed (HTTP ${res.status})`, 'subscribe_page')
}

/**
 * Install the app onto a Page for the `messages` webhook field — this is
 * what delivers Facebook Messenger + Instagram DM events to the same
 * webhook URL the leadgen subscription uses. Uses the Page access token.
 *
 * Returns `true` on success, `false` on failure (never throws).
 * The caller decides how to record webhook_status.
 */
export async function subscribePageToMessaging(
  pageId: string,
  pageAccessToken: string,
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      subscribed_fields: 'messages',
      access_token: pageAccessToken,
    })
    const res = await fetch(
      `${META_LEADS_API_BASE}/${pageId}/subscribed_apps?${params.toString()}`,
      { method: 'POST' },
    )
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as {
        error?: { code?: number; message?: string }
      }
      // code 100 = already subscribed / benign
      if (errData.error?.code === 100) return true
      console.error(
        `[meta/oauth] facebook messaging subscription: failure page=${pageId}`,
        `code=${errData.error?.code ?? 'n/a'} message=${errData.error?.message ?? 'n/a'}`,
      )
      return false
    }
    console.log(`[meta/oauth] facebook messaging subscription: success page=${pageId}`)
    return true
  } catch (err) {
    console.error(
      `[meta/oauth] facebook messaging subscription: failure page=${pageId}`,
      err instanceof Error ? err.message : String(err),
    )
    return false
  }
}

// ------------------------------------------------------------
// Lead retrieval
// ------------------------------------------------------------

export interface LeadFormField {
  name?: string
  values?: string[]
}

export interface MetaLead {
  id: string
  created_time?: string
  form_id?: string
  form_name?: string
  ad_id?: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  is_organic?: boolean
  field_data?: LeadFormField[]
}

/**
 * Fetch the full details of a single lead (leads_retrieval) given the
 * `leadgen_id` received in the webhook. Ad/campaign attribution is
 * included when the token has ads_management + pages_read_engagement.
 */
export async function getLeadDetails(
  leadgenId: string,
  accessToken: string,
): Promise<MetaLead> {
  const fields = [
    'id',
    'created_time',
    'form_id',
    'form_name',
    'ad_id',
    'ad_name',
    'adset_id',
    'adset_name',
    'campaign_id',
    'campaign_name',
    'is_organic',
    'field_data',
  ].join(',')
  const url = `${META_LEADS_API_BASE}/${leadgenId}?fields=${encodeURIComponent(fields)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  await throwIfNotOk(res, 'get_lead_details')
  return (await res.json()) as MetaLead
}

// ------------------------------------------------------------
// Lead forms (for the Settings UI list)
// ------------------------------------------------------------

export interface LeadFormSummary {
  id: string
  name: string
  status?: string
}

/**
 * List the Page's lead forms (leads_retrieval) for display in Settings.
 */
export async function getPageLeadForms(
  pageId: string,
  accessToken: string,
): Promise<LeadFormSummary[]> {
  const url =
    `${META_LEADS_API_BASE}/${pageId}/leadgen_forms?fields=` +
    encodeURIComponent('id,name,status')
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    // Forms listing is best-effort for the UI; don't hard-fail.
    return []
  }
  const data = (await res.json()) as { data?: LeadFormSummary[] }
  return data.data ?? []
}

/**
 * Fetch the most recent lead submissions for a lead form
 * (leads_retrieval). Backs the manual "Sync now" action after a
 * disconnect/reconnect gap — pulls the same fields the webhook uses so
 * `processMetaLead` can attribute campaign/ad/form details, and
 * `meta_lead_events` dedupes anything the webhook already delivered.
 * `limit` is capped at 100 per the Graph API.
 */
export async function getLeadFormLeads(
  formId: string,
  accessToken: string,
  limit = 25,
): Promise<MetaLead[]> {
  const fields = [
    'id',
    'created_time',
    'form_id',
    'form_name',
    'ad_id',
    'ad_name',
    'adset_id',
    'adset_name',
    'campaign_id',
    'campaign_name',
    'is_organic',
    'field_data',
  ].join(',')
  const capped = Math.max(1, Math.min(limit, 100))
  const url =
    `${META_LEADS_API_BASE}/${formId}/leads?fields=${encodeURIComponent(fields)}` +
    `&limit=${capped}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  await throwIfNotOk(res, 'get_lead_form_leads')
  const data = (await res.json()) as { data?: MetaLead[] }
  return data.data ?? []
}
