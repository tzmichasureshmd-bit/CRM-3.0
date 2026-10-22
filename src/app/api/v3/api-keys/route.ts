/**
 * CRM 3.0 — API Keys
 * GET  /api/v3/api-keys — list keys for account
 * POST /api/v3/api-keys — create a new key
 *
 * The raw key is returned once on creation and never stored in plaintext.
 * key_hash stores a SHA-256 hex digest; key_prefix stores the first 12 chars.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';
import { createHash, randomBytes } from 'crypto';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  const { data, error } = await db
    .from('crm3_api_keys')
    .select('id, name, key_prefix, scopes, last_used_at, created_at')
    .eq('account_id', user.account_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as { name?: string; scopes?: string[] };
    if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const allowed_scopes = ['read', 'write', 'admin'];
    const scopes = (body.scopes ?? ['read']).filter(s => allowed_scopes.includes(s));
    if (scopes.length === 0) return NextResponse.json({ error: 'At least one valid scope required' }, { status: 400 });

    const rawKey = `crm3_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12) + '...';

    const { error } = await db.from('crm3_api_keys').insert({
      account_id: user.account_id,
      user_id: user.user_id,
      name: body.name.trim(),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ key: rawKey }, { status: 201 });
  } catch (err) {
    console.error('[api-keys POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
