/**
 * CRM 3.0 — Contacts API
 * GET  /api/v3/contacts  — list contacts for account
 * POST /api/v3/contacts  — create a new contact
 *
 * Auth: FastAPI JWT verified server-side via verifyRequest().
 * DB:   Service-role client — account_id always from verified token, never from body.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') ?? '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 200);

    let query = db
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;
    return NextResponse.json({ contacts: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error('[contacts GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as {
      name?: string;
      phone?: string;
      email?: string;
      company?: string;
      source?: string;
      lead_status?: string;
      tags?: string[];
      notes?: string;
    };

    if (!body.name?.trim() && !body.phone?.trim() && !body.email?.trim()) {
      return NextResponse.json({ error: 'At least one of name, phone, or email is required' }, { status: 400 });
    }

    const { data, error } = await db
      .from('contacts')
      .insert({
        account_id: user.account_id,
        name: body.name?.trim() ?? null,
        phone: body.phone?.trim() ?? null,
        email: body.email?.trim() ?? null,
        company: body.company?.trim() ?? null,
        source: body.source?.trim() ?? null,
        lead_status: body.lead_status ?? 'new',
        tags: body.tags ?? [],
        notes: body.notes?.trim() ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (err) {
    console.error('[contacts POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
