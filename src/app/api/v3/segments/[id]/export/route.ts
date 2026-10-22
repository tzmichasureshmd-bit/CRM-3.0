/**
 * CRM 3.0 — Segment Export API
 * GET /api/v3/segments/[id]/export
 * Exports segment contacts as CSV.
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
      .select('id, type, name, rules')
      .eq('id', id)
      .eq('account_id', accountId)
      .single();

    if (!segment) return NextResponse.json({ error: 'Segment not found' }, { status: 404 });

    let contactIds: string[] = [];

    if (segment.type === 'manual') {
      const { data: memberships } = await supabase
        .from('static_segment_memberships')
        .select('contact_id')
        .eq('segment_id', id);
      contactIds = (memberships ?? []).map((m: any) => m.contact_id);
    } else {
      // Dynamic: evaluate rules against all contacts
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('id, name, email, phone, company, source, lead_status, lead_score, lead_score_tier, tags, opt_out, created_at, updated_at, custom_fields')
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

    if (contactIds.length === 0) {
      const csv = 'id,name,email,phone,company,source,lead_status,lead_score,lead_score_tier,tags,opt_out,created_at,updated_at\n';
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="segment-${id}-contacts.csv"`,
        },
      });
    }

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, email, phone, company, source, lead_status, lead_score, lead_score_tier, tags, opt_out, created_at, updated_at')
      .eq('account_id', accountId)
      .in('id', contactIds);

    const rows = (contacts ?? []).map((c: any) => {
      const esc = (v: any) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        esc(c.id),
        esc(c.name),
        esc(c.email),
        esc(c.phone),
        esc(c.company),
        esc(c.source),
        esc(c.lead_status),
        esc(c.lead_score),
        esc(c.lead_score_tier),
        esc(c.tags?.join(';')),
        esc(c.opt_out),
        esc(c.created_at),
        esc(c.updated_at),
      ].join(',');
    });

    const csv = [
      'id,name,email,phone,company,source,lead_status,lead_score,lead_score_tier,tags,opt_out,created_at,updated_at',
      ...rows,
    ].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="segment-${segment.name.replace(/[^a-z0-9]/gi, '_')}-contacts.csv"`,
      },
    });
  } catch (err) {
    console.error('[segments export]', err);
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
