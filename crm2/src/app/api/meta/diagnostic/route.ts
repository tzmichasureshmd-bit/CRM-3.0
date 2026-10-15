import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';

/**
 * Diagnostic endpoint for Meta integrations.
 * Returns the state of meta_page_connections for the current account.
 * Only accessible to agents.
 */
export async function GET() {
  try {
    const { accountId } = await requireRole('agent');
    const admin = supabaseAdmin();

    // Fetch all meta_page_connections for this account
    const { data: connections, error } = await admin
      .from('meta_page_connections')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[meta/diagnostic] Failed to fetch connections:', error);
      return NextResponse.json(
        { error: 'Failed to fetch connections' },
        { status: 500 }
      );
    }

    // Mask sensitive data (access_token, verify_token)
    const masked = (connections ?? []).map((conn) => ({
      id: conn.id,
      platform: conn.platform,
      page_id: conn.page_id,
      page_name: conn.page_name,
      instagram_account_id: conn.instagram_account_id,
      instagram_username: conn.instagram_username,
      status: conn.status,
      webhook_status: conn.webhook_status,
      access_token_present: !!conn.access_token,
      verify_token_present: !!conn.verify_token,
      created_at: conn.created_at,
      updated_at: conn.updated_at,
    }));

    return NextResponse.json({
      account_id: accountId,
      connections: masked,
      count: masked.length,
      summary: {
        facebook: masked.filter((c) => c.platform === 'facebook').length,
        instagram: masked.filter((c) => c.platform === 'instagram').length,
        active: masked.filter((c) => c.status === 'active').length,
        webhook_active: masked.filter((c) => c.webhook_status === 'active').length,
      },
    });
  } catch (error) {
    console.error('[meta/diagnostic] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
