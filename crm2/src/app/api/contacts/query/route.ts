import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import type { Contact } from '@/types';
import type { ContactColumnKey } from '@/lib/contacts/contact-fields';

const MAX_EXPORT_ROWS = 100_000;

interface FilterCondition {
  field: ContactColumnKey;
  op: string;
  value?: string;
  value2?: string;
}

interface QueryBody {
  search?: string | null;
  /** Array of groups; conditions within a group are OR'd, groups are AND'd. */
  groups?: FilterCondition[][];
  tagIds?: string[] | null;
  page?: number;
  pageSize?: number;
  order?: string;
  ascending?: boolean;
  /** When true, ignore pagination and return everything (export use). */
  all?: boolean;
  importedOnly?: boolean;
  /** Explicit contact ids to fetch (export-selected path). */
  ids?: string[] | null;
}

type RowWithTags = Omit<Contact, 'tags'> & {
  tags?: { id: string; name: string; color: string }[];
};
function cleanToken(
  v: unknown,
  maxLen: number,
  allow: RegExp
): string | null {
  if (typeof v !== 'string') return null;
  const s = v.slice(0, maxLen);
  return allow.test(s) ? s : null;
}

const ORDER_ALLOW = /^[a-z_]+$/;
const SIMPLE_SAFE = /^[^;'"()]*$/;

/** Sanitize the filter payload so it can never inject SQL into the RPC. */
function sanitizeGroups(raw: unknown): FilterCondition[][] | null {
  if (!Array.isArray(raw)) return null;
  const groups: FilterCondition[][] = [];
  for (const g of raw) {
    if (!Array.isArray(g)) continue;
    const conds: FilterCondition[] = [];
    for (const c of g) {
      if (!c || typeof c !== 'object') continue;
      const field = (c as { field?: unknown }).field;
      const op = (c as { op?: unknown }).op;
      if (typeof field !== 'string' || !/^[a-z_]+$/.test(field)) continue;
      if (typeof op !== 'string' || !/^[a-z_]+$/.test(op)) continue;
      const rawVal = (c as { value?: unknown }).value;
      const rawVal2 = (c as { value2?: unknown }).value2;
      let value = typeof rawVal === 'string' ? rawVal.slice(0, 2000) : '';
      let value2 = typeof rawVal2 === 'string' ? rawVal2.slice(0, 2000) : '';
      // Number/date operators must be numeric-safe.
      if (
        ['eq', 'gt', 'lt', 'gte', 'lte', 'between', 'before', 'after'].includes(
          op
        )
      ) {
        value = value.replace(/[^0-9.\-:/T ]/g, '');
        value2 = value2.replace(/[^0-9.\-:/T ]/g, '');
      } else if (op === 'custom') {
        value = value.replace(/[^0-9.\-:/T ]/g, '');
        value2 = value2.replace(/[^0-9.\-:/T ]/g, '');
      } else {
        if (!SIMPLE_SAFE.test(value)) value = '';
        if (!SIMPLE_SAFE.test(value2)) value2 = '';
      }
      conds.push({ field: field as ContactColumnKey, op, value, value2 });
    }
    if (conds.length > 0) groups.push(conds);
  }
  return groups;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const body = (await request.json().catch(() => ({}))) as QueryBody;

    const search = cleanToken(body.search?.trim(), 500, /^[\p{L}\p{N} +@.\-_]*$/u) ?? '';
    const groups = sanitizeGroups(body.groups);
    const tagIds = Array.isArray(body.tagIds)
      ? body.tagIds.filter((t): t is string => typeof t === 'string')
      : [];
    const order =
      cleanToken(body.order ?? 'created_at', 50, ORDER_ALLOW) ?? 'created_at';
    const ascending = body.ascending === true;
    const all = body.all === true;
    const importedOnly = body.importedOnly === true;
    const selectIds = Array.isArray(body.ids)
      ? body.ids.filter((t): t is string => typeof t === 'string').slice(0, 100_000)
      : [];

    // Bulk export guard (security). The `all` flag and the unbounded
    // `ids` path are used for exporting large contact sets. These must be
    // limited to platform super-admins; any other authenticated user gets a
    // 403 so customer data cannot be bulk-extracted. The normal paginated
    // table query (page/pageSize, bounded to 100 rows server-side) remains
    // available to any viewer.
    const isBulkExport = all === true || selectIds.length > 0;
    if (isBulkExport && ctx.platformRole !== 'super_admin') {
      return NextResponse.json(
        { error: 'Export is not permitted for your role' },
        { status: 403 },
      );
    }

    // Explicit-id path (export selected): fetch directly, scoped by RLS.
    if (selectIds.length > 0) {
      const { data: byIdRows } = await ctx.supabase
        .from('contacts')
        .select('*')
        .in('id', selectIds);
      const { data: byIdTags } = await ctx.supabase
        .from('contact_tags')
        .select('contact_id, tag:tags(id, name, color)')
        .in('contact_id', selectIds);
      const tagsByContact: Record<string, { id: string; name: string; color: string }[]> = {};
      for (const ct of byIdTags ?? []) {
        const tag = (ct as unknown as { tag: { id: string; name: string; color: string } | null }).tag;
        if (!tag) continue;
        if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
        tagsByContact[ct.contact_id].push(tag);
      }
      const byIdRowsTyped = ((byIdRows ?? []) as Contact[]).map((c) => ({
        ...c,
        tags: tagsByContact[c.id] ?? [],
      })) as RowWithTags[];
      return NextResponse.json({ contacts: byIdRowsTyped, totalCount: byIdRowsTyped.length });
    }

    const page = Number.isFinite(body.page) ? Math.max(0, Math.floor(body.page!)) : 0;
    const pageSize = all
      ? MAX_EXPORT_ROWS
      : Number.isFinite(body.pageSize)
        ? Math.min(100, Math.max(1, Math.floor(body.pageSize!)))
        : 25;

    const { data: rpcResult, error: rpcError } = await ctx.supabase.rpc(
      'filter_contacts',
      {
        p_account_id: ctx.accountId,
        p_search: search || null,
        p_groups: groups ? JSON.stringify(groups) : '[]',
        p_tag_ids: tagIds,
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_order: order,
        p_ascending: ascending,
        p_imported_only: importedOnly,
      }
    );

    if (rpcError) {
      console.error('[contacts/query] rpc error:', rpcError);
      return NextResponse.json(
        { error: 'Could not query contacts' },
        { status: 500 }
      );
    }

    const rows = (rpcResult ?? []) as unknown as Array<{
      id: string;
      total_count: number;
    }>;
    const ids = rows.map((r) => r.id);
    const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;

    let contacts: RowWithTags[] = [];
    if (ids.length > 0) {
      const { data: contactRows } = await ctx.supabase
        .from('contacts')
        .select('*')
        .in('id', ids);
      const { data: contactTags } = await ctx.supabase
        .from('contact_tags')
        .select('contact_id, tag_id, tag:tags(id, name, color)')
        .in('contact_id', ids);

      const tagsByContact: Record<string, { id: string; name: string; color: string }[]> = {};
      for (const ct of contactTags ?? []) {
        const tag = (ct as unknown as { tag: { id: string; name: string; color: string } | null })
          .tag;
        if (!tag) continue;
        if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
        tagsByContact[ct.contact_id].push(tag);
      }

      contacts = ((contactRows ?? []) as Contact[]).map((c) => ({
        ...c,
        tags: tagsByContact[c.id] ?? [],
      }));
    }

    return NextResponse.json({ contacts, totalCount });
  } catch (error) {
    return toErrorResponse(error);
  }
}
