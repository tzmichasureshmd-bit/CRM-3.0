import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const { data: conv } = await db
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .maybeSingle();

    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await db
      .from('messages')
      .select('id, conversation_id, content_text, sender_type, status, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[messages GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user, db } = auth;

  try {
    const { id } = await ctx.params;

    const { data: conv } = await db
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('account_id', user.account_id)
      .maybeSingle();

    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json() as { content_text?: string; sender_type?: string };
    if (!body.content_text?.trim()) {
      return NextResponse.json({ error: 'content_text required' }, { status: 400 });
    }

    const { data: msg, error: msgErr } = await db
      .from('messages')
      .insert({
        conversation_id: id,
        account_id: user.account_id,
        content_text: body.content_text.trim(),
        sender_type: body.sender_type ?? 'agent',
        status: 'sent',
      })
      .select('id, conversation_id, content_text, sender_type, status, created_at')
      .single();

    if (msgErr) throw msgErr;

    await db
      .from('conversations')
      .update({ last_message_text: body.content_text.trim(), last_message_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', user.account_id);

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (err) {
    console.error('[messages POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
