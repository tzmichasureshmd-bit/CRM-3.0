/**
 * CRM 3.0 — AI Conversation Intelligence
 * POST /api/v3/ai/summarize-conversation
 *
 * Returns: summary, intent, sentiment, lead_score, next_action
 * Uses real messages only. Never fabricates data.
 * Falls back gracefully when AI key is missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── Intent categories ─────────────────────────────────────────
const INTENT_KEYWORDS: Record<string, string[]> = {
  'High Buying Intent':    ['price', 'pricing', 'cost', 'buy', 'purchase', 'order', 'payment', 'how much', 'rate', 'plan', 'subscribe'],
  'Pricing Inquiry':       ['price', 'pricing', 'cost', 'how much', 'rate', 'fee', 'charge'],
  'Product Inquiry':       ['feature', 'how does', 'what is', 'tell me about', 'explain', 'demo', 'trial', 'work'],
  'Appointment Request':   ['appointment', 'schedule', 'meeting', 'call', 'book', 'available', 'time slot', 'when can'],
  'Support Request':       ['help', 'issue', 'problem', 'not working', 'error', 'broken', 'fix', 'support'],
  'Complaint':             ['complaint', 'unhappy', 'disappointed', 'bad', 'worst', 'terrible', 'refund', 'cancel'],
  'Follow-up':             ['follow up', 'following up', 'checking in', 'any update', 'status'],
  'Not Interested':        ['not interested', 'no thanks', 'remove', 'unsubscribe', 'stop', 'dont contact'],
  'Information Request':   ['information', 'details', 'more about', 'tell me', 'what are'],
};

function detectIntent(messages: string): string {
  const lower = messages.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return intent;
  }
  return 'Unknown';
}

// ── Sentiment detection ───────────────────────────────────────
function detectSentiment(messages: string): { sentiment: string; explanation: string } {
  const lower = messages.toLowerCase();
  const positive = ['great', 'good', 'excellent', 'love', 'perfect', 'amazing', 'thank', 'yes', 'interested', 'want', 'please', 'happy', 'wonderful'];
  const negative = ['bad', 'terrible', 'awful', 'hate', 'no', 'not', 'never', 'cancel', 'refund', 'complaint', 'unhappy', 'disappointed', 'worst'];

  const posCount = positive.filter(w => lower.includes(w)).length;
  const negCount = negative.filter(w => lower.includes(w)).length;

  if (posCount > 0 && negCount > 0) return { sentiment: 'Mixed', explanation: 'Customer expressed both positive and negative signals' };
  if (posCount >= 2) return { sentiment: 'Positive', explanation: 'Customer used positive language and showed interest' };
  if (negCount >= 2) return { sentiment: 'Negative', explanation: 'Customer expressed dissatisfaction or objections' };
  if (posCount === 1) return { sentiment: 'Positive', explanation: 'Customer showed mild positive engagement' };
  if (negCount === 1) return { sentiment: 'Negative', explanation: 'Customer showed mild negative signals' };
  return { sentiment: 'Neutral', explanation: 'No strong positive or negative signals detected' };
}

// ── NBA based on intent + score ───────────────────────────────
function getNextAction(intent: string, score: number, sentiment: string): string {
  if (sentiment === 'Negative') return 'Address customer concerns immediately and offer resolution';
  if (intent === 'High Buying Intent' || score >= 80) return 'Send pricing details and schedule a demo call';
  if (intent === 'Pricing Inquiry') return 'Send detailed pricing breakdown and offer a consultation';
  if (intent === 'Appointment Request') return 'Confirm appointment time and send calendar invite';
  if (intent === 'Support Request') return 'Escalate to support team and provide ticket number';
  if (intent === 'Complaint') return 'Escalate to manager and offer immediate resolution';
  if (intent === 'Product Inquiry') return 'Send product brochure and offer a free demo';
  if (intent === 'Follow-up') return 'Provide status update and set next follow-up date';
  if (intent === 'Not Interested') return 'Acknowledge and add to re-engagement campaign for 90 days';
  if (score >= 60) return 'Send personalized follow-up message today';
  if (score >= 30) return 'Nurture with relevant content this week';
  return 'Monitor and wait for next customer interaction';
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversationId } = await req.json();
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    // ── Verify ownership ──────────────────────────────────────
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, contact_id, platform, status, contacts(name, lead_score, lead_status, source)')
      .eq('id', conversationId)
      .single();

    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // ── Fetch messages ────────────────────────────────────────
    const { data: messages } = await supabase
      .from('messages')
      .select('content_text, sender_type, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(30);

    const msgs = messages ?? [];

    if (msgs.length === 0) {
      return NextResponse.json({
        summary: 'Not enough conversation data for a reliable summary.',
        intent: 'Unknown',
        sentiment: 'Unknown',
        sentiment_explanation: 'No messages found',
        lead_score: (conv.contacts as { lead_score?: number } | null)?.lead_score ?? 0,
        next_action: 'Wait for customer to initiate conversation',
        message_count: 0,
        analyzed_at: new Date().toISOString(),
      });
    }

    const customerMsgs = msgs.filter(m => m.sender_type === 'customer');
    const customerText = customerMsgs.map(m => m.content_text ?? '').join(' ');

    // ── Rule-based analysis (always runs) ────────────────────
    const intent = detectIntent(customerText);
    const { sentiment, explanation: sentimentExplanation } = detectSentiment(customerText);

    // ── Lead score from contact or recalculate ────────────────
    const contact = conv.contacts as { lead_score?: number; lead_status?: string; source?: string } | null;
    let score = contact?.lead_score ?? 0;
    if (score === 0) {
      // Quick recalc from messages
      if (customerMsgs.length >= 5) score += 15;
      else if (customerMsgs.length >= 2) score += 8;
      if (intent === 'High Buying Intent') score += 25;
      else if (intent === 'Pricing Inquiry') score += 20;
      else if (intent === 'Product Inquiry') score += 15;
      score = Math.min(100, score);
    }

    const nextAction = getNextAction(intent, score, sentiment);

    // ── AI summary (OpenAI if available, rule-based fallback) ─
    let summary = '';
    const openaiKey = process.env.OPENAI_API_KEY;

    if (openaiKey && msgs.length >= 2) {
      try {
        const transcript = msgs
          .slice(-15)
          .map(m => `${m.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${m.content_text ?? ''}`)
          .join('\n');

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a CRM analyst. Summarize this customer conversation in 2-3 sentences. Include: what the customer wants, their current status, and any key questions or objections. Be factual — only use information from the conversation. Do not invent details.',
              },
              { role: 'user', content: `Conversation:\n${transcript}` },
            ],
            temperature: 0.2,
            max_tokens: 150,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          summary = data.choices[0].message.content.trim();
        }
      } catch {
        // AI failed — use rule-based fallback below
      }
    }

    // Rule-based summary fallback
    if (!summary) {
      const contactName = (conv.contacts as { name?: string } | null)?.name ?? 'The customer';
      const msgCount = customerMsgs.length;
      summary = `${contactName} has sent ${msgCount} message${msgCount !== 1 ? 's' : ''} via ${conv.platform ?? 'this channel'}. `;
      summary += `Detected intent: ${intent}. `;
      summary += `Sentiment: ${sentiment}. `;
      if (score >= 70) summary += 'High buying intent — recommend immediate follow-up.';
      else if (score >= 40) summary += 'Moderate interest — continue nurturing.';
      else summary += 'Early stage — monitor for engagement signals.';
    }

    // ── Persist AI analysis back to conversation ──────────────
    await supabase
      .from('conversations')
      .update({
        ai_intent: intent,
        ai_sentiment: sentiment,
        ai_summary: summary,
        ai_lead_score: score,
        ai_next_action: nextAction,
        ai_analyzed_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    return NextResponse.json({
      summary,
      intent,
      sentiment,
      sentiment_explanation: sentimentExplanation,
      lead_score: score,
      next_action: nextAction,
      message_count: msgs.length,
      customer_message_count: customerMsgs.length,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[summarize-conversation]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
