/**
 * CRM 3.0 — AI Orchestrator
 * Central hub for all AI operations.
 * Every AI call goes through here — never scattered across components.
 */

import type {
  AIOperationType,
  AIProvider,
  LeadIntelligence,
  NextBestAction,
  NBAObjectType,
  CommandCenterState,
  AIRecommendation,
} from '@/types/crm3';

// ── Tool definitions (explicit, no unrestricted DB access) ────

export const AI_TOOLS = {
  getLead: 'getLead',
  searchLeads: 'searchLeads',
  getCustomer: 'getCustomer',
  searchCustomers: 'searchCustomers',
  getConversation: 'getConversation',
  getCampaign: 'getCampaign',
  getPipeline: 'getPipeline',
  getDeals: 'getDeals',
  createTask: 'createTask',
  createFollowUp: 'createFollowUp',
  assignLead: 'assignLead',
  generateContent: 'generateContent',
  summarizeConversation: 'summarizeConversation',
  recommendNextAction: 'recommendNextAction',
  getTeamWorkload: 'getTeamWorkload',
  getRevenueMetrics: 'getRevenueMetrics',
  searchKnowledge: 'searchKnowledge',
} as const;

export type AITool = (typeof AI_TOOLS)[keyof typeof AI_TOOLS];

// ── Lead Intelligence ─────────────────────────────────────────

export async function analyzeLeadIntelligence(
  contactId: string,
  accountId: string,
  context: {
    messages?: { text: string; sender: string }[];
    leadStatus?: string;
    tags?: string[];
    lastActivity?: string;
    source?: string;
  }
): Promise<LeadIntelligence> {
  const res = await fetch('/api/v3/ai/lead-intelligence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId, accountId, context }),
  });
  if (!res.ok) throw new Error('Lead intelligence failed');
  return res.json();
}

// ── Next Best Action ──────────────────────────────────────────

export async function getNextBestAction(
  objectType: NBAObjectType,
  objectId: string,
  accountId: string
): Promise<NextBestAction> {
  const res = await fetch('/api/v3/ai/next-best-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectType, objectId, accountId }),
  });
  if (!res.ok) throw new Error('NBA failed');
  return res.json();
}

// ── Command Center ────────────────────────────────────────────

export async function getCommandCenterState(accountId: string): Promise<CommandCenterState> {
  const res = await fetch(`/api/v3/command-center?accountId=${accountId}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Command center failed');
  return res.json();
}

// ── AI Copilot ────────────────────────────────────────────────

export async function queryCopilot(
  query: string,
  sessionId: string,
  accountId: string,
  userId: string
): Promise<{ answer: string; data_source: string; confidence: string }> {
  const res = await fetch('/api/v3/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, sessionId, accountId, userId }),
  });
  if (!res.ok) throw new Error('Copilot query failed');
  return res.json();
}

// ── Content Generation ────────────────────────────────────────

export async function generateContent(
  prompt: string,
  accountId: string,
  options: {
    platform?: string;
    tone?: string;
    brandVoice?: string;
    targetAudience?: string;
  }
): Promise<{
  headline: string;
  caption: string;
  cta: string;
  hashtags: string[];
  variants: Record<string, string>;
}> {
  const res = await fetch('/api/v3/ai/generate-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, accountId, options }),
  });
  if (!res.ok) throw new Error('Content generation failed');
  return res.json();
}

// ── Conversation Intelligence ─────────────────────────────────

export async function summarizeConversation(
  conversationId: string,
  accountId: string
): Promise<{ summary: string; intent: string; sentiment: string; next_action: string }> {
  const res = await fetch('/api/v3/ai/summarize-conversation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, accountId }),
  });
  if (!res.ok) throw new Error('Summarize failed');
  return res.json();
}

// ── AI Recommendations ────────────────────────────────────────

export async function getAIRecommendations(accountId: string): Promise<AIRecommendation[]> {
  const res = await fetch(`/api/v3/ai/recommendations?accountId=${accountId}`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return res.json();
}

// ── Usage tracking helper ─────────────────────────────────────

export function buildOperationMeta(
  type: AIOperationType,
  provider: AIProvider,
  model: string
) {
  return { type, provider, model, started_at: new Date().toISOString() };
}
