/**
 * CRM 3.0 — Segments API
 * GET  /api/v3/segments  — list segments for account
 * POST /api/v3/segments  — create a new segment
 *
 * Auth: FastAPI JWT via verifyRequest(). account_id always from token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { data, error } = await db
      .from('crm3_segments')
      .select('id, name, description, type, contact_count, last_computed_at, created_at')
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return NextResponse.json({ segments: data ?? [] });
  } catch (err) {
    console.error('[segments GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as { name?: string; description?: string; type?: string; rules?: unknown };
    if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const validTypes = ['manual', 'rule_based', 'ai_assisted'];
    const type = validTypes.includes(body.type ?? '') ? body.type : 'manual';

    const { data, error } = await db
      .from('crm3_segments')
      .insert({
        account_id: user.account_id,
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        type,
        rules: body.rules ?? null,
        contact_count: 0,
      })
      .select('id, name, description, type, contact_count, last_computed_at, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ segment: data }, { status: 201 });
  } catch (err) {
    console.error('[segments POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
