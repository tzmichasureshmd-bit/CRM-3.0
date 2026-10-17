/**
 * CRM 3.0 — AI Lead Automation API Route
 * POST /api/v3/ai/lead-automation
 *
 * Safe server-side processing for natural language lead creation.
 * Reuses OPENAI_API_KEY if configured, or falls back to deterministic rule-based NLP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseNaturalLanguageLead,
  type ParsedLeadIntent,
} from '@/lib/lead-automation-engine';
import type { ContactRecord } from '@/lib/crm-pipeline-store';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let accountId: string | null = null;
    if (user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();
      accountId = profile?.account_id ?? null;
    }

    const body = await req.json().catch(() => ({}));
    const { prompt, existingContacts = [] } = body as {
      prompt?: string;
      existingContacts?: ContactRecord[];
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'Instruction prompt is required.' }, { status: 400 });
    }

    const trimmedPrompt = prompt.trim();
    const openaiKey = process.env.OPENAI_API_KEY;

    // 1. If OpenAI API key is configured, use structured LLM parsing
    if (openaiKey) {
      try {
        const systemPrompt = `You are a CRM lead assistant.
Extract structured CRM lead parameters from the user's natural language instruction.
Allowed stages: new, contacted, qualified, proposal, negotiation, won, lost.
Allowed tiers: hot, warm, cold.

Respond ONLY with a JSON object in this format:
{
  "name": "full name or null",
  "phone": "phone number with country code or null",
  "email": "email address or null",
  "company": "company name or null",
  "stage_id": "new/contacted/qualified/proposal/negotiation/won/lost",
  "tier": "hot/warm/cold",
  "tags": ["tag1", "tag2"],
  "rationale": "short explanation of why this priority/tier was chosen",
  "suggested_action": "recommended next step"
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

          const tier = content.tier === 'hot' || content.tier === 'cold' ? content.tier : 'warm';
          const score = tier === 'hot' ? 85 : tier === 'warm' ? 60 : 25;
          const stageId = content.stage_id || 'new';

          const parsed: ParsedLeadIntent = {
            name: content.name || 'New Lead',
            phone: content.phone || null,
            email: content.email || null,
            company: content.company || null,
            stageId,
            stageName: stageId.toUpperCase(),
            tier,
            score,
            tags: Array.isArray(content.tags) ? content.tags : [],
            rationale: content.rationale || 'Lead parsed via AI automation',
            suggestedAction: content.suggested_action || 'Follow up with lead',
            missingFields: [
              ...(!content.name ? (['name'] as const) : []),
              ...(!content.phone ? (['phone'] as const) : []),
              ...(!content.email ? (['email'] as const) : []),
            ],
            confidence: 'high',
            summary: `Add lead "${content.name || 'New Lead'}"${content.company ? ` (${content.company})` : ''} as ${tier.toUpperCase()} priority.`,
          };

          return NextResponse.json({ success: true, parsed, provider: 'openai', accountId });
        }
      } catch (aiErr) {
        console.warn('[lead-automation] OpenAI parsing fallback triggered:', aiErr);
      }
    }

    // 2. Deterministic rule-based engine fallback
    const parsed = parseNaturalLanguageLead(trimmedPrompt, existingContacts);
    return NextResponse.json({
      success: true,
      parsed,
      provider: 'rules-engine',
      accountId,
    });
  } catch (err) {
    console.error('[lead-automation] Execution exception:', err);
    return NextResponse.json({ error: 'Failed to process lead automation request.' }, { status: 500 });
  }
}
