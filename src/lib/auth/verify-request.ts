/**
 * CRM 3.0 — Server-side FastAPI JWT verification for /api/v3/* routes.
 *
 * Architecture:
 *   - Login stores a FastAPI-issued HS256 JWT in localStorage (crm_token).
 *   - The browser sends it as  Authorization: Bearer <token>  on every v3 call.
 *   - This helper verifies the signature, checks expiry, rejects partial tokens,
 *     then re-derives account_id and role from the database (never trusts claims).
 *   - Returns a service-role Supabase client for DB access (same as FastAPI uses).
 *
 * Security properties:
 *   - Signature verified with server-only JWT_SECRET (never exposed to browser).
 *   - Algorithm pinned to HS256 — no "alg:none" or RS256 confusion attacks.
 *   - Partial TOTP tokens (partial:true claim) are rejected on every route.
 *   - account_id and role are always re-read from DB, never from token claims.
 *   - Service-role client is server-only; credentials never reach the browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export interface CrmUser {
  user_id: string;
  account_id: string;
  role: string;
}

export interface AuthResult {
  user: CrmUser;
  db: ReturnType<typeof getServiceClient>;
}

/** Minimal JWT decode — no external dependency needed in Next.js. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const json = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

/** HMAC-SHA256 signature verification using the Web Crypto API (Node 18+). */
async function verifyHs256(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signingInput = encoder.encode(`${parts[0]}.${parts[1]}`);
  const sigB64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
  const padded = sigB64 + '='.repeat((4 - (sigB64.length % 4)) % 4);
  const sig = Uint8Array.from(Buffer.from(padded, 'base64'));
  return crypto.subtle.verify('HMAC', key, sig, signingInput);
}

/**
 * Verify the FastAPI JWT from the Authorization header.
 * Returns AuthResult on success, or a NextResponse (401/403/500) on failure.
 */
export async function verifyRequest(
  req: NextRequest,
): Promise<AuthResult | NextResponse> {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[auth] JWT_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // 1. Verify HMAC-SHA256 signature
  let valid = false;
  try {
    valid = await verifyHs256(token, secret);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Decode and validate claims
  let payload: Record<string, unknown>;
  try {
    payload = decodeJwtPayload(token);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. Check expiry
  const exp = payload.exp as number | undefined;
  if (!exp || Math.floor(Date.now() / 1000) > exp) {
    return NextResponse.json({ error: 'Token expired' }, { status: 401 });
  }

  // 4. Reject partial TOTP tokens — must not access protected routes
  if (payload.partial === true) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = payload.sub as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 5. Re-derive account_id and role from DB (never trust token claims)
  const db = getServiceClient();
  const { data: profile, error } = await db
    .from('profiles')
    .select('account_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return {
    user: {
      user_id: userId,
      account_id: profile.account_id as string,
      role: (profile.role as string) ?? 'agent',
    },
    db,
  };
}

/** Type guard: check if verifyRequest returned an error response. */
export function isAuthError(
  result: AuthResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
