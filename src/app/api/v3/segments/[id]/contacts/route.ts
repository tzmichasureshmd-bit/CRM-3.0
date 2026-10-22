/**
 * CRM 3.0 — Segment Contacts API
 * GET /api/v3/segments/[id]/contacts
 * Lists contacts belonging to a segment (static memberships or dynamic evaluation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user: authUser, db: supabase } = auth;
  const accountId = authUser.account_id;

  try {
    const { id } = await ctx.params;

    const { data: segment } = await supabase
      .from('crm3_segments')
      .select('id, type, rules')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (!segment) return NextResponse.json({ error: 'Segment not found' }, { status: 404 });

    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20'), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0'), 0);

    let contactIds: string[] = [];

    if (segment.type === 'manual') {
      const { data: memberships } = await supabase
        .from('static_segment_memberships')
        .select('contact_id')
        .eq('segment_id', id)
        .order('added_at', { ascending: false });
      contactIds = (memberships ?? []).map((m: any) => m.contact_id);
    } else {
      // Dynamic: evaluate rules against all contacts
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('id, name, email, phone, company, lead_status, lead_score, lead_score_tier, tags, created_at, updated_at, last_customer_reply_at, custom_fields')
        .eq('account_id', accountId)
        .limit(10000);

      const contacts = allContacts ?? [];
      const rules: any[] = (segment.rules as any[]) ?? [];

      for (const c of contacts) {
        let matches = true;
        for (const r of rules) {
          if (!evaluateRule(c, r)) { matches = false; break; }
        }
        if (matches) contactIds.push(c.id);
      }
    }

    const total = contactIds.length;
    const pageIds = contactIds.slice(offset, offset + limit);

    let contacts: any[] = [];
    if (pageIds.length > 0) {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, email, phone, company, source, lead_status, lead_score, lead_score_tier, tags, opt_out, created_at, updated_at')
        .eq('account_id', accountId)
        .in('id', pageIds);
      contacts = data ?? [];
    }

    return NextResponse.json({
      contacts,
      total,
      limit,
      offset,
      has_more: offset + limit < total,
    });
  } catch (err) {
    console.error('[segments contacts]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function evaluateRule(contact: any, rule: any): boolean {
  const field = rule.field;
  const operator = rule.operator;
  const value = rule.value;

  let fieldValue: any;
  switch (field) {
    case 'name': fieldValue = contact.name; break;
    case 'email': fieldValue = contact.email; break;
    case 'phone': fieldValue = contact.phone; break;
    case 'company': fieldValue = contact.company; break;
    case 'source': fieldValue = contact.source; break;
    case 'lead_status': fieldValue = contact.lead_status; break;
    case 'lead_score': fieldValue = contact.lead_score; break;
    case 'lead_score_tier': fieldValue = contact.lead_score_tier; break;
    case 'opt_out': fieldValue = contact.opt_out; break;
    case 'tags': fieldValue = contact.tags; break;
    case 'created_at': fieldValue = contact.created_at; break;
    case 'updated_at': fieldValue = contact.updated_at; break;
    case 'last_customer_reply_at': fieldValue = contact.last_customer_reply_at; break;
    default:
      fieldValue = contact.custom_fields?.[field];
      break;
  }

  switch (operator) {
    case 'equals':
      return fieldValue != null && String(fieldValue).toLowerCase() === String(value ?? '').toLowerCase();
    case 'does_not_equal':
      return fieldValue == null || String(fieldValue).toLowerCase() !== String(value ?? '').toLowerCase();
    case 'contains':
      return fieldValue != null && String(fieldValue).toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'does_not_contain':
      return fieldValue == null || !String(fieldValue).toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'is_empty':
      return fieldValue == null || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'is_not_empty':
      return fieldValue != null && fieldValue !== '' && !(Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'gt':
      return typeof fieldValue === 'number' && typeof value === 'string' && fieldValue > Number(value);
    case 'lt':
      return typeof fieldValue === 'number' && typeof value === 'string' && fieldValue < Number(value);
    case 'before':
      return fieldValue != null && new Date(fieldValue) < new Date(value ?? '');
    case 'after':
      return fieldValue != null && new Date(fieldValue) > new Date(value ?? '');
    case 'within_last_n_days': {
      const days = Number(value);
      if (isNaN(days) || days < 1) return false;
      if (fieldValue == null) return false;
      const cutoff = new Date(Date.now() - days * 86400000);
      return new Date(fieldValue) >= cutoff;
    }
    default:
      return false;
  }
}
