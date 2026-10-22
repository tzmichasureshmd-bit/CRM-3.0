/**
 * CRM 3.0 — Automation Templates API
 * GET /api/v3/automations/templates
 *
 * Capabilities never expose secrets — only booleans + provider name.
 * Auth: FastAPI JWT via verifyRequest(). account_id always from token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
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

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { db } = auth;

  const capabilities = detectCapabilities();
  try {
    const { data, error } = await db
      .from('crm3_automation_templates')
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false });

    if (error) {
      return NextResponse.json({ templates: [], capabilities });
    }

    return NextResponse.json({ templates: data ?? [], capabilities });
  } catch (err) {
    console.error('[automation templates GET]', err);
    return NextResponse.json({ templates: [], capabilities });
  }
}
