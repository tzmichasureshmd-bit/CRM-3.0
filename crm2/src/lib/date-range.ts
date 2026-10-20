export type PresetKey =
  | "today"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "custom";

/** Inclusive calendar range as local `YYYY-MM-DD` strings. */
export interface DateRange {
  from: string;
  to: string;
}

export const PRESET_KEYS: PresetKey[] = [
  "today",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "custom",
];

export const PRESET_LABELS: Record<PresetKey, string> = {
  today: "Today",
  last7: "Last 7 days",
  last30: "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  custom: "Custom",
};

/** Local `YYYY-MM-DD` key for a date (no timezone shift). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Midnight of the given date, in the browser's local timezone. */
export function startOfLocalDay(d: Date = new Date()): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Parses a `YYYY-MM-DD` string as a local calendar date. */
export function parseLocalDate(value: string): Date | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Exclusive end bound (start of the day *after* the inclusive `to`). */
export function endExclusiveISO(range: DateRange): string | null {
  const to = parseLocalDate(range.to);
  if (!to) return null;
  to.setDate(to.getDate() + 1);
  return to.toISOString();
}

export function startISO(range: DateRange): string | null {
  const from = parseLocalDate(range.from);
  return from ? from.toISOString() : null;
}

function shiftDays(value: string, days: number): string {
  const date = parseLocalDate(value) ?? startOfLocalDay();
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Resolves a preset into an inclusive local date range. */
export function resolvePreset(preset: PresetKey): DateRange {
  const today = toISODate(startOfLocalDay());
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: shiftDays(today, -6), to: today };
    case "last30":
      return { from: shiftDays(today, -29), to: today };
    case "thisMonth": {
      const d = startOfLocalDay();
      return { from: toISODate(d), to: today };
    }
    case "lastMonth": {
      const now = startOfLocalDay();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toISODate(first), to: toISODate(last) };
    }
    case "custom":
      return { from: shiftDays(today, -29), to: today };
  }
}

/** Returns the preset matching `range`, or `custom` when it was hand-picked. */
export function presetOf(range: DateRange): PresetKey {
  for (const key of PRESET_KEYS) {
    if (key === "custom") continue;
    const candidate = resolvePreset(key);
    if (candidate.from === range.from && candidate.to === range.to) return key;
  }
  return "custom";
}

/** Number of calendar days covered by the range (inclusive). */
export function rangeDays(range: DateRange): number {
  const from = parseLocalDate(range.from);
  const to = parseLocalDate(range.to);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/**
 * The immediately preceding window of the same length: for
 * `2026-04-10 … 2026-04-16` it returns `2026-04-03 … 2026-04-09`.
 */
export function previousPeriod(range: DateRange): DateRange {
  const days = Math.max(1, rangeDays(range));
  const from = range.from;
  return { from: shiftDays(from, -days), to: shiftDays(from, -1) };
}

/**
 * Percentage change from `previous` to `current`. Returns `null` when the
 * previous value is zero — the growth rate is undefined, and callers show
 * a "new"/"—" marker instead of inventing a number.
 */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Human label for a range, e.g. `Apr 10 – Apr 16, 2026`. */
export function formatRangeLabel(range: DateRange): string {
  const from = parseLocalDate(range.from);
  const to = parseLocalDate(range.to);
  if (!from || !to) return "";
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameDay = range.from === range.to;
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  };
  if (sameDay) {
    return from.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const fromLabel = from.toLocaleDateString(undefined, {
    ...opts,
    ...(sameYear ? { year: "numeric" } : {}),
  });
  const toLabel = to.toLocaleDateString(undefined, opts);
  return `${fromLabel} – ${toLabel}`;
}

export interface RangeState {
  range: DateRange;
  preset: PresetKey;
  compare: boolean;
}

/**
 * Reads `?from=&to=&compare=` from the URL. Returns `null` when nothing is
 * present so callers can fall back to their own default range.
 */
export function rangeFromSearchParams(params: URLSearchParams): RangeState | null {
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return null;
  if (!parseLocalDate(from) || !parseLocalDate(to)) return null;
  const range = from <= to ? { from, to } : { from: to, to: from };
  return {
    range,
    preset: presetOf(range),
    compare: params.get("compare") === "1",
  };
}

/** Serialises the state to a query string, omitting defaults. */
export function rangeToSearchParams(state: RangeState): string {
  const params = new URLSearchParams();
  params.set("from", state.range.from);
  params.set("to", state.range.to);
  if (state.compare) params.set("compare", "1");
  return params.toString();
}
