import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadAiConfig } from '@/lib/ai/config'
import { buildConversationContext } from '@/lib/ai/context'
import { generateReply } from '@/lib/ai/generate'
import { logAiUsage } from '@/lib/ai/usage'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { AiError, type ChatMessage } from '@/lib/ai/types'

// ============================================================
// POST /api/ai/assistant  (agent+)
//
// Multi-action AI assistant that reuses the account's BYO provider
// for structured conversation analysis and message generation.
//
// Body: {
//   action: string,            // required — one of the actions below
//   conversation_id?: string,  // required for most actions
//   text?: string,             // for rewrite/translate/tone actions
//   target_language?: string,  // for translate
//   contact_id?: string,       // for extract_lead_info
// }
//
// Actions:
//   suggest_reply    — AI-drafted reply for the conversation
//   rewrite          — rewrite the given text for clarity
//   professional     — make text more professional
//   friendly         — make text warmer / friendlier
//   translate        — translate text to target_language
//   summarize        — summarize the conversation so far
//   detect_intent    — classify the customer's intent
//   detect_interest  — gauge customer interest level (1-5)
//   extract_lead_info— extract structured lead info from conversation
//   next_action      — suggest the best next step
//   generate_followup— generate a follow-up message
//   create_note      — generate a structured note from conversation
//
// Returns: { result } — action-specific payload.
// ============================================================

const ACTION_PROMPTS: Record<string, (body: Record<string, unknown>) => string> = {
  suggest_reply: () =>
    'You are drafting the next reply for a business in a WhatsApp conversation. Write a concise, friendly reply appropriate for the customer\'s last message. Output only the reply text.',

  rewrite: () =>
    'Rewrite the following message for clarity and conciseness while preserving its meaning. Output only the rewritten message, no explanation.',

  professional: () =>
    'Rewrite the following message to be more professional and polished while keeping it concise and suitable for WhatsApp. Output only the rewritten message.',

  friendly: () =>
    'Rewrite the following message to be warmer, friendlier, and more approachable while preserving its meaning. Keep it short for WhatsApp. Output only the rewritten message.',

  translate: (body) => {
    const lang = typeof body.target_language === 'string' ? body.target_language : 'English'
    return `Translate the following message to ${lang}. Output only the translated text, no quotation marks or explanation.`
  },

  summarize: () =>
    'Summarize this WhatsApp conversation between a business and a customer in 2-3 sentences. Focus on: what the customer wants, what was discussed, and any unresolved issues. Output only the summary.',

  detect_intent: () =>
    'Classify the customer\'s primary intent in this conversation. Respond with a JSON object: { "intent": "<one of: inquiry, purchase, support, complaint, info_request, partnership, other>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>" }. Output only the JSON.',

  detect_interest: () =>
    'Rate the customer\'s interest level in this conversation on a scale of 1-5 (1=no interest, 5=ready to buy). Respond with a JSON object: { "score": <1-5>, "reasoning": "<one sentence>" }. Output only the JSON.',

  extract_lead_info: () =>
    'Extract structured lead information from this conversation. Respond with a JSON object: { "name": "<if mentioned>", "company": "<if mentioned>", "needs": ["<list of needs>"], "budget_signal": "<if mentioned, else null>", "timeline": "<if mentioned, else null>", "decision_maker": "<true/false/unknown>" }. Output only the JSON.',

  next_action: () =>
    'Based on this conversation, suggest the single best next action for the business. Respond with a JSON object: { "action": "<action description>", "urgency": "<low/medium/high>", "reasoning": "<one sentence>" }. Output only the JSON.',

  generate_followup: () =>
    'Generate a follow-up message to send to this customer. The message should be natural, professional, and move the conversation forward. Output only the follow-up message text.',

  create_note: () =>
    'Create a structured CRM note summarizing this conversation. Format:\n**Summary:** [1-2 sentences]\n**Key Points:** [bullet list]\n**Action Items:** [bullet list]\n**Sentiment:** [positive/neutral/negative]',
}

type ActionName = keyof typeof ACTION_PROMPTS

function isActionName(a: string): a is ActionName {
  return a in ACTION_PROMPTS
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const userLimit = checkRateLimit(`ai-assistant:${userId}`, RATE_LIMITS.aiDraft)
    if (!userLimit.success) return rateLimitResponse(userLimit)
    const accountLimit = checkRateLimit(`ai-assistant-acct:${accountId}`, RATE_LIMITS.aiDraftAccount)
    if (!accountLimit.success) return rateLimitResponse(accountLimit)

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.action !== 'string') {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    const action = body.action
    if (!isActionName(action)) {
      return NextResponse.json(
        { error: `Unknown action: ${action}. Valid: ${Object.keys(ACTION_PROMPTS).join(', ')}` },
        { status: 400 },
      )
    }

    // Load AI config
    const config = await loadAiConfig(supabase, accountId).catch((err) => {
      console.error('[ai/assistant] loadAiConfig error:', err)
      throw new AiError('Stored API key could not be decrypted.', {
        code: 'key_decrypt_failed',
        status: 400,
      })
    })
    if (!config) {
      return NextResponse.json(
        {
          error: 'AI assistant is not set up. Enable it in Settings → AI Assistant.',
          code: 'ai_not_configured',
        },
        { status: 400 },
      )
    }

    // Build messages based on action
    const messages: ChatMessage[] = []
    const conversationId =
      typeof body.conversation_id === 'string' ? body.conversation_id : null

    const needsConversation = !['rewrite', 'professional', 'friendly', 'translate'].includes(action)

    if (needsConversation) {
      if (!conversationId) {
        return NextResponse.json(
          { error: 'conversation_id is required for this action' },
          { status: 400 },
        )
      }
      const convCtx = await buildConversationContext(supabase, conversationId)
      if (convCtx.length === 0) {
        return NextResponse.json(
          { error: 'No messages to work with yet.', code: 'no_messages' },
          { status: 400 },
        )
      }
      messages.push(...convCtx)
    }

    // For rewrite/professional/friendly/translate, inject the text as a user message
    if (['rewrite', 'professional', 'friendly', 'translate'].includes(action)) {
      const text = typeof body.text === 'string' ? body.text : ''
      if (!text.trim()) {
        return NextResponse.json({ error: 'text is required for this action' }, { status: 400 })
      }
      messages.push({ role: 'user', content: text })
    }

    const systemPrompt = ACTION_PROMPTS[action](body)

    const { text, usage } = await generateReply({ config, systemPrompt, messages })

    // Fire-and-forget usage logging
    try {
      void logAiUsage(supabaseAdmin(), {
        accountId,
        conversationId,
        mode: 'draft',
        provider: config.provider,
        model: config.model,
        usage,
      })
    } catch (logErr) {
      console.error('[ai/assistant] usage log skipped:', logErr)
    }

    return NextResponse.json({ result: text })
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      )
    }
    return toErrorResponse(err)
  }
}
