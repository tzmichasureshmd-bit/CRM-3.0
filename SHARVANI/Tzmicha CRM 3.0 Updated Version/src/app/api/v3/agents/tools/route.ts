/**
 * CRM 3.0 — Agent Tools Registry API
 * GET /api/v3/agents/tools
 * Returns the full tool registry (no secrets, no execution).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TOOL_REGISTRY } from '@/lib/ai/agent-tools';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return NextResponse.json({ tools: Object.values(TOOL_REGISTRY) });
  } catch (err) {
    console.error('[agents tools]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
