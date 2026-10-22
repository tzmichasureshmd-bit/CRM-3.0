/**
 * CRM 3.0 — Agent Tools Registry API
 * GET /api/v3/agents/tools
 * Returns the full tool registry (no secrets, no execution).
 * Auth: FastAPI JWT via verifyRequest().
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { TOOL_REGISTRY } from '@/lib/ai/agent-tools';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;

  try {
    return NextResponse.json({ tools: Object.values(TOOL_REGISTRY) });
  } catch (err) {
    console.error('[agents tools]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
