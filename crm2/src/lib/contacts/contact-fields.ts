/**
 * Shared metadata for the upgraded Contacts page: column management,
 * searching, filtering, import mapping, and export all derive from the
 * single source of truth defined here.
 *
 * The "required business/lead fields" from the CRM spec are first-class:
 * Country, Location, Category, Name, Address, Phone, Email, Website,
 * Rating, Reviews, Lead Status, Tags, Created Date.
 */

import { LEAD_STATUSES } from '@/lib/crm/lead-status';

export type ContactColumnKey =
  | 'name'
  | 'category'
  | 'country'
  | 'location'
  | 'address'
  | 'phone'
  | 'email'
  | 'website'
  | 'rating'
  | 'reviews'
  | 'lead_status'
  | 'tags'
  | 'created_at'
  | 'company'
  | 'updated_at'
  | 'source'
  | 'source_platform'
  | 'source_page'
  | 'source_instagram'
  | 'campaign'
  | 'form';

export type ContactFieldType = 'text' | 'number' | 'date';

export interface ContactFieldDef {
  key: ContactColumnKey;
  label: string;
  type: ContactFieldType;
  /** Supabase column this maps to (null for the m2m `tags` column). */
  dbColumn: string | null;
  searchable: boolean;
  filterable: boolean;
  /** Whether the column shows by default in the table. */
  defaultVisible: boolean;
  /** Prioritized for the compact/responsive layout. */
  priority?: boolean;
  /** Used by the import preview as a "required" field when present. */
  requiredImport?: boolean;
}

/**
 * Ordered list of every contact column. This order is the default column
 * order in the table and the source for the Columns manager.
 */
export const CONTACT_FIELDS: ContactFieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', dbColumn: 'name', searchable: true, filterable: true, defaultVisible: true, priority: true, requiredImport: true },
  { key: 'category', label: 'Category', type: 'text', dbColumn: 'category', searchable: true, filterable: true, defaultVisible: true, priority: true },
  { key: 'country', label: 'Country', type: 'text', dbColumn: 'country', searchable: true, filterable: true, defaultVisible: true, requiredImport: true },
  { key: 'location', label: 'Location', type: 'text', dbColumn: 'location', searchable: true, filterable: true, defaultVisible: true, priority: true, requiredImport: true },
  { key: 'address', label: 'Address', type: 'text', dbColumn: 'address', searchable: true, filterable: true, defaultVisible: true, priority: false, requiredImport: true },
  { key: 'phone', label: 'Phone', type: 'text', dbColumn: 'phone', searchable: true, filterable: true, defaultVisible: true, priority: true, requiredImport: true },
  { key: 'email', label: 'Email', type: 'text', dbColumn: 'email', searchable: true, filterable: true, defaultVisible: true, requiredImport: true },
  { key: 'website', label: 'Website', type: 'text', dbColumn: 'website', searchable: true, filterable: true, defaultVisible: true, requiredImport: true },
  { key: 'rating', label: 'Rating', type: 'number', dbColumn: 'rating', searchable: false, filterable: true, defaultVisible: true, requiredImport: true },
  { key: 'reviews', label: 'Reviews', type: 'number', dbColumn: 'review_count', searchable: false, filterable: true, defaultVisible: true, requiredImport: true },
  { key: 'lead_status', label: 'Lead Status', type: 'text', dbColumn: 'lead_status', searchable: true, filterable: true, defaultVisible: true, priority: true },
  { key: 'tags', label: 'Tags', type: 'text', dbColumn: null, searchable: true, filterable: true, defaultVisible: true, priority: true },
  { key: 'created_at', label: 'Created Date', type: 'date', dbColumn: 'created_at', searchable: false, filterable: true, defaultVisible: true, requiredImport: true },
  { key: 'company', label: 'Company', type: 'text', dbColumn: 'company', searchable: true, filterable: true, defaultVisible: false },
  { key: 'updated_at', label: 'Updated Date', type: 'date', dbColumn: 'updated_at', searchable: false, filterable: true, defaultVisible: false },
  { key: 'source', label: 'Source', type: 'text', dbColumn: 'source', searchable: true, filterable: true, defaultVisible: false },
  { key: 'source_platform', label: 'Source Platform', type: 'text', dbColumn: 'source_platform', searchable: true, filterable: true, defaultVisible: false },
  { key: 'source_page', label: 'Page/Account', type: 'text', dbColumn: 'source_page_name', searchable: true, filterable: true, defaultVisible: false },
  { key: 'source_instagram', label: 'Instagram Account', type: 'text', dbColumn: 'source_instagram_username', searchable: true, filterable: true, defaultVisible: false },
  { key: 'campaign', label: 'Campaign', type: 'text', dbColumn: 'campaign_name', searchable: true, filterable: true, defaultVisible: false },
  { key: 'form', label: 'Form', type: 'text', dbColumn: 'form_name', searchable: true, filterable: true, defaultVisible: false },
];

export const CONTACT_FIELDS_BY_KEY: Record<ContactColumnKey, ContactFieldDef> =
  Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, f])) as Record<
    ContactColumnKey,
    ContactFieldDef
  >;

/** The 13 required import fields, in canonical order. */
export const REQUIRED_IMPORT_FIELDS = CONTACT_FIELDS.filter(
  (f) => f.requiredImport
);

/**
 * Default visible column set.
 *
 * Kept to the seven highest-signal columns (Name, Category, Country,
 * Location, Phone, Lead Status, Tags) so the table fits the viewport
 * on a normal screen without forcing the whole page into horizontal
 * scroll. Every other field — Address, Email, Website, Rating, Reviews,
 * Created Date, etc. — remains stored, searchable, filterable,
 * exportable and available in Contact Details, and can be re-shown via
 * the Columns control (they're never deleted by being hidden).
 */
export const DEFAULT_VISIBLE_COLUMNS: ContactColumnKey[] = [
  'name',
  'category',
  'country',
  'location',
  'phone',
  'lead_status',
  'source_platform',
  'tags',
  'created_at',
];

/** Columns prioritized for the responsive/compact layout (spec §2/§24). */
export const PRIORITY_COLUMNS: ContactColumnKey[] = [
  'name',
  'category',
  'location',
  'phone',
  'lead_status',
  'tags',
];

export const TV_LOCALSTORAGE_KEY = 'crm.contacts.columns';

export function parseColumnVisibility(saved?: string | null): ContactColumnKey[] | null {
  if (!saved) return null;
  try {
    const arr = JSON.parse(saved) as unknown;
    if (!Array.isArray(arr)) return null;
    const keys = arr.filter(
      (k): k is ContactColumnKey =>
        typeof k === 'string' && k in CONTACT_FIELDS_BY_KEY
    );
    return keys.length > 0 ? keys : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Filter definitions
 * ------------------------------------------------------------------ */

export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'eq'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'between'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'this_month'
  | 'custom'
  | 'before'
  | 'after';

export const TEXT_OPERATORS: FilterOperator[] = [
  'is',
  'is_not',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
];

export const ENUM_OPERATORS: FilterOperator[] = [
  'is',
  'is_not',
  'contains',
];

export const NUMBER_OPERATORS: FilterOperator[] = [
  'eq',
  'gt',
  'lt',
  'gte',
  'lte',
  'between',
];

export const DATE_OPERATORS: FilterOperator[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'this_month',
  'custom',
  'before',
  'after',
  'between',
];

export function operatorsForType(type: ContactFieldType): FilterOperator[] {
  if (type === 'number') return NUMBER_OPERATORS;
  if (type === 'date') return DATE_OPERATORS;
  return TEXT_OPERATORS;
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  eq: '=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  between: 'between',
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  this_month: 'This month',
  custom: 'Custom range',
  before: 'Before',
  after: 'After',
};

export interface ContactFilter {
  id: string;
  field: ContactColumnKey;
  operator: FilterOperator;
  /** How this filter joins to the PREVIOUS filter (first one may omit). */
  connector?: 'and' | 'or';
  /** Value(s). Second element used by `between`. */
  value: string;
  value2?: string;
}

/**
 * Convert a flat, sequentially-joined filter list into the RPC's group
 * shape: conditions within a group are OR'd; groups are AND'd. This
 * yields left-to-right AND/OR precedence and satisfies every required
 * example:
 *   - Country=India AND Location=Guntur AND Category=Preschool
 *     -> three single-condition groups.
 *   - Category=School OR Category=Preschool -> one group of two.
 */
export function filtersToGroups(
  filters: ContactFilter[]
): { field: ContactColumnKey; op: string; value: string; value2?: string }[][] {
  const groups: { field: ContactColumnKey; op: string; value: string; value2?: string }[][] =
    [];
  for (const f of filters) {
    const cond = { field: f.field, op: f.operator, value: f.value, value2: f.value2 };
    const connector = f.connector ?? 'and';
    if (connector === 'or' && groups.length > 0) {
      groups[groups.length - 1].push(cond);
    } else {
      groups.push([cond]);
    }
  }
  return groups;
}

export const LEAD_STATUS_VALUES: readonly string[] = LEAD_STATUSES;

export { leadStatusLabel } from '@/lib/crm/lead-status';

export const SUGGESTED_CATEGORIES = [
  'School',
  'Preschool',
  'Hospital',
  'Restaurant',
  'Hotel',
  'Real Estate',
  'Retail',
  'Service',
  'Other',
];

/* ------------------------------------------------------------------ *
 * Quick filter tabs (spec §13)
 * ------------------------------------------------------------------ */

export interface QuickTab {
  id: string;
  label: string;
  /** Returns a filter set given a specific day for relative dates. */
  builtin?: 'high_rated' | 'reviewed' | 'new_leads' | 'imported';
}

export const QUICK_TABS: QuickTab[] = [
  { id: 'all', label: 'All' },
  { id: 'high_rated', label: 'High Rated', builtin: 'high_rated' },
  { id: 'reviewed', label: 'Reviewed', builtin: 'reviewed' },
  { id: 'new_leads', label: 'New Leads', builtin: 'new_leads' },
  { id: 'imported', label: 'Imported', builtin: 'imported' },
];
