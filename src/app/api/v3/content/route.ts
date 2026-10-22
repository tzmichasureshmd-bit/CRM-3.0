import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

const VALID_PLATFORMS = ['instagram', 'facebook', 'whatsapp', 'telegram', 'email'] as const;
const VALID_STATUSES  = ['draft', 'ai_generated', 'in_review', 'approved', 'scheduled', 'published', 'failed'] as const;

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const status   = searchParams.get('status');
    const platform = searchParams.get('platform');

    // Validate filter values to prevent injection
    if (status && !(VALID_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }
    if (platform && !(VALID_PLATFORMS as readonly string[]).includes(platform)) {
      return NextResponse.json({ error: `Invalid platform: ${platform}` }, { status: 400 });
    }

    let q = db.from('crm3_content').select('*').eq('account_id', user.account_id).order('created_at', { ascending: false });
    if (status)   q = q.eq('status', status);
    if (platform) q = q.eq('platform', platform);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[content GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as Record<string, unknown>;

    // Required field validation
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!body.platform || !(VALID_PLATFORMS as readonly string[]).includes(body.platform as string)) {
      return NextResponse.json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` }, { status: 400 });
    }

    // Whitelist allowed fields — never trust arbitrary body keys
    const allowed: (keyof typeof body)[] = [
      'title', 'caption', 'cta', 'hashtags', 'platform', 'content_type',
      'status', 'scheduled_at', 'ai_generated', 'campaign_id',
    ];
    const insert: Record<string, unknown> = {
      account_id: user.account_id,
      user_id: user.user_id,
      status: 'draft',
    };
    for (const key of allowed) {
      if (key in body && body[key] !== undefined) insert[key] = body[key];
    }

    // Validate status if provided
    if (insert.status && !(VALID_STATUSES as readonly string[]).includes(insert.status as string)) {
      insert.status = 'draft';
    }

    // Validate scheduled_at is a valid ISO date if provided
    if (insert.scheduled_at) {
      const d = new Date(insert.scheduled_at as string);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'scheduled_at must be a valid ISO date' }, { status: 400 });
      }
    }

    const { data, error } = await db.from('crm3_content').insert(insert).select().single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('[content POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
