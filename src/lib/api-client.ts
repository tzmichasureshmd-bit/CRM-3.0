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
  created_at: string;
  scheduled_at: string | null;
}

export const getBroadcasts = (params?: Record<string, string>) =>
  req<{ data: Broadcast[]; total: number }>(`/broadcasts${params ? '?' + new URLSearchParams(params).toString() : ''}`);

export const createBroadcast = (body: Partial<Broadcast>) =>
  req<Broadcast>('/broadcasts', { method: 'POST', body: JSON.stringify(body) });

export const updateBroadcast = (id: string, body: Partial<Broadcast>) =>
  req<Broadcast>(`/broadcasts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteBroadcast = (id: string) =>
  req(`/broadcasts/${id}`, { method: 'DELETE' });

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
