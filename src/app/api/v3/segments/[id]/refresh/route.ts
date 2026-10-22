/**
 * CRM 3.0 — Segment Refresh API
 * POST /api/v3/segments/[id]/refresh
 * Recalculates dynamic segment membership and updates contact_count.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await verifyRequest(req);
  if (isAuthError(auth)) return auth;
  const { user: authUser, db: supabase } = auth;
  const accountId = authUser.account_id;

  try {
    const { id } = await ctx.params;

    const { data: segment } = await supabase
      .from('crm3_segments')
      .select('id, type, rules, contact_count')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (!segment) return NextResponse.json({ error: 'Segment not found' }, { status: 404 });

    if (segment.type !== 'rule_based') {
      return NextResponse.json({ error: 'Only rule_based segments can be refreshed' }, { status: 400 });
    }

    const rules: any[] = (segment.rules as any[]) ?? [];
    if (!rules || rules.length === 0) {
      await supabase.from('crm3_segments').update({ contact_count: 0, last_computed_at: new Date().toISOString() }).eq('id', id);
      return NextResponse.json({ segment_id: id, contact_count: 0, added: 0, removed: 0 });
    }

    // Get all contacts for account and evaluate rules
    const { data: allContacts } = await supabase
      .from('contacts')
      .select('id, name, email, phone, company, lead_status, lead_score, lead_score_tier, tags, created_at, updated_at, last_customer_reply_at, custom_fields')
      .eq('account_id', accountId)
      .limit(10000);

    const contacts = allContacts ?? [];
    const matchingIds = new Set<string>();

    for (const c of contacts) {
      let matches = true;
      // Simple AND across all rules (single group)
      for (const r of rules) {
        if (!evaluateRule(c, r)) { matches = false; break; }
      }
      if (matches) matchingIds.add(c.id);
    }

    const previousCount = segment.contact_count ?? 0;
    const newCount = matchingIds.size;

    // Update segment count
    await supabase
      .from('crm3_segments')
      .update({ contact_count: newCount, last_computed_at: new Date().toISOString() })
      .eq('id', id);

    // Log calculation
    await supabase.from('segment_calculation_log').insert({
      account_id: accountId,
      segment_id: id,
      contact_count: newCount,
      previous_count: previousCount,
      added_count: Math.max(0, newCount - previousCount),
      removed_count: Math.max(0, previousCount - newCount),
      triggered_by: 'api',
      status: 'success',
    });

    return NextResponse.json({
      segment_id: id,
      previous_count: previousCount,
      contact_count: newCount,
      added: Math.max(0, newCount - previousCount),
      removed: Math.max(0, previousCount - newCount),
      calculated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[segments refresh]', err);
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
