/**
 * CRM 3.0 — AI Content Generator API
 * POST /api/v3/ai/generate-content
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prompt, options = {} } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt required' }, { status: 400 });

    const { platform = 'instagram', tone: _tone = 'professional', brandVoice, targetAudience } = options;

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      // Fallback: template-based generation without AI
      return NextResponse.json(templateFallback(prompt, platform));
    }

    const systemPrompt = `You are a professional social media content creator for a business CRM.
Create engaging content for ${platform}.
Tone: ${_tone}.
${brandVoice ? `Brand voice: ${brandVoice}.` : ''}
${targetAudience ? `Target audience: ${targetAudience}.` : ''}

Respond ONLY with valid JSON in this exact format:
{
  "headline": "short punchy headline",
  "caption": "full caption text with line breaks",
  "cta": "call to action text",
  "hashtags": ["tag1", "tag2", "tag3"],
  "variants": {
    "short": "shorter version",
    "whatsapp": "whatsapp-friendly version without hashtags"
  }
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[generate-content] OpenAI error:', err);
      return NextResponse.json(templateFallback(prompt, platform));
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);

    return NextResponse.json(content);
  } catch (err) {
    console.error('[generate-content]', err);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}

// ── Template fallback (no AI key needed) ─────────────────────
function templateFallback(prompt: string, platform: string) {
  const topic = prompt.slice(0, 50);
  return {
    headline: `Exciting Update: ${topic}`,
    caption: `We're thrilled to share something special with you!\n\n${prompt}\n\nReach out to learn more — we'd love to connect with you.`,
    cta: 'Message us now',
    hashtags: ['business', 'growth', 'offer', platform, 'crm'],
    variants: {
      short: `${topic} — Message us now!`,
      whatsapp: `Hi! We have something exciting to share: ${prompt}\n\nReply to this message to learn more.`,
    },
  };
}
