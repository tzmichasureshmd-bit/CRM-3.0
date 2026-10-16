/**
 * CRM 3.0 — FastAPI Client
 * All frontend pages use this to talk to the FastAPI backend (port 8000).
 * JWT token is stored in localStorage after login.
 * account_id is always from the JWT — never from the frontend.
 */

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const API  = `${BASE}/api/v1`;

// ── Token helpers ─────────────────────────────────────────────
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('crm_token');
}

export function setToken(token: string): void {
  localStorage.setItem('crm_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
}

export function getStoredUser(): { user_id: string; account_id: string; role: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('crm_user');
    return raw ? JSON.parse(raw) as { user_id: string; account_id: string; role: string } : null;
  } catch { return null; }
}

// Refresh token from Supabase session if localStorage token is missing/expired
async function getValidToken(): Promise<string | null> {
  const stored = getToken();
  if (stored) return stored;
  // Fallback: get fresh token from Supabase session
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      setToken(data.session.access_token);
      return data.session.access_token;
    }
  } catch { /* */ }
  return null;
}

// ── Core fetch wrapper ────────────────────────────────────────
// authOnly = true means 401 should throw (not redirect) — used for login/register
async function req<T = unknown>(
  path: string,
  options: RequestInit = {},
  authOnly = false,
): Promise<T> {
  const token = await getValidToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    const body = await res.text();
    let msg = 'Invalid credentials';
    try { msg = (JSON.parse(body) as { detail?: string }).detail ?? msg; } catch { /* */ }
    if (!authOnly) clearToken(); // clear stale token but do NOT redirect — layout handles it
    throw new Error(msg);
  }

  if (!res.ok) {
    const body = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = (JSON.parse(body) as { detail?: string }).detail ?? msg; } catch { /* */ }
    throw new Error(msg);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ── AUTH ──────────────────────────────────────────────────────
export interface AuthResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  account_id: string;
  role: string;
}

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const data = await req<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, true); // authOnly=true: 401 throws error, does NOT redirect
  setToken(data.access_token);
  localStorage.setItem('crm_user', JSON.stringify({
    user_id: data.user_id,
    account_id: data.account_id,
    role: data.role,
  }));
  return data;
}

export async function apiRegister(
  email: string,
  password: string,
  fullName: string,
  accountName: string,
): Promise<AuthResponse> {
  const data = await req<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name: fullName, account_name: accountName }),
  }, true); // authOnly=true: errors throw, do NOT redirect
  setToken(data.access_token);
  localStorage.setItem('crm_user', JSON.stringify({
    user_id: data.user_id,
    account_id: data.account_id,
    role: data.role,
  }));
  return data;
}

export async function apiLogout(): Promise<void> {
  try { await req('/auth/logout', { method: 'POST' }); } catch { /* */ }
  clearToken();
}

// ── CONTACTS ──────────────────────────────────────────────────
export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  lead_status: string | null;
  lead_score: number | null;
  lead_score_tier: string | null;
  lead_score_reason: string | null;
  source: string | null;
  tags: string[] | null;
  opt_out?: boolean | null;
  created_at: string;
}

export const getContacts = (params?: Record<string, string>) =>
  req<{ data: Contact[]; total: number }>(`/contacts${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const getContact = (id: string) =>
  req<Contact>(`/contacts/${id}`);

export const createContact = (body: Partial<Contact>) =>
  req<Contact>('/contacts', { method: 'POST', body: JSON.stringify(body) });

export const updateContact = (id: string, body: Partial<Contact>) =>
  req<Contact>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteContact = (id: string) =>
  req(`/contacts/${id}`, { method: 'DELETE' });

// ── DEALS ─────────────────────────────────────────────────────
export interface Deal {
  id: string;
  title: string;
  value: number | null;
  currency: string | null;
  status: string | null;
  stage_id: string | null;
  contact_id: string | null;
  notes: string | null;
  created_at: string;
  contacts?: { id: string; name: string | null } | null;
  pipeline_stages?: { id: string; name: string; color: string } | null;
}

export const getDeals = (params?: Record<string, string>) =>
  req<{ data: Deal[] }>(`/deals${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const getDealStats = () =>
  req<{ total_deals: number; open_deals: number; won_deals: number; lost_deals: number; total_pipeline_value: number; total_won_value: number; win_rate_pct: number }>('/deals/stats');

export const createDeal = (body: Partial<Deal>) =>
  req<Deal>('/deals', { method: 'POST', body: JSON.stringify(body) });

export const updateDeal = (id: string, body: Partial<Deal>) =>
  req<Deal>(`/deals/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const moveDeal = (id: string, stageId: string) =>
  req<Deal>(`/deals/${id}/move`, { method: 'PATCH', body: JSON.stringify({ stage_id: stageId }) });

export const deleteDeal = (id: string) =>
  req(`/deals/${id}`, { method: 'DELETE' });

export const getPipelineStages = () =>
  req<{ data: { id: string; name: string; color: string; position: number }[] }>('/pipeline-stages');

// ── LEADS ─────────────────────────────────────────────────────
export const getLeads = () =>
  req<{ data: Contact[]; total: number }>('/leads');

export const analyzeLead = (contactId: string) =>
  req<{ score: number; tier: string; intent: string; score_factors: unknown[]; next_best_action: string; ai_summary: string }>(`/leads/${contactId}/analyze`, { method: 'POST', body: '{}' });

// ── CONVERSATIONS ─────────────────────────────────────────────
export interface Conversation {
  id: string;
  contact_id: string | null;
  platform: string | null;
  status: string | null;
  priority: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_text: string | null;
  ai_intent: string | null;
  ai_sentiment: string | null;
  ai_summary: string | null;
  ai_lead_score: number | null;
  ai_next_action: string | null;
  created_at: string;
  contacts?: Contact | null;
}

export const getConversations = (params?: Record<string, string>) =>
  req<{ data: Conversation[]; total: number }>(`/conversations${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const getMessages = (convId: string, params?: Record<string, string>) =>
  req<{ data: unknown[]; total: number }>(`/conversations/${convId}/messages${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const assignConversation = (convId: string, agentId: string | null) =>
  req(`/conversations/${convId}/assign`, { method: 'PATCH', body: JSON.stringify({ agent_id: agentId }) });

export const updateConversationStatus = (convId: string, status: string) =>
  req(`/conversations/${convId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

// ── FOLLOW-UPS ────────────────────────────────────────────────
export interface FollowUp {
  id: string;
  title: string;
  due_date: string;
  status: string;
  priority: string | null;
  contact_id: string | null;
  notes: string | null;
  contacts?: { name: string | null } | null;
}

export const getFollowUps = (params?: Record<string, string>) =>
  req<{ data: FollowUp[]; total: number }>(`/follow-ups${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const createFollowUp = (body: Partial<FollowUp>) =>
  req<FollowUp>('/follow-ups', { method: 'POST', body: JSON.stringify(body) });

export const updateFollowUp = (id: string, body: Partial<FollowUp>) =>
  req<FollowUp>(`/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteFollowUp = (id: string) =>
  req(`/follow-ups/${id}`, { method: 'DELETE' });

// ── BROADCASTS ────────────────────────────────────────────────
export interface Broadcast {
  id: string;
  name: string;
  status: string;
  platform: string | null;
  message: string | null;
  total_recipients: number | null;
  sent_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  failed_count?: number | null;
  created_at: string;
  scheduled_at: string | null;
  sent_at?: string | null;
}

export interface BroadcastRecipientItem {
  contact_id: string;
  name: string;
  destination?: string;
  reason?: string;
}

export interface BroadcastRecipientPreview {
  broadcast_id?: string;
  broadcast_name?: string;
  message_preview?: string | null;
  platform: string;
  total_contacts: number;
  eligible_count: number;
  skipped_opt_out_count: number;
  skipped_no_address_count: number;
  eligible: BroadcastRecipientItem[];
  skipped_opt_out: BroadcastRecipientItem[];
  skipped_no_address: BroadcastRecipientItem[];
}

export interface BroadcastExecutionItem {
  contact_id: string;
  name: string;
  destination: string | null;
  status: 'sent' | 'failed' | 'skipped';
  reason?: string;
  error?: string;
  provider_message_id?: string;
  timestamp: string;
}

export interface BroadcastSendSummary {
  broadcast_id: string;
  account_id: string;
  platform: string;
  status: string;
  total_recipients: number;
  eligible_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  completed_at: string;
  results: BroadcastExecutionItem[];
}

export interface BroadcastRetryResponse {
  broadcast_id: string;
  retried_count: number;
  newly_sent: number;
  still_failed: number;
  message: string;
  summary?: BroadcastSendSummary;
}

export interface BroadcastIndividualSendPayload {
  contact_id: string;
  platform: string;
  message: string;
  broadcast_id?: string;
  subject?: string;
}

export interface BroadcastIndividualSendResponse {
  success: boolean;
  status: 'sent' | 'failed' | 'skipped';
  provider_message_id?: string;
  error?: string;
  contact_id: string;
  destination?: string;
  platform: string;
}

export const getBroadcasts = (params?: Record<string, string>) =>
  req<{ data: Broadcast[]; total: number }>(`/broadcasts${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const getBroadcast = (id: string) =>
  req<Broadcast>(`/broadcasts/${id}`);

export const createBroadcast = (body: Partial<Broadcast>) =>
  req<Broadcast>('/broadcasts', { method: 'POST', body: JSON.stringify(body) });

export const updateBroadcast = (id: string, body: Partial<Broadcast>) =>
  req<Broadcast>(`/broadcasts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteBroadcast = (id: string) =>
  req(`/broadcasts/${id}`, { method: 'DELETE' });

export const getBroadcastRecipientsPreview = (broadcastId: string) =>
  req<BroadcastRecipientPreview>(`/broadcasts/${broadcastId}/recipients-preview`);

export const sendBroadcastAll = (broadcastId: string, options?: { batch_size?: number; delay_ms?: number; selected_contact_ids?: string[] }) =>
  req<BroadcastSendSummary>(`/broadcasts/${broadcastId}/send-all`, {
    method: 'POST',
    body: JSON.stringify(options ?? { batch_size: 20, delay_ms: 50 }),
  });

export const retryBroadcastFailed = (broadcastId: string, options?: { batch_size?: number; delay_ms?: number }) =>
  req<BroadcastRetryResponse>(`/broadcasts/${broadcastId}/retry-failed`, {
    method: 'POST',
    body: JSON.stringify(options ?? { batch_size: 20, delay_ms: 50 }),
  });

export const getBroadcastResults = (broadcastId: string) =>
  req<BroadcastSendSummary>(`/broadcasts/${broadcastId}/results`);

export const sendBroadcastIndividual = (body: BroadcastIndividualSendPayload) =>
  req<BroadcastIndividualSendResponse>('/broadcasts/send-individual', {
    method: 'POST',
    body: JSON.stringify(body),
  });

// ── APPOINTMENTS ──────────────────────────────────────────────
export interface Appointment {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
  contact_id: string | null;
  notes: string | null;
  meeting_url: string | null;
  contacts?: { name: string | null } | null;
}

export const getAppointments = (params?: Record<string, string>) =>
  req<{ data: Appointment[]; total: number }>(`/appointments${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const createAppointment = (body: Partial<Appointment>) =>
  req<Appointment>('/appointments', { method: 'POST', body: JSON.stringify(body) });

export const updateAppointment = (id: string, body: Partial<Appointment>) =>
  req<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteAppointment = (id: string) =>
  req(`/appointments/${id}`, { method: 'DELETE' });

// ── CAMPAIGNS ─────────────────────────────────────────────────
export const getCampaigns = (params?: Record<string, string>) =>
  req<{ data: unknown[]; total: number }>(`/campaigns${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const createCampaign = (body: Record<string, unknown>) =>
  req<unknown>('/campaigns', { method: 'POST', body: JSON.stringify(body) });

export const updateCampaign = (id: string, body: Record<string, unknown>) =>
  req<unknown>(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteCampaign = (id: string) =>
  req(`/campaigns/${id}`, { method: 'DELETE' });

export const getMetaCampaigns = (params?: Record<string, string>) =>
  req<{ data: any[]; total: number; page: number; limit: number }>(`/campaigns/meta${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const syncMetaCampaigns = (body?: { access_token?: string; ad_account_id?: string }) =>
  req<{
    success: boolean;
    ad_account_id: string;
    api_version: string;
    fetched_count: number;
    created_count: number;
    updated_count: number;
    skipped_count: number;
    failed_count: number;
    duration_ms: number;
    last_synced_at: string;
    records: any[];
  }>('/campaigns/sync-meta', { method: 'POST', body: JSON.stringify(body ?? {}) });

export const getMetaSyncStatus = () =>
  req<{
    ad_account_id: string;
    app_id: string;
    api_version: string;
    token_configured: boolean;
    last_sync: {
      status: string;
      fetched_count: number;
      created_count: number;
      updated_count: number;
      skipped_count: number;
      failed_count: number;
      duration_ms: number;
      error_message: string | null;
      created_at: string;
    } | null;
  }>('/campaigns/meta/sync-status');

export interface MetaCredentialsInfo {
  ad_account_id: string;
  app_id: string;
  api_version: string;
  has_token: boolean;
  token_preview: string;
  is_connected: boolean;
}

export interface MetaConnectionTestResult {
  success: boolean;
  ad_account_id?: string;
  account_name?: string;
  account_status?: string;
  currency?: string;
  timezone?: string;
  business_name?: string;
  message?: string;
  error?: string;
  error_code?: number;
  hint?: string;
}

export const getMetaCredentials = () =>
  req<MetaCredentialsInfo>('/campaigns/meta/credentials');

export const saveMetaCredentials = (body: {
  ad_account_id?: string;
  app_id?: string;
  access_token?: string;
  api_version?: string;
}) =>
  req<{
    success: boolean;
    message: string;
    ad_account_id: string;
    app_id: string;
    api_version: string;
    has_token: boolean;
  }>('/campaigns/meta/credentials', { method: 'POST', body: JSON.stringify(body) });

export const testMetaConnection = (body?: {
  ad_account_id?: string;
  access_token?: string;
  api_version?: string;
}) =>
  req<MetaConnectionTestResult>('/campaigns/meta/test-connection', { method: 'POST', body: JSON.stringify(body ?? {}) });

export interface MetaPermissionsInfo {
  is_valid: boolean;
  has_ads_read: boolean;
  has_ads_management: boolean;
  granted_scopes: string[];
  missing_scopes: string[];
  can_manage: boolean;
  ad_account_id: string;
  ad_account_name?: string;
  account_status?: string;
  app_id: string;
  api_version: string;
  message: string;
}

export interface MetaCampaignCreatePayload {
  name: string;
  objective: string;
  status?: 'PAUSED' | 'ACTIVE';
  daily_budget?: number;
  lifetime_budget?: number;
  special_ad_categories?: string[];
}

export interface MetaCampaignUpdatePayload {
  name?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  daily_budget?: number;
  lifetime_budget?: number;
}

export interface MetaCampaignLiveDetails {
  id: string;
  meta_campaign_id?: string;
  name: string;
  status: string;
  crm_status: string;
  objective: string;
  daily_budget: number | null;
  lifetime_budget: number | null;
  start_time: string | null;
  stop_time: string | null;
  created_time: string | null;
  special_ad_categories: string[];
  buying_type: string;
  bid_strategy: string | null;
  insights: {
    impressions: number;
    clicks: number;
    spend: number;
    cpc: number;
    cpm: number;
    ctr: number;
  };
}

export const getMetaPermissions = () =>
  req<MetaPermissionsInfo>('/campaigns/meta/permissions');

export const createMetaCampaign = (body: MetaCampaignCreatePayload) =>
  req<{
    success: boolean;
    meta_campaign_id: string;
    name: string;
    objective: string;
    status: string;
    record: any;
    message: string;
  }>('/campaigns/meta/create', { method: 'POST', body: JSON.stringify(body) });

export const updateMetaCampaign = (metaCampaignId: string, body: MetaCampaignUpdatePayload) =>
  req<{
    success: boolean;
    meta_campaign_id: string;
    updated_fields: string[];
    status: string;
    message: string;
  }>(`/campaigns/meta/${metaCampaignId}`, { method: 'PATCH', body: JSON.stringify(body) });

export const pauseMetaCampaign = (metaCampaignId: string) =>
  req<{ success: boolean; meta_campaign_id: string; status: string; message: string }>(
    `/campaigns/meta/${metaCampaignId}/pause`,
    { method: 'POST', body: JSON.stringify({}) }
  );

export const resumeMetaCampaign = (metaCampaignId: string) =>
  req<{ success: boolean; meta_campaign_id: string; status: string; message: string }>(
    `/campaigns/meta/${metaCampaignId}/resume`,
    { method: 'POST', body: JSON.stringify({}) }
  );

export const archiveMetaCampaign = (metaCampaignId: string) =>
  req<{ success: boolean; meta_campaign_id: string; status: string; message: string }>(
    `/campaigns/meta/${metaCampaignId}/archive`,
    { method: 'POST', body: JSON.stringify({}) }
  );

export const getMetaCampaignLiveDetails = (metaCampaignId: string) =>
  req<MetaCampaignLiveDetails>(`/campaigns/meta/${metaCampaignId}`);


// ── AUTOMATIONS ───────────────────────────────────────────────
export const getAutomations = () =>
  req<{ data: unknown[] }>('/automations');

export const createAutomation = (body: Record<string, unknown>) =>
  req<unknown>('/automations', { method: 'POST', body: JSON.stringify(body) });

export const toggleAutomation = (id: string, isActive: boolean) =>
  req<unknown>(`/automations/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) });

export const deleteAutomation = (id: string) =>
  req(`/automations/${id}`, { method: 'DELETE' });

// ── AI AGENTS ─────────────────────────────────────────────────
export const getAgents = () =>
  req<{ data: unknown[] }>('/agents');

export const createAgent = (body: Record<string, unknown>) =>
  req<unknown>('/agents', { method: 'POST', body: JSON.stringify(body) });

export const runAgent = (id: string, body: Record<string, unknown>) =>
  req<unknown>(`/agents/${id}/run`, { method: 'POST', body: JSON.stringify(body) });

export const getAgentRuns = (id: string) =>
  req<{ data: unknown[] }>(`/agents/${id}/runs`);

export const updateAgent = (id: string, body: Record<string, unknown>) =>
  req<unknown>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteAgent = (id: string) =>
  req(`/agents/${id}`, { method: 'DELETE' });

// ── SEGMENTS ──────────────────────────────────────────────────
export const getSegments = () =>
  req<{ data: unknown[] }>('/segments');

export const createSegment = (body: Record<string, unknown>) =>
  req<unknown>('/segments', { method: 'POST', body: JSON.stringify(body) });

// ── JOURNEYS ──────────────────────────────────────────────────
export const getJourneys = () =>
  req<{ data: unknown[] }>('/journeys');

export const createJourney = (body: Record<string, unknown>) =>
  req<unknown>('/journeys', { method: 'POST', body: JSON.stringify(body) });

export const updateJourney = (id: string, body: Record<string, unknown>) =>
  req<unknown>(`/journeys/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteJourney = (id: string) =>
  req(`/journeys/${id}`, { method: 'DELETE' });

// ── REPORTS / COMMAND CENTER ──────────────────────────────────
export const getCommandCenter = () =>
  req<unknown>('/command-center');

export const getReports = (view: string) =>
  req<unknown>(`/reports?view=${view}`);

// ── HEALTH ────────────────────────────────────────────────────
export const getBackendHealth = () =>
  req<{ status: string; database: string; version: string }>('/health');
