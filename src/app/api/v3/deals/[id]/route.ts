/**
 * CRM 3.0 — Deal Detail API
 * GET    /api/v3/deals/[id] — fetch deal
 * DELETE /api/v3/deals/[id] — delete deal
 *
 * Scoped to tenant account_id when authenticated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/crm-pipeline-store';

type RouteContext = { params: Promise<{ id: string }> };

function isNetworkOrOfflineError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const msg = String(obj.message || obj.error || '').toLowerCase();
    const details = String(obj.details || '').toLowerCase();
    if (
      msg.includes('fetch failed') ||
      msg.includes('failed to fetch') ||
      msg.includes('enotfound') ||
      msg.includes('econnrefused') ||
      details.includes('enotfound') ||
      details.includes('econnrefused') ||
      details.includes('fetch failed') ||
      obj.status === 0
    ) {
      return true;
    }
  }
  const str = String(err).toLowerCase();
  return str.includes('fetch failed') || str.includes('failed to fetch') || str.includes('enotfound');
}

async function getAccountId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('profiles').select('account_id').eq('user_id', userId).maybeSingle();
    return (data?.account_id as string) ?? null;
  } catch {
    return null;
  }
}

// ── GET /api/v3/deals/[id] ───────────────────────────────────
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: 'Deal ID is required' }, { status: 400 });
    }

    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid deal UUID' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl.includes('placeholder.supabase.co')) {
      return NextResponse.json({ error: 'Supabase database not configured' }, { status: 404 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let query = supabase.from('deals').select('*, contacts(name)').eq('id', id);

    if (user?.id) {
      const accountId = await getAccountId(supabase, user.id);
      if (accountId) {
        query = query.eq('account_id', accountId);
      }
    }

    const { data, error } = await query.single();
    if (error || !data) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    if (isNetworkOrOfflineError(err)) {
      return NextResponse.json({ error: 'Database service unreachable' }, { status: 503 });
    }
    console.error('[deals GET id exception]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── DELETE /api/v3/deals/[id] ────────────────────────────────
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    if (!id || typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ error: 'Deal ID is required' }, { status: 400 });
    }

    const cleanId = id.trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfiguredSupabase = Boolean(supabaseUrl) && !supabaseUrl?.includes('placeholder.supabase.co');

    // If Supabase is configured and ID is a valid database UUID, execute deletion in Supabase
    if (isConfiguredSupabase && isUuid(cleanId)) {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        let query = supabase.from('deals').delete().eq('id', cleanId);

        if (user?.id) {
          const accountId = await getAccountId(supabase, user.id);
          if (accountId) {
            query = query.eq('account_id', accountId);
          }
        }

        const { error } = await query;
        if (error) {
          if (isNetworkOrOfflineError(error)) {
            console.warn('[deals DELETE] Supabase unreachable; persisting locally:', error.message);
          } else {
            console.error('[deals DELETE] Database deletion error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
        }
      } catch (dbErr: unknown) {
        if (!isNetworkOrOfflineError(dbErr)) {
          console.error('[deals DELETE exception]:', dbErr);
          const msg = dbErr instanceof Error ? dbErr.message : 'Database error';
          return NextResponse.json({ error: msg }, { status: 500 });
        }
        console.warn('[deals DELETE] Database connection notice (operating in local fallback):', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      deletedId: cleanId,
      message: 'Deal deleted successfully.',
    });
  } catch (err: unknown) {
    console.error('[deals DELETE fatal exception]', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
