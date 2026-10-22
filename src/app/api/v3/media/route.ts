/**
 * CRM 3.0 — Media & Digital Asset Management API
 * GET  /api/v3/media — list media assets for account
 * POST /api/v3/media — register a media asset (metadata + storage URL)
 *
 * Auth: FastAPI JWT verified via verifyRequest().
 * account_id always from verified token.
 *
 * Note: Actual file upload uses Supabase Storage client-side with a
 * pre-signed URL. This route manages the metadata record only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const VALID_TYPES = ['image', 'video', 'document', 'audio', 'other'];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? '';
  const type = searchParams.get('type') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  if (type && !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }

  try {
    let q = db
      .from('media_assets')
      .select('id, name, file_type, mime_type, size_bytes, storage_url, thumbnail_url, alt_text, tags, created_by, created_at', { count: 'exact' })
      .eq('account_id', user.account_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) q = q.eq('file_type', type);
    if (search) q = q.or(`name.ilike.%${search}%,alt_text.ilike.%${search}%`);

    const { data, error, count } = await q;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error('[media GET]', err);
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
      file_type?: string;
      mime_type?: string;
      size_bytes?: number;
      storage_url?: string;
      thumbnail_url?: string;
      alt_text?: string;
      tags?: string[];
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!body.storage_url?.trim()) {
      return NextResponse.json({ error: 'storage_url is required' }, { status: 400 });
    }
    const fileType = body.file_type ?? 'other';
    if (!VALID_TYPES.includes(fileType)) {
      return NextResponse.json({ error: `file_type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }
    if (body.size_bytes !== undefined && body.size_bytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: `File size exceeds 50 MB limit` }, { status: 400 });
    }

    const { data, error } = await db
      .from('media_assets')
      .insert({
        account_id: user.account_id,
        created_by: user.user_id,
        name: body.name.trim(),
        file_type: fileType,
        mime_type: body.mime_type ?? null,
        size_bytes: body.size_bytes ?? null,
        storage_url: body.storage_url.trim(),
        thumbnail_url: body.thumbnail_url ?? null,
        alt_text: body.alt_text ?? null,
        tags: Array.isArray(body.tags) ? body.tags : [],
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ asset: data }, { status: 201 });
  } catch (err) {
    console.error('[media POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
