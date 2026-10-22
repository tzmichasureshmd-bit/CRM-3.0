/**
 * CRM 3.0 — Knowledge Base API
 * GET  /api/v3/knowledge — list knowledge documents for account
 * POST /api/v3/knowledge — create a knowledge document
 *
 * Auth: FastAPI JWT verified via verifyRequest().
 * account_id always from verified token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const VALID_STATUSES = ['draft', 'published', 'archived'];
const VALID_CATEGORIES = ['faq', 'guide', 'policy', 'product', 'support', 'general'];

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const category = searchParams.get('category') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
  }

  try {
    let q = db
      .from('knowledge_documents')
      .select('id, title, content, category, status, tags, created_by, created_at, updated_at', { count: 'exact' })
      .eq('account_id', user.account_id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) q = q.eq('status', status);
    if (category) q = q.eq('category', category);
    if (search) q = q.or(`title.ilike.%${search}%,content.ilike.%${search}%`);

    const { data, error, count } = await q;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error('[knowledge GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as {
      title?: string;
      content?: string;
      category?: string;
      status?: string;
      tags?: string[];
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!body.content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }
    const category = body.category ?? 'general';
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
    }
    const status = body.status ?? 'draft';
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    const { data, error } = await db
      .from('knowledge_documents')
      .insert({
        account_id: user.account_id,
        created_by: user.user_id,
        title: body.title.trim(),
        content: body.content.trim(),
        category,
        status,
        tags: Array.isArray(body.tags) ? body.tags : [],
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ document: data }, { status: 201 });
  } catch (err) {
    console.error('[knowledge POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
