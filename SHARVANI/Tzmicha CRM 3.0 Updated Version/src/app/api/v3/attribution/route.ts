/**
 * CRM 3.0 — Attribution API
 * GET  /api/v3/attribution  — aggregated attribution metrics
 * POST /api/v3/attribution  — create attribution record
 *
 * Security: account_id always from session. Never from body/query.
 * All queries tenant-scoped. No cross-account access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .single();
  return (data?.account_id as string) ?? null;
}

// ── GET /api/v3/attribution ───────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const url = new URL(req.url);
    const dateFrom  = url.searchParams.get('date_from');
    const dateTo    = url.searchParams.get('date_to');
    const contentId = url.searchParams.get('content_id');
    const campaignId = url.searchParams.get('campaign_id');
    const source    = url.searchParams.get('source');
    const view      = url.searchParams.get('view') ?? 'overview'; // overview | content | campaign | source | timeline

    // ── Base attribution query ────────────────────────────────
    let q = supabase
      .from('crm3_attribution')
      .select(`
        id, content_id, campaign_id, conversation_id, contact_id, deal_id,
        lead_created_at, deal_value, revenue_amount, currency,
        attribution_confidence, attribution_method,
        source, channel, is_won, deal_won_at, qualified_at, created_at
      `)
      .eq('account_id', accountId);

    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo)   q = q.lte('created_at', dateTo);
    if (contentId)  q = q.eq('content_id', contentId);
    if (campaignId) q = q.eq('campaign_id', campaignId);
    if (source)     q = q.eq('source', source);

    const { data: rows, error } = await q.order('created_at', { ascending: false }).limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const records = rows ?? [];

    // ── Overview metrics ──────────────────────────────────────
    const totalLeads       = records.filter(r => r.contact_id).length;
    const qualifiedLeads   = records.filter(r => r.qualified_at).length;
    const totalDeals       = records.filter(r => r.deal_id).length;
    const wonDeals         = records.filter(r => r.is_won).length;
    const attributedRevenue = records
      .filter(r => r.is_won && r.revenue_amount)
      .reduce((s, r) => s + (r.revenue_amount as number), 0);
    const pipelineValue    = records
      .filter(r => r.deal_id && !r.is_won && r.deal_value)
      .reduce((s, r) => s + (r.deal_value as number), 0);
    const conversionRate   = totalLeads > 0 ? Math.round((wonDeals / totalLeads) * 100) : 0;

    const overview = {
      total_leads: totalLeads,
      qualified_leads: qualifiedLeads,
      total_deals: totalDeals,
      won_deals: wonDeals,
      attributed_revenue: attributedRevenue,
      pipeline_value: pipelineValue,
      conversion_rate: conversionRate,
      qualification_rate: totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0,
      deal_rate: totalLeads > 0 ? Math.round((totalDeals / totalLeads) * 100) : 0,
    };

    if (view === 'overview') {
      return NextResponse.json({ overview, total_records: records.length });
    }

    // ── Content performance ───────────────────────────────────
    if (view === 'content') {
      // Get content records with attribution counts
      const { data: contentRows } = await supabase
        .from('crm3_content')
        .select('id, title, platform, status, published_at, leads_generated, qualified_leads, deals_attributed, revenue_attributed, reach, impressions, engagement, clicks, ai_generated, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(50);

      // Merge with live attribution counts
      const contentWithAttribution = (contentRows ?? []).map(c => {
        const contentRecords = records.filter(r => r.content_id === c.id);
        const liveLeads    = contentRecords.filter(r => r.contact_id).length;
        const liveQual     = contentRecords.filter(r => r.qualified_at).length;
        const liveDeals    = contentRecords.filter(r => r.deal_id).length;
        const liveRevenue  = contentRecords.filter(r => r.is_won).reduce((s, r) => s + (r.revenue_amount as number ?? 0), 0);

        return {
          ...c,
          // Use live attribution if available, fall back to stored metrics
          leads_generated:   liveLeads  || (c.leads_generated ?? 0),
          qualified_leads:   liveQual   || (c.qualified_leads ?? 0),
          deals_attributed:  liveDeals  || (c.deals_attributed ?? 0),
          revenue_attributed: liveRevenue || (c.revenue_attributed ?? 0),
          attribution_records: contentRecords.length,
        };
      });

      return NextResponse.json({ content: contentWithAttribution, overview });
    }

    // ── Campaign performance ──────────────────────────────────
    if (view === 'campaign') {
      const campaignMap = new Map<string, {
        campaign_id: string;
        leads: number; qualified: number; deals: number; won: number; revenue: number;
      }>();

      records.filter(r => r.campaign_id).forEach(r => {
        const cid = r.campaign_id as string;
        const existing = campaignMap.get(cid) ?? { campaign_id: cid, leads: 0, qualified: 0, deals: 0, won: 0, revenue: 0 };
        if (r.contact_id) existing.leads++;
        if (r.qualified_at) existing.qualified++;
        if (r.deal_id) existing.deals++;
        if (r.is_won) { existing.won++; existing.revenue += r.revenue_amount as number ?? 0; }
        campaignMap.set(cid, existing);
      });

      return NextResponse.json({ campaigns: Array.from(campaignMap.values()), overview });
    }

    // ── Source performance ────────────────────────────────────
    if (view === 'source') {
      // Also pull from contacts.source for broader picture
      const { data: contactRows } = await supabase
        .from('contacts')
        .select('id, source, lead_score_tier, lead_status, created_at')
        .eq('account_id', accountId)
        .not('source', 'is', null)
        .limit(500);

      const sourceMap = new Map<string, {
        source: string; leads: number; hot: number; qualified: number; deals: number; revenue: number;
      }>();

      (contactRows ?? []).forEach(c => {
        const src = (c.source as string) || 'direct';
        const existing = sourceMap.get(src) ?? { source: src, leads: 0, hot: 0, qualified: 0, deals: 0, revenue: 0 };
        existing.leads++;
        if (c.lead_score_tier === 'hot') existing.hot++;
        if (['qualified', 'proposal', 'negotiation', 'won'].includes(c.lead_status as string)) existing.qualified++;
        sourceMap.set(src, existing);
      });

      // Merge deal/revenue data from attribution
      records.filter(r => r.source).forEach(r => {
        const src = r.source as string;
        const existing = sourceMap.get(src) ?? { source: src, leads: 0, hot: 0, qualified: 0, deals: 0, revenue: 0 };
        if (r.deal_id) existing.deals++;
        if (r.is_won) existing.revenue += r.revenue_amount as number ?? 0;
        sourceMap.set(src, existing);
      });

      const sources = Array.from(sourceMap.values()).sort((a, b) => b.leads - a.leads);
      return NextResponse.json({ sources, overview });
    }

    // ── Attribution timeline ──────────────────────────────────
    if (view === 'timeline') {
      const timeline = records.slice(0, 50).map(r => ({
        id: r.id,
        created_at: r.created_at,
        contact_id: r.contact_id,
        content_id: r.content_id,
        campaign_id: r.campaign_id,
        deal_id: r.deal_id,
        revenue_amount: r.revenue_amount,
        is_won: r.is_won,
        attribution_method: r.attribution_method,
        attribution_confidence: r.attribution_confidence,
        source: r.source,
        channel: r.channel,
        lead_created_at: r.lead_created_at,
        deal_won_at: r.deal_won_at,
      }));
      return NextResponse.json({ timeline, overview });
    }

    return NextResponse.json({ overview, total_records: records.length });
  } catch (err) {
    console.error('[attribution GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── POST /api/v3/attribution ──────────────────────────────────
// Creates an attribution record linking content/campaign → contact/deal.
// Called when: a lead is created from a known source, a deal is won, etc.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 });

    const body = await req.json() as {
      content_id?: string;
      campaign_id?: string;
      conversation_id?: string;
      contact_id?: string;
      deal_id?: string;
      lead_created_at?: string;
      deal_value?: number;
      revenue_amount?: number;
      currency?: string;
      attribution_confidence?: string;
      attribution_method?: string;
      source?: string;
      channel?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      is_won?: boolean;
      deal_won_at?: string;
      qualified_at?: string;
    };

    // Validate ownership of referenced entities
    if (body.contact_id) {
      const { data: c } = await supabase.from('contacts').select('id').eq('id', body.contact_id).eq('account_id', accountId).single();
      if (!c) return NextResponse.json({ error: 'Contact not found or access denied' }, { status: 403 });
    }
    if (body.deal_id) {
      const { data: d } = await supabase.from('deals').select('id').eq('id', body.deal_id).eq('account_id', accountId).single();
      if (!d) return NextResponse.json({ error: 'Deal not found or access denied' }, { status: 403 });
    }
    if (body.content_id) {
      const { data: ct } = await supabase.from('crm3_content').select('id').eq('id', body.content_id).eq('account_id', accountId).single();
      if (!ct) return NextResponse.json({ error: 'Content not found or access denied' }, { status: 403 });
    }

    const validMethods = ['direct', 'last_touch', 'first_touch', 'inferred'];
    const validConfidence = ['high', 'medium', 'low', 'unknown'];

    const { data, error } = await supabase
      .from('crm3_attribution')
      .insert({
        account_id:             accountId,
        content_id:             body.content_id ?? null,
        campaign_id:            body.campaign_id ?? null,
        conversation_id:        body.conversation_id ?? null,
        contact_id:             body.contact_id ?? null,
        deal_id:                body.deal_id ?? null,
        lead_created_at:        body.lead_created_at ?? null,
        deal_value:             body.deal_value ?? null,
        revenue_amount:         body.revenue_amount ?? null,
        currency:               body.currency ?? 'USD',
        attribution_confidence: validConfidence.includes(body.attribution_confidence ?? '') ? body.attribution_confidence : 'low',
        attribution_method:     validMethods.includes(body.attribution_method ?? '') ? body.attribution_method : 'inferred',
        source:                 body.source ?? null,
        channel:                body.channel ?? null,
        utm_source:             body.utm_source ?? null,
        utm_medium:             body.utm_medium ?? null,
        utm_campaign:           body.utm_campaign ?? null,
        is_won:                 body.is_won ?? false,
        deal_won_at:            body.deal_won_at ?? null,
        qualified_at:           body.qualified_at ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // best-effort content metric update
    if (body.is_won && body.content_id && body.revenue_amount) {
      void supabase.from('crm3_content').select('revenue_attributed').eq('id', body.content_id).single().then(({ data }) => {
        if (data) {
          void supabase.from('crm3_content').update({ revenue_attributed: ((data.revenue_attributed as number) ?? 0) + body.revenue_amount! }).eq('id', body.content_id!);
        }
      });
    }

    return NextResponse.json({ attribution: data }, { status: 201 });
  } catch (err) {
    console.error('[attribution POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
