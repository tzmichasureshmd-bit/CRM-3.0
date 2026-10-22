/**
 * CRM 3.0 — Segment Preview API
 * POST /api/v3/segments/[id]/preview
 * Evaluates segment rules against contacts and returns matching contact IDs + sample.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, isAuthError } from '@/lib/auth/verify-request';

type Ctx = { params: Promise<{ id: string }> };

// ── Field → column mapping (only columns that exist on contacts) ─────────────
const FIELD_COLUMNS: Record<string, string> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  source: 'source',
  lead_status: 'lead_status',
  lead_score: 'lead_score',
  lead_score_tier: 'lead_score_tier',
  opt_out: 'opt_out',
  tags: 'tags',
  created_at: 'created_at',
  updated_at: 'updated_at',
  last_customer_reply_at: 'last_customer_reply_at',
};

const DATE_FIELDS = ['created_at', 'updated_at', 'last_customer_reply_at'];
const NUMBER_FIELDS = ['lead_score'];
const BOOLEAN_FIELDS = ['opt_out'];
const ARRAY_FIELDS = ['tags'];

// These are referenced by applyFilter's fieldType parameter for documentation
const _FIELD_TYPES = { DATE_FIELDS, NUMBER_FIELDS, BOOLEAN_FIELDS, ARRAY_FIELDS };
export type _FieldTypes = typeof _FIELD_TYPES;

// ── Operator → Supabase filter ───────────────────────────────────────────────
function applyFilter(query: any, field: string, operator: string, value: string | null, fieldType: string) {
  const column = FIELD_COLUMNS[field];
  if (!column) return query;

  const v = value === null || value === undefined ? '' : String(value);

  switch (operator) {
    case 'equals':
      return query.eq(column, v);
    case 'does_not_equal':
      return query.neq(column, v);
    case 'contains':
      return query.ilike(column, `%${v}%`);
    case 'does_not_contain':
      return query.ilike(column, `%${v}%`).not(); // not ideal but best effort
    case 'is_empty':
      return query.or(`${column}.is.null,${column}.eq.`);
    case 'is_not_empty':
      return query.not().or(`${column}.is.null,${column}.eq.`);
    case 'gt':
      if (fieldType === 'number') return query.gt(column, Number(v));
      return query.gt(column, v);
    case 'lt':
      if (fieldType === 'number') return query.lt(column, Number(v));
      return query.lt(column, v);
    case 'before':
      if (fieldType === 'date') return query.lt(column, v);
      return query.lt(column, v);
    case 'after':
      if (fieldType === 'date') return query.gt(column, v);
      return query.gt(column, v);
    case 'within_last_n_days': {
      const days = Number(v);
      if (isNaN(days) || days < 1) return query;
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      return query.gte(column, cutoff);
    }
    default:
      return query;
  }
}

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

    const body = await req.json() as { rules?: any[]; limit?: number };
    const rules: any[] = body.rules ?? (segment.type === 'rule_based' ? (segment.rules as any[]) : []);
    const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);

    let totalCount = 0;
    let sampleContacts: any[] = [];

    if (segment.type === 'manual') {
      // Static segment: return stored memberships
      const { data: memberships, error: mErr } = await supabase
        .from('static_segment_memberships')
        .select('contact_id')
        .eq('segment_id', id)
        .limit(limit);

      if (mErr) throw mErr;

      const { count: total } = await supabase
        .from('static_segment_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('segment_id', id);
      totalCount = total ?? 0;

      if (memberships && memberships.length > 0) {
        const contactIds = memberships.map((m: any) => m.contact_id);
        const { data: contacts, error: cErr } = await supabase
          .from('contacts')
          .select('id, name, email, phone, company, lead_status, lead_score, lead_score_tier, tags, created_at')
          .eq('account_id', accountId)
          .in('id', contactIds)
          .limit(limit);
        if (!cErr) sampleContacts = contacts ?? [];
      }
    } else if (segment.type === 'rule_based' || segment.type === 'ai_assisted') {
      // Dynamic segment: evaluate rules against contacts
      if (!rules || rules.length === 0) {
        return NextResponse.json({
          segment_id: id,
          matching_count: 0,
          sample_contacts: [],
          conditions_applied: [],
          calculated_at: new Date().toISOString(),
          message: 'No rules defined',
        });
      }

      // Build query with AND/OR group logic
      // Group conditions by condition_group, OR within group, AND between groups
      const groups = new Map<number, any[]>();
      for (const r of rules) {
        const g = r.condition_group ?? 1;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(r);
      }

      const allGroups = Array.from(groups.entries());
      const isSingleGroupAndSimple = allGroups.length === 1;

      if (isSingleGroupAndSimple) {
        // Push filters to DB
        let q = supabase.from('contacts').select('id, name, email, phone, company, lead_status, lead_score, lead_score_tier, tags, created_at', { count: 'exact', head: true }).eq('account_id', accountId);
        for (const r of allGroups[0][1]) {
          q = applyFilter(q, r.field, r.operator, r.value, r.field_type);
        }
        const { data, error, count } = await q.limit(limit);
        if (error) throw error;
        totalCount = count ?? 0;
        sampleContacts = data ?? [];
      } else {
        // Complex OR/AND: fetch all matching account contacts and filter in memory
        const { data: allContacts, error: acErr } = await supabase
          .from('contacts')
          .select('id, name, email, phone, company, lead_status, lead_score, lead_score_tier, tags, created_at, updated_at, last_customer_reply_at, custom_fields')
          .eq('account_id', accountId)
          .limit(5000); // safety cap

        if (acErr) throw acErr;
        const contacts = allContacts ?? [];

        // Evaluate each rule group (OR within group, AND between groups)
        const matching = contacts.filter((c: any) => {
          return allGroups.every(([_, groupRules]) => {
            // OR within group: any rule matches
            return groupRules.some((r: any) => evaluateRule(c, r));
          });
        });

        totalCount = matching.length;
        sampleContacts = matching.slice(0, limit);
      }
    }

    return NextResponse.json({
      segment_id: id,
      matching_count: totalCount,
      sample_contacts: sampleContacts,
      conditions_applied: rules,
      calculated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[segments preview]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── Evaluate a single rule against a contact (in-memory) ─────────────────────
function evaluateRule(contact: any, rule: any): boolean {
  const field = rule.field;
  const operator = rule.operator;
  const value = rule.value;
  const fieldType = rule.field_type ?? 'text';

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
      // Check custom_fields
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
