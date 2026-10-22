/**
 * CRM 3.0 — Knowledge Base Document API
 * GET    /api/v3/knowledge/[id] — get document
 * PATCH  /api/v3/knowledge/[id] — update document
 * DELETE /api/v3/knowledge/[id] — delete document
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const VALID_STATUSES = ['draft', 'published', 'archived'];
const VALID_CATEGORIES = ['faq', 'guide', 'policy', 'product', 'support', 'general'];

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('knowledge_documents')
    .select('*')
    .eq('id', id)
    .eq('account_id', user.account_id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  return NextResponse.json({ document: data });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  try {
    const body = await req.json() as {
      title?: string;
      content?: string;
      category?: string;
      status?: string;
      tags?: string[];
    };

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) {
      if (!body.title.trim()) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
      update.title = body.title.trim();
    }
    if (body.content !== undefined) {
      if (!body.content.trim()) return NextResponse.json({ error: 'content cannot be empty' }, { status: 400 });
      update.content = body.content.trim();
    }
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category)) {
        return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
      }
      update.category = body.category;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
      }
      update.status = body.status;
    }
    if (body.tags !== undefined) update.tags = Array.isArray(body.tags) ? body.tags : [];

    const { data, error } = await db
      .from('knowledge_documents')
      .update(update)
      .eq('id', id)
      .eq('account_id', user.account_id)
      .select()
      .single();

    if (error || !data) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    return NextResponse.json({ document: data });
  } catch (err) {
    console.error('[knowledge PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;
  const { id } = await ctx.params;

  const { error } = await db
    .from('knowledge_documents')
    .delete()
    .eq('id', id)
    .eq('account_id', user.account_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
