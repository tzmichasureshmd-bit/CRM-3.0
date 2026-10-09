import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');

    let q = supabase.from('crm3_content').select('*').eq('account_id', profile.account_id).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
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
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 });

    const body = await req.json();
    const { data, error } = await supabase.from('crm3_content').insert({
      ...body,
      account_id: profile.account_id,
      user_id: user.id,
      status: body.status ?? 'draft',
    }).select().single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('[content POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
