/**
 * CRM 3.0 — Automation Templates API
 * GET /api/v3/automations/templates
 *   - templates:    built-in template rows (legacy table)
 *   - capabilities: server-detected integration status for the AI templates.
 *
 * Capabilities never expose secrets — only booleans + provider name, so the
 * Automations UI can report template compatibility honestly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectProvider, isUsableKey } from '@/lib/ai/ai-provider';

function detectCapabilities() {
  const provider = detectProvider();
  const whatsappConfigured =
    isUsableKey(process.env.WHATSAPP_ACCESS_TOKEN) &&
    !!process.env.WHATSAPP_PHONE_NUMBER_ID;
  return {
    aiProviderConfigured: provider.configured,
    aiProvider: provider.provider,
    whatsappConfigured,
    approvalsSupported: true,
    contentSupported: true,
  };
}

export async function GET(_req: NextRequest) {
  const capabilities = detectCapabilities();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('crm3_automation_templates')
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false });

    if (error) {
      // Table may not exist yet — return empty array gracefully
      return NextResponse.json({ templates: [], capabilities });
    }

    return NextResponse.json({ templates: data ?? [], capabilities });
  } catch (err) {
    console.error('[automation templates GET]', err);
    return NextResponse.json({ templates: [], capabilities });
  }
}
