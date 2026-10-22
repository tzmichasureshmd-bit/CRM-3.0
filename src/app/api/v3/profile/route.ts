/**
 * CRM 3.0 — Profile API
 * GET   /api/v3/profile — fetch current user's profile
 * PATCH /api/v3/profile — update full_name, timezone, language
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 * account_id and user_id always from verified token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  const { data, error } = await db
    .from('profiles')
    .select('user_id, account_id, full_name, email, role, avatar_url, timezone, language, totp_enabled, created_at')
    .eq('user_id', user.user_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  return NextResponse.json({ profile: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as {
      full_name?: string;
      timezone?: string;
      language?: string;
    };

    const allowed_timezones = [
      'UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
      'Europe/London','Europe/Paris','Europe/Berlin','Asia/Kolkata','Asia/Dubai',
      'Asia/Singapore','Asia/Tokyo','Australia/Sydney',
    ];
    const allowed_languages = ['en','es','fr','de','ar','hi','pt'];

    const update: Record<string, string> = {};
    if (body.full_name !== undefined) {
      const name = body.full_name.trim();
      if (!name) return NextResponse.json({ error: 'full_name cannot be empty' }, { status: 400 });
      update.full_name = name;
    }
    if (body.timezone !== undefined) {
      if (!allowed_timezones.includes(body.timezone)) {
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
      }
      update.timezone = body.timezone;
    }
    if (body.language !== undefined) {
      if (!allowed_languages.includes(body.language)) {
        return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
      }
      update.language = body.language;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await db
      .from('profiles')
      .update(update)
      .eq('user_id', user.user_id)
      .select('user_id, full_name, email, role, avatar_url, timezone, language')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch (err) {
    console.error('[profile PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
