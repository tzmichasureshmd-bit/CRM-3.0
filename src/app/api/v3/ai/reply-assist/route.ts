/**
 * CRM 3.0 — AI Reply Assistant
 * POST /api/v3/ai/reply-assist
 *
 * Actions: professional | friendly | short | detailed | translate |
 *          qualify | followup | summarize
 *
 * Uses real conversation messages. Never auto-sends.
 * Employee must explicitly use the generated reply.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TONE_MAP: Record<string, string> = {
  professional: 'Write a professional, formal business reply. Use proper grammar and a respectful tone.',
  friendly:     'Write a warm, friendly and conversational reply. Use a casual but professional tone.',
  short:        'Write a very concise reply in 1-2 sentences maximum. Get straight to the point.',
  detailed:     'Write a comprehensive, detailed reply that thoroughly addresses the customer\'s message. Include relevant information and next steps.',
  translate:    'Translate the customer\'s message to English and write a reply in English.',
  qualify:      'Write a reply that qualifies this lead by asking about their specific needs, budget range, timeline, and decision-making process.',
  followup:     'Write a follow-up message to re-engage this customer. Reference the previous conversation and offer value.',
  summarize:    'Summarize this conversation in 3-4 bullet points covering: what the customer wants, key questions asked, current status, and recommended next step.',
};

const FALLBACKS: Record<string, string> = {
  professional: 'Thank you for reaching out. We would be happy to assist you with your inquiry. Please let us know how we can best serve you.',
  friendly:     "Hey! Thanks for messaging us 😊 We'd love to help — what can we do for you today?",
  short:        "Thanks for your message! We'll get back to you shortly.",
  detailed:     'Thank you for your detailed message. We have received your inquiry and our team is reviewing it carefully. We will provide you with a comprehensive response within 24 hours. In the meantime, please feel free to share any additional information that might help us assist you better.',
  translate:    'Thank you for your message. We have received your inquiry and will respond shortly.',
  qualify:      'Thank you for your interest! To help us serve you better, could you share: (1) What specific challenge are you looking to solve? (2) What is your approximate budget? (3) What is your timeline for implementation?',
  followup:     "Hi! I'm following up on our previous conversation. I wanted to check if you had any questions or if there's anything else I can help you with. We'd love to move forward when you're ready!",
  summarize:    '• Customer reached out with an inquiry\n• Specific needs: To be determined\n• Current status: Awaiting response\n• Next step: Follow up within 24 hours',
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversationId, action } = await req.json();
    if (!conversationId || !action) {
      return NextResponse.json({ error: 'conversationId and action required' }, { status: 400 });
    }

    const instruction = TONE_MAP[action];
    if (!instruction) {
      return NextResponse.json({ error: `Unknown action: ${action}. Valid: ${Object.keys(TONE_MAP).join(', ')}` }, { status: 400 });
    }

    // ── Fetch recent messages ─────────────────────────────────
    const { data: messages } = await supabase
      .from('messages')
      .select('content_text, sender_type, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(15);

    const msgs = (messages ?? []).reverse();
    const lastCustomerMsg = msgs.filter(m => m.sender_type === 'customer').slice(-1)[0]?.content_text ?? '';
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      return NextResponse.json({ reply: FALLBACKS[action] ?? 'Thank you for your message.' });
    }

    // Build transcript for context
    const transcript = msgs
      .slice(-10)
      .map(m => `${m.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${m.content_text ?? ''}`)
      .join('\n');

    const systemPrompt = action === 'summarize'
      ? `You are a CRM analyst. ${instruction} Only use information from the conversation. Do not invent details. Format as bullet points.`
      : `You are a CRM sales assistant helping an agent reply to a customer. ${instruction} Reply with ONLY the message text — no labels, no quotes, no explanations. Keep it natural and appropriate for the channel.`;

    const userPrompt = action === 'summarize'
      ? `Conversation:\n${transcript}`
      : `Conversation context:\n${transcript}\n\nCustomer's last message: "${lastCustomerMsg}"\n\nWrite the reply:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: action === 'summarize' ? 0.2 : 0.7,
        max_tokens: action === 'detailed' ? 400 : action === 'summarize' ? 300 : 200,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ reply: FALLBACKS[action] ?? 'Thank you for your message.' });
    }

    const data = await response.json();
    const reply = data.choices[0].message.content.trim();
    return NextResponse.json({ reply, action, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[reply-assist]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
