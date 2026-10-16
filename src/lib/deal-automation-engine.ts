/**
 * CRM 3.0 — Prompt-Based Deal Automation Engine
 */

import type { ContactRecord, DealRecord, PipelineStageRecord } from './crm-pipeline-store';

export interface ParsedDealIntent {
  title: string;
  company: string | null;
  value: number;
  currency: string;
  stageId: string;
  stageName: string;
  matchedContactId: string | null;
  matchedContactName: string | null;
  suggestedContactName: string | null;
  notes: string;
  needsFollowUp: boolean;
  followUpTitle: string;
  followUpDays: number;
  qualificationRules: string[];
  progressionRule: string;
  missingFields: ('title' | 'value' | 'contact')[];
  confidence: 'high' | 'medium' | 'low';
  summary: string;
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  warningMessage: string | null;
  matchedDeal: DealRecord | null;
}

export const STAGE_PROGRESSION_RULES: Record<string, { label: string; criteria: string; nextStage: string }> = {
  new: {
    label: 'New → Contacted',
    criteria: 'Establish first communication channel (WhatsApp/call) and log initial contact within 24h.',
    nextStage: 'contacted',
  },
  contacted: {
    label: 'Contacted → Qualified',
    criteria: 'Validate budget, authority, need, and timeline (BANT criteria).',
    nextStage: 'qualified',
  },
  qualified: {
    label: 'Qualified → Proposal',
    criteria: 'Deliver itemized quotation or proposal deck matching confirmed budget.',
    nextStage: 'proposal',
  },
  proposal: {
    label: 'Proposal → Negotiation',
    criteria: 'Prospect has reviewed quote; address pricing, payment terms, or custom requirements.',
    nextStage: 'negotiation',
  },
  negotiation: {
    label: 'Negotiation → Won',
    criteria: 'Contract/agreement executed and initial payment receipt confirmed.',
    nextStage: 'won',
  },
};

function extractValueAndCurrency(text: string): { value: number; currency: string } {
  let currency = 'USD';
  if (/[₹]|inr|rs\.?|rupee/i.test(text)) currency = 'INR';
  else if (/[$]|usd|dollar/i.test(text)) currency = 'USD';
  else if (/[€]|eur|euro/i.test(text)) currency = 'EUR';
  else if (/lakh|crore/i.test(text)) currency = 'INR';

  const valueRegex =
    /(?:₹|\$|€|rs\.?|inr|usd)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(lakhs?|lac|l|k|crores?|cr|m|million)?/i;
  const match = text.match(valueRegex);
  if (!match) return { value: 0, currency };

  const rawNumber = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(rawNumber)) return { value: 0, currency };

  const suffix = (match[2] ?? '').toLowerCase();
  let multiplier = 1;
  if (suffix === 'k') multiplier = 1_000;
  else if (suffix === 'l' || suffix === 'lac' || suffix.startsWith('lakh')) multiplier = 100_000;
  else if (suffix === 'cr' || suffix.startsWith('crore')) multiplier = 10_000_000;
  else if (suffix === 'm' || suffix === 'million') multiplier = 1_000_000;

  return { value: Math.round(rawNumber * multiplier), currency };
}

function extractCompany(text: string): string | null {
  const m1 = text.match(/for\s+([A-Za-z0-9&.\s'-]+?)(?:\s+(?:worth|valued|at|for|with|amounting|in|\$|₹|€|\d)|,|$)/i);
  if (m1?.[1]) {
    const candidate = m1[1].trim();
    if (candidate.length > 1 && !/^(a|an|the|new|deal|leads?)$/i.test(candidate)) return candidate;
  }
  const m2 = text.match(/deal\s+with\s+([A-Za-z0-9&.\s'-]+?)(?:\s+(?:worth|valued|at|\$|₹|€|\d)|,|$)/i);
  if (m2?.[1]) {
    const candidate = m2[1].trim();
    if (candidate.length > 1) return candidate;
  }
  const m3 = text.match(/([A-Z][A-Za-z0-9&.\s'-]+?)\s+deal/);
  if (m3?.[1]) {
    const candidate = m3[1].trim();
    if (candidate.length > 1 && !/^(new|create|big|active)$/i.test(candidate)) return candidate;
  }
  return null;
}

function detectTargetStage(text: string, stages: PipelineStageRecord[]): { stageId: string; stageName: string } {
  const lower = text.toLowerCase();
  if (lower.includes('closed won') || lower.includes('deal was won')) {
    const s = stages.find(s => s.id === 'won' || s.name.toLowerCase() === 'won');
    if (s) return { stageId: s.id, stageName: s.name };
  }
  if (lower.includes('negotiat')) {
    const s = stages.find(st => st.id === 'negotiation' || st.name.toLowerCase().includes('negotiat'));
    if (s) return { stageId: s.id, stageName: s.name };
  }
  if (lower.includes('proposal') || lower.includes('quote') || lower.includes('pitch')) {
    const s = stages.find(st => st.id === 'proposal' || st.name.toLowerCase().includes('proposal'));
    if (s) return { stageId: s.id, stageName: s.name };
  }
  if (lower.includes('qualif')) {
    const s = stages.find(st => st.id === 'qualified' || st.name.toLowerCase().includes('qualif'));
    if (s) return { stageId: s.id, stageName: s.name };
  }
  if (lower.includes('contacted') || lower.includes('spoke with') || lower.includes('called')) {
    const s = stages.find(st => st.id === 'contacted' || st.name.toLowerCase().includes('contacted'));
    if (s) return { stageId: s.id, stageName: s.name };
  }
  if (lower.includes('pipeline') || lower.includes('qualification rule')) {
    const s = stages.find(st => st.id === 'qualified' || st.name.toLowerCase() === 'qualified');
    if (s) return { stageId: s.id, stageName: s.name };
  }
  const first = stages[0] ?? { id: 'new', name: 'New' };
  return { stageId: first.id, stageName: first.name };
}

export function parseNaturalLanguageDeal(
  prompt: string,
  stages: PipelineStageRecord[],
  availableContacts: ContactRecord[]
): ParsedDealIntent {
  const trimmed = prompt.trim();
  const { value, currency } = extractValueAndCurrency(trimmed);
  const company = extractCompany(trimmed);

  let matchedContact: ContactRecord | null = null;
  if (company) {
    const compLower = company.toLowerCase();
    matchedContact =
      availableContacts.find(c => {
        const cComp = (c.company ?? '').toLowerCase();
        const cName = (c.name ?? '').toLowerCase();
        return (cComp && (cComp === compLower || cComp.includes(compLower) || compLower.includes(cComp))) ||
               (cName && (cName === compLower || cName.includes(compLower)));
      }) ?? null;
  }

  const { stageId, stageName } = detectTargetStage(trimmed, stages);

  let title = '';
  if (company) {
    title = `${company} Deal`;
  } else {
    const generalMatch = trimmed.match(/create\s+(?:a\s+)?deal(?:\s+for|\s+with)?\s+([^,.]+)/i);
    title = generalMatch?.[1]?.trim() ?? 'New Sales Opportunity';
  }

  const lower = trimmed.toLowerCase();
  const needsFollowUp = /follow[- ]?up|remind|schedule|progress/i.test(lower) || ['contacted', 'qualified', 'proposal'].includes(stageId);
  let followUpDays = 2;
  if (/next week/i.test(lower)) followUpDays = 7;
  else if (/tomorrow|in 1 day/i.test(lower)) followUpDays = 1;
  else if (/in 3 days/i.test(lower)) followUpDays = 3;
  else if (/in 5 days/i.test(lower)) followUpDays = 5;

  const followUpTitle = company
    ? `Follow up with ${company} on ${stageName} requirements`
    : `Follow up on ${title} (${stageName})`;

  const missingFields: ('title' | 'value' | 'contact')[] = [];
  if (!title || title === 'New Sales Opportunity') missingFields.push('title');
  if (value <= 0) missingFields.push('value');
  if (!matchedContact && !company) missingFields.push('contact');

  const ruleInfo = STAGE_PROGRESSION_RULES[stageId.toLowerCase()] ?? {
    label: `${stageName} Stage Rule`,
    criteria: 'Progress according to verified client engagement & mutual agreement.',
    nextStage: 'qualified',
  };

  const qualificationRules = [
    `Initial Stage: ${stageName} (${ruleInfo.label})`,
    `Exit Criteria: ${ruleInfo.criteria}`,
    needsFollowUp ? `Follow-up Task: Scheduled in ${followUpDays} days` : 'No immediate follow-up required',
    'Safety: Consequential stage changes (Won/Lost) require explicit user approval',
  ];

  const notes = `[Automated Deal Workflow] Created from prompt: "${trimmed.slice(0, 120)}${trimmed.length > 120 ? '...' : ''}". Target stage: ${stageName}.`;
  const confidence: 'high' | 'medium' | 'low' = value > 0 && company ? 'high' : value > 0 || company ? 'medium' : 'low';
  const currSymbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : '€';
  const summary = `Create deal "${title}" valued at ${currSymbol}${value.toLocaleString()} in stage "${stageName}". ${
    matchedContact ? `Associated with existing contact "${matchedContact.name || matchedContact.company}".` : company ? `New contact "${company}" suggested.` : 'No contact specified.'
  }`;

  return {
    title, company, value, currency, stageId, stageName,
    matchedContactId: matchedContact?.id ?? null,
    matchedContactName: matchedContact?.name || matchedContact?.company || null,
    suggestedContactName: company,
    notes, needsFollowUp, followUpTitle, followUpDays,
    qualificationRules, progressionRule: ruleInfo.criteria,
    missingFields, confidence, summary,
  };
}

export function checkDuplicates(
  proposedTitle: string,
  proposedCompany: string | null,
  existingDeals: DealRecord[]
): DuplicateCheckResult {
  const normTitle = proposedTitle.trim().toLowerCase();
  const normCompany = proposedCompany?.trim().toLowerCase() ?? '';

  for (const deal of existingDeals) {
    const existingTitle = deal.title.toLowerCase();
    if (existingTitle === normTitle || (normTitle.length > 5 && existingTitle.includes(normTitle))) {
      return {
        hasDuplicate: true,
        warningMessage: `A deal with a matching title already exists: "${deal.title}" (${deal.status.toUpperCase()}).`,
        matchedDeal: deal,
      };
    }
    if (normCompany && normCompany.length > 3 && existingTitle.includes(normCompany) && deal.status === 'open') {
      return {
        hasDuplicate: true,
        warningMessage: `An open deal for "${proposedCompany}" already exists: "${deal.title}" ($${deal.value?.toLocaleString() ?? 0}).`,
        matchedDeal: deal,
      };
    }
  }

  return { hasDuplicate: false, warningMessage: null, matchedDeal: null };
}
