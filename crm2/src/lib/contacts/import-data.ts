/**
 * Import data pipeline for the Contacts wizard: file parsing (CSV + XLSX),
 * header auto-mapping, and per-row validation. Kept as a pure, unit-testable
 * module; the UI wizard drives it.
 */

import type { ContactColumnKey } from './contact-fields';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';

/** Raw parsed file: ordered headers + rows as string[][] (rows index into headers). */
export interface ParsedFile {
  headers: string[];
  rows: string[][];
}

export type MappingTarget = ContactColumnKey | 'unmapped' | 'custom';

export interface ColumnMapping {
  header: string;
  /** CRM field this header maps to. 'unmapped' = ignored, 'custom' = custom field. */
  target: MappingTarget;
  /** When target === 'custom', the custom field id (existing) or a pending-create name. */
  customFieldKey?: string;
}

/**
 * Alias groups for auto-mapping file headers to CRM fields (spec §6).
 * Lowercased + trimmed header -> CRM field.
 */
export const AUTO_MAP_ALIASES: Record<ContactColumnKey, string[]> = {
  country: ['country', 'country name'],
  location: ['location', 'city', 'city name'],
  category: ['category', 'business category'],
  name: ['name', 'business name', 'company name', 'contact name'],
  address: ['address', 'full address'],
  phone: ['phone', 'mobile', 'whatsapp', 'phone number', 'whatsapp number', 'contact'],
  email: ['email', 'email address', 'email id'],
  website: ['website', 'website url', 'url'],
  rating: ['rating', 'google rating', 'rating score'],
  reviews: ['reviews', 'review count', 'no of reviews', 'number of reviews'],
  lead_status: ['lead status', 'status', 'lead stage'],
  tags: ['tags', 'tag'],
  created_at: ['created', 'created date', 'date', 'added date'],
  updated_at: ['updated', 'updated date', 'last updated'],
  company: ['company', 'organization', 'organisation', 'business'],
  source: [],
  source_platform: [],
  source_page: [],
  source_instagram: [],
  campaign: [],
  form: [],
};

function buildAliasLookup(): Map<string, ContactColumnKey> {
  const map = new Map<string, ContactColumnKey>();
  for (const [field, aliases] of Object.entries(AUTO_MAP_ALIASES)) {
    for (const a of aliases) map.set(a.trim().toLowerCase(), field as ContactColumnKey);
  }
  return map;
}

const ALIAS_LOOKUP = buildAliasLookup();

export function autoMapColumns(headers: string[]): ColumnMapping[] {
  return headers.map((h) => {
    const key = h.trim().toLowerCase();
    const target = ALIAS_LOOKUP.get(key);
    return { header: h, target: target ?? 'unmapped' };
  });
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Robust CSV parser: quoted fields, escaped "" quotes, multiline fields. */
export function parseCsv(text: string): string[][] {
  const src = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      cur = '';
      // Skip the \r part of \r\n
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else if (ch === '\r') {
      // ignore (handled on \n)
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

async function parseCsvFile(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const grid = parseCsv(text);
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].map((h) => h.trim());
  const rows = grid.slice(1).map((r) => {
    const out: string[] = new Array(headers.length).fill('');
    for (let i = 0; i < r.length; i++) out[i] = r[i] ?? '';
    return out;
  });
  return { headers, rows };
}

async function parseXlsxFile(file: File): Promise<ParsedFile> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  if (json.length === 0) return { headers: [], rows: [] };
  // Derive headers from the keys of the first row (in sheet order).
  const headers: string[] = [];
  const range = sheet['!ref'];
  if (range) {
    const cols = XLSX.utils.decode_range(range);
    for (let c = cols.s.c; c <= cols.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
      headers.push(cell && cell.v !== undefined ? String(cell.v).trim() : `Column ${c + 1}`);
    }
  } else {
    headers.push(...Object.keys(json[0]));
  }
  const rows = json.map((rec) => headers.map((h) => str(rec[h])));
  return { headers, rows };
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return String(v);
}

export async function parseImportFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXlsxFile(file);
  }
  return parseCsvFile(file);
}

/* ------------------------------------------------------------------ *
 * Row -> contact mapping + validation
 * ------------------------------------------------------------------ */

export function parseTagCell(value: string): string[] {
  if (!value?.trim()) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of value.split(/[,;]/)) {
    const n = part.trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(n);
  }
  return names;
}

export interface ImportValidation {
  error: string | null;
}

export interface MappedRow {
  /** Raw header -> raw value (post-mapping target resolved by caller). */
  values: Record<string, string>;
  tagNames: string[];
}

/**
 * Validate a single mapped contact row against a given mapping.
 * Returns a list of human-readable problems; empty = valid.
 */
export function validateMappedRow(
  row: Record<string, string>,
  mapping: ColumnMapping[],
  requiredPhone = true
): string[] {
  const problems: string[] = [];
  const get = (field: ContactColumnKey): string => {
    for (const m of mapping) if (m.target === field) return (row[m.header] ?? '').trim();
    return '';
  };

  const phone = get('phone');
  const digits = normalizePhone(phone);
  if (requiredPhone && !phone) {
    problems.push('Phone is required');
  } else if (phone) {
    // Accept phone numbers in many legitimate formats: with a leading
    // trunk `0` (e.g. `09876543210`), a country code (`+91 ...`,
    // `+1 ...`), spaces, hyphens, dots, brackets. We require a plausible
    // minimum digit count but never reject a number purely for using a
    // leading zero (a valid national trunk prefix) or for non-digit
    // separators. Numbers that can't be confidently normalized keep
    // their original value instead of being dropped (see buildContactRow).
    if (!digits) {
      problems.push('Phone looks invalid (no digits)');
    } else if (digits.length < 7) {
      problems.push(`Phone looks invalid (only ${digits.length} digits)`);
    } else if (digits.length > 15) {
      problems.push(`Phone looks invalid (${digits.length} digits)`);
    }
  }

  const email = get('email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    problems.push(`Invalid email: ${email}`);
  }

  const website = get('website');
  if (website && !/^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}([/?#]\S*)?$/i.test(website)) {
    problems.push(`Invalid website: ${website}`);
  }

  const rating = get('rating');
  if (rating) {
    const n = Number(rating.replace(',', '.'));
    if (Number.isNaN(n) || n < 0 || n > 5) {
      problems.push(`Invalid rating: ${rating}`);
    }
  }

  const reviews = get('reviews');
  if (reviews) {
    const n = parseInt(reviews.replace(/[^\d]/g, ''), 10);
    if (Number.isNaN(n) || n < 0) {
      problems.push(`Invalid reviews: ${reviews}`);
    }
  }

  return problems;
}

/** Build the final contact insert payload from a mapped row. */
export function buildContactRow(
  row: Record<string, string>,
  mapping: ColumnMapping[]
): {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  country?: string;
  location?: string;
  category?: string;
  address?: string;
  website?: string;
  rating?: number;
  review_count?: number;
  lead_status?: string;
  created_at?: string;
  tagNames: string[];
  custom: Record<string, string>;
} {
  const get = (field: ContactColumnKey): string => {
    for (const m of mapping) if (m.target === field) return (row[m.header] ?? '').trim();
    return '';
  };

  const ratingRaw = get('rating');
  const reviewsRaw = get('reviews');
  const createdAtRaw = get('created_at');

  const custom: Record<string, string> = {};
  for (const m of mapping) {
    if (m.target === 'custom' && m.customFieldKey) {
      const v = (row[m.header] ?? '').trim();
      if (v) custom[m.customFieldKey] = v;
    }
  }

  return {
    phone: get('phone'),
    name: get('name') || undefined,
    email: get('email') || undefined,
    company: get('company') || undefined,
    country: get('country') || undefined,
    location: get('location') || undefined,
    category: get('category') || undefined,
    address: get('address') || undefined,
    website: get('website') || undefined,
    rating: ratingRaw ? Number(ratingRaw.replace(',', '.')) : undefined,
    review_count: reviewsRaw
      ? parseInt(reviewsRaw.replace(/[^\d]/g, ''), 10)
      : undefined,
    lead_status: get('lead_status') || undefined,
    created_at: createdAtRaw || undefined,
    tagNames: parseTagCell(get('tags')),
    custom,
  };
}

export function parseCreatedDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
