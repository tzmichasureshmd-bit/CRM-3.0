import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

export async function GET(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const platform = url.searchParams.get('platform');
    const contactId = url.searchParams.get('contact_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 200);

    let query = db
      .from('conversations')
      .select(`
        id, contact_id, platform, status, priority, unread_count,
        last_message_at, last_message_text, assigned_agent_id,
        ai_intent, ai_sentiment, ai_summary, ai_lead_score, ai_next_action,
        created_at,
        contact:contacts(id, name, phone, email, lead_score, lead_score_tier, lead_status, source)
      `)
      .eq('account_id', user.account_id)
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);
    if (platform) query = query.eq('platform', platform);
    if (contactId) query = query.eq('contact_id', contactId);

    const { data, error } = await query;
    if (error) {
      // If column error, retry with minimal columns
      const { data: minimal } = await db
        .from('conversations')
        .select('id, contact_id, platform, status, priority, unread_count, last_message_at, last_message_text, created_at, contact:contacts(id, name, phone, email, lead_score, lead_score_tier, lead_status, source)')
        .eq('account_id', user.account_id)
        .order('last_message_at', { ascending: false })
        .limit(limit);
      return NextResponse.json({ data: minimal ?? [], total: minimal?.length ?? 0 });
    }
    return NextResponse.json({ data: data ?? [], total: data?.length ?? 0 });
  } catch (err) {
    console.error('[conversations GET]', err);
    return NextResponse.json({ data: [], total: 0 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const body = await req.json() as Record<string, unknown>;
    const { data, error } = await db
      .from('conversations')
      .insert({ ...body, account_id: user.account_id })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error('[conversations POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
