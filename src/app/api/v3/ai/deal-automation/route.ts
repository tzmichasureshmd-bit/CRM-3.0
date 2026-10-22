/**
 * CRM 3.0 — AI Deal Automation API Route
 * POST /api/v3/ai/deal-automation
 *
 * Safe server-side processing for natural language deal creation.
 * Reuses OPENAI_API_KEY if configured, or falls back to deterministic rule-based NLP.
 * Never leaks keys or fabricates records.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  parseNaturalLanguageDeal,
  type ParsedDealIntent,
} from '@/lib/deal-automation-engine';
import type { ContactRecord, PipelineStageRecord } from '@/lib/crm-pipeline-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { prompt, stages = [], contacts = [] } = body as {
      prompt?: string;
      stages?: PipelineStageRecord[];
      contacts?: ContactRecord[];
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'Instruction prompt is required.' }, { status: 400 });
    }

    const trimmedPrompt = prompt.trim();
    const openaiKey = process.env.OPENAI_API_KEY;

    // 1. If OpenAI API key is configured, use structured LLM parsing
    if (openaiKey) {
      try {
        const stageNames = stages.map(s => s.name).join(', ') || 'New, Contacted, Qualified, Proposal, Negotiation, Won, Lost';
        const contactNames = contacts.map(c => c.name || c.company).filter(Boolean).slice(0, 30).join(', ');

        const systemPrompt = `You are a CRM sales pipeline assistant.
Extract structured deal parameters from the user's natural language instruction.
Available stages: ${stageNames}.
Known contacts: ${contactNames}.

Respond ONLY with a JSON object in this format:
{
  "title": "deal title",
  "company": "company or client name or null",
  "value": 50000,
  "currency": "INR or USD or EUR",
  "stage_name": "target stage name",
  "contact_name": "matched or mentioned contact or null",
  "follow_up_title": "suggested follow-up action",
  "follow_up_days": 2,
  "needs_follow_up": true,
  "progression_rule": "qualification or progression rule criteria"
}`;

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: trimmedPrompt },
            ],
            temperature: 0.2,
            max_tokens: 600,
            response_format: { type: 'json_object' },
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = JSON.parse(aiData.choices?.[0]?.message?.content ?? '{}');

          const matchedStage =
            stages.find(
              s =>
                s.name.toLowerCase() === (content.stage_name ?? '').toLowerCase() ||
                s.id.toLowerCase() === (content.stage_name ?? '').toLowerCase()
            ) ?? stages[0] ?? { id: 'new', name: 'New' };

          const matchedContact =
            contacts.find(c => {
              const cName = (c.name ?? '').toLowerCase();
              const cComp = (c.company ?? '').toLowerCase();
              const target = (content.contact_name ?? '').toLowerCase();
              return target && (cName === target || cComp === target || cName.includes(target));
            }) ?? null;

          const parsed: ParsedDealIntent = {
            title: content.title || `${content.company || 'New'} Deal`,
            company: content.company ?? null,
            value: typeof content.value === 'number' ? content.value : 0,
            currency: content.currency || 'USD',
            stageId: matchedStage.id,
            stageName: matchedStage.name,
            matchedContactId: matchedContact?.id ?? null,
            matchedContactName: matchedContact?.name || matchedContact?.company || null,
            suggestedContactName: content.contact_name || content.company || null,
            notes: `[AI Automated Deal] Created from prompt: "${trimmedPrompt.slice(0, 100)}"`,
            needsFollowUp: Boolean(content.needs_follow_up ?? true),
            followUpTitle: content.follow_up_title || `Follow up with ${content.company || 'client'} on deal progression`,
            followUpDays: typeof content.follow_up_days === 'number' ? content.follow_up_days : 2,
            qualificationRules: [
              `Target Stage: ${matchedStage.name}`,
              content.progression_rule || 'Verify client requirements and schedule next review',
              'Safety: Explicit confirmation required before marking Won/Lost',
            ],
            progressionRule: content.progression_rule || 'Progress upon verified milestone completion',
            missingFields: [
              ...(typeof content.value !== 'number' || content.value <= 0 ? (['value'] as const) : []),
              ...(!content.title ? (['title'] as const) : []),
            ],
            confidence: 'high',
            summary: `Create deal "${content.title}" (${content.currency} ${content.value}) in stage "${matchedStage.name}".`,
          };

          return NextResponse.json({ success: true, parsed, provider: 'openai' });
        }
      } catch (aiErr) {
        console.warn('[deal-automation] OpenAI parsing fallback triggered:', aiErr);
      }
    }

    // 2. Deterministic rule-based engine fallback
    const parsed = parseNaturalLanguageDeal(trimmedPrompt, stages, contacts);
    return NextResponse.json({
      success: true,
      parsed,
      provider: 'rules-engine',
    });
  } catch (err) {
    console.error('[deal-automation] Execution exception:', err);
    return NextResponse.json({ error: 'Failed to process deal automation request.' }, { status: 500 });
  }
}
