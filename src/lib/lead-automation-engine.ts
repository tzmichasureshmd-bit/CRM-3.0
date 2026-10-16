/**
 * CRM 3.0 — Prompt-Based Lead Automation Engine
 */

import type { ContactRecord } from './crm-pipeline-store';

export interface ParsedLeadIntent {
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  stageId: string;
  stageName: string;
  tier: 'hot' | 'warm' | 'cold';
  score: number;
  tags: string[];
  rationale: string;
  suggestedAction: string;
  missingFields: ('name' | 'phone' | 'email')[];
  confidence: 'high' | 'medium' | 'low';
  summary: string;
}

export interface DuplicateLeadCheckResult {
  hasDuplicate: boolean;
  warningMessage: string | null;
  matchedContact: ContactRecord | null;
}

const CRM_STAGE_NAMES: Record<string, string> = {
  new: 'New Leads',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

function extractPhone(text: string): string | null {
  const phoneRegex = /(?:\+?\d{1,3}[-.\\s]?)?\(?\d{3,5}\)?[-.\\s]?\d{3,5}[-.\\s]?\d{3,5}/;
  const match = text.match(phoneRegex);
  if (match) {
    const raw = match[0].trim();
    if (raw.replace(/\D/g, '').length >= 10) return raw;
  }
  return null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].trim() : null;
}

function extractCompany(text: string): string | null {
  const match = text.match(/(?:from|at|company|working at|organization)\s+([A-Z][A-Za-z0-9&.\s'-]+?)(?:\s+(?:with|phone|email|interested|who|,|\.|$))/i);
  if (match?.[1]) {
    const candidate = match[1].trim();
    if (candidate.length > 1 && !/^(the|a|an|new|hot|our)$/i.test(candidate)) return candidate;
  }
  return null;
}

function extractName(text: string, detectedCompany: string | null): string {
  const m1 = text.match(/(?:lead|contact|person|name)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  if (m1?.[1]) return m1[1].trim();
  const m2 = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:from|at)/);
  if (m2?.[1]) return m2[1].trim();
  const words = text.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g);
  if (words) {
    for (const w of words) {
      if (detectedCompany && detectedCompany.includes(w)) continue;
      if (!/^(Create|Sales|WhatsApp|New Lead)$/i.test(w)) return w;
    }
  }
  return detectedCompany ? `${detectedCompany} Representative` : 'New Lead';
}

function extractTags(text: string): string[] {
  const tags: Set<string> = new Set();
  const lower = text.toLowerCase();
  const tagMatch = text.match(/(?:tags?|tagged as|tag as)\s*:?\s*([^,.;]+(?:,\s*[^,.;]+)*)/i);
  if (tagMatch?.[1]) {
    for (const t of tagMatch[1].split(/,|and/)) {
      const clean = t.trim().toLowerCase().replace(/^#/, '');
      if (clean && clean.length > 2 && !/^(a|an|the)$/.test(clean)) tags.add(clean);
    }
  }
  if (lower.includes('enterprise')) tags.add('enterprise');
  if (lower.includes('whatsapp')) tags.add('whatsapp-api');
  if (lower.includes('inbound')) tags.add('inbound');
  if (lower.includes('retail')) tags.add('retail');
  if (lower.includes('fintech')) tags.add('fintech');
  if (lower.includes('urgent')) tags.add('urgent');
  if (lower.includes('saas')) tags.add('saas');
  return Array.from(tags).slice(0, 5);
}

export function parseNaturalLanguageLead(
  prompt: string,
  _existingContacts: ContactRecord[]
): ParsedLeadIntent {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  const phone = extractPhone(trimmed);
  const email = extractEmail(trimmed);
  const company = extractCompany(trimmed);
  const name = extractName(trimmed, company);
  const tags = extractTags(trimmed);

  let tier: 'hot' | 'warm' | 'cold' = 'warm';
  let score = 60;
  if (/hot|urgent|high priority|high intent|immediate|vip/i.test(lower)) { tier = 'hot'; score = 85; }
  else if (/cold|low priority|future|nurture|later/i.test(lower)) { tier = 'cold'; score = 25; }

  let stageId = 'new';
  if (/won|converted/i.test(lower)) stageId = 'won';
  else if (/negotiat/i.test(lower)) stageId = 'negotiation';
  else if (/proposal|quote/i.test(lower)) stageId = 'proposal';
  else if (/qualif/i.test(lower)) stageId = 'qualified';
  else if (/contacted|called|spoke/i.test(lower)) stageId = 'contacted';

  const stageName = CRM_STAGE_NAMES[stageId] ?? 'New Leads';

  const missingFields: ('name' | 'phone' | 'email')[] = [];
  if (!name || name === 'New Lead') missingFields.push('name');
  if (!phone) missingFields.push('phone');
  if (!email) missingFields.push('email');

  const rationale = `Prioritized as ${tier.toUpperCase()} (${score} pts) based on ${
    tier === 'hot' ? 'urgent buyer intent and active inquiry' : 'qualification requirements'
  }.${company ? ` Organization: ${company}.` : ''}`;

  const suggestedAction =
    tier === 'hot'
      ? 'Initiate WhatsApp outreach within 30 minutes to maximize conversion rate'
      : 'Send introduction brochure and schedule qualification call';

  const confidence: 'high' | 'medium' | 'low' =
    phone && name !== 'New Lead' ? 'high' : phone || email ? 'medium' : 'low';

  const summary = `Add lead "${name}"${company ? ` (${company})` : ''} to stage "${stageName}" with ${tier.toUpperCase()} priority (${score} pts).`;

  return { name, phone, email, company, stageId, stageName, tier, score, tags, rationale, suggestedAction, missingFields, confidence, summary };
}

export function checkDuplicateLead(
  name: string,
  phone: string | null,
  email: string | null,
  existingContacts: ContactRecord[]
): DuplicateLeadCheckResult {
  const normName = name.trim().toLowerCase();
  const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
  const normEmail = email ? email.trim().toLowerCase() : '';

  for (const contact of existingContacts) {
    if (cleanPhone && cleanPhone.length >= 10 && contact.phone) {
      const existingClean = contact.phone.replace(/\D/g, '');
      if (existingClean === cleanPhone || (existingClean.length >= 10 && existingClean.endsWith(cleanPhone.slice(-10)))) {
        return {
          hasDuplicate: true,
          warningMessage: `A lead with this phone number already exists: "${contact.name || contact.phone}" (${contact.company || 'No company'}).`,
          matchedContact: contact,
        };
      }
    }
    if (normEmail && contact.email && contact.email.toLowerCase() === normEmail) {
      return {
        hasDuplicate: true,
        warningMessage: `A lead with this email already exists: "${contact.name || contact.email}" (${contact.company || 'No company'}).`,
        matchedContact: contact,
      };
    }
    if (normName && normName !== 'new lead' && contact.name && contact.name.toLowerCase() === normName) {
      return {
        hasDuplicate: true,
        warningMessage: `A lead with this name already exists: "${contact.name}" (${contact.phone || contact.email || 'No contact info'}).`,
        matchedContact: contact,
      };
    }
  }

  return { hasDuplicate: false, warningMessage: null, matchedContact: null };
}
