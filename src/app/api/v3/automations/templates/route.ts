/**
 * CRM 3.0 — Automation Templates API
 * GET /api/v3/automations/templates — list built-in templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('crm3_automation_templates')
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false });

    if (error) {
      // Table may not exist yet — return empty array gracefully
      return NextResponse.json({ templates: [] });
    }

    return NextResponse.json({ templates: data ?? [] });
  } catch (err) {
    console.error('[automation templates GET]', err);
    return NextResponse.json({ templates: [] });
  }
}
