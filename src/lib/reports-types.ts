/**
 * CRM 3.0 — Reports: shared types
 *
 * Pure type definitions shared by the reports API route (server) and the
 * Reports page (client). No runtime imports, no secrets — safe on both sides.
 */

export type ReportId =
  | 'overview'
  | 'contacts'
  | 'sales'
  | 'campaigns'
  | 'broadcasts'
  | 'conversations'
  | 'automations'
  | 'conversion'
  | 'agents';

export const REPORT_IDS: ReportId[] = [
  'overview', 'contacts', 'sales', 'campaigns', 'broadcasts', 'conversations', 'automations', 'conversion', 'agents',
];

export type ValueKind = 'number' | 'currency' | 'percent' | 'duration' | 'text';

export interface ReportKpi {
  key: string;
  label: string;
  value: number | string;
  kind: ValueKind;
  hint?: string;
  /** semantic colour key the UI maps to a palette */
  tone?: 'blue' | 'violet' | 'green' | 'amber' | 'red' | 'cyan' | 'slate';
  /** previous-period value (present only when comparison is enabled) */
  prevValue?: number;
  /** % change vs the previous equal-length period; null when there is no baseline */
  deltaPct?: number | null;
}

export interface ReportSeries {
  key: string;
  label: string;
  color: string;
}

export type ChartType = 'area' | 'bar' | 'stackedBar' | 'line' | 'pie';

export interface ReportChart {
  key: string;
  title: string;
  type: ChartType;
  xKey: string;
  series: ReportSeries[];
  data: Record<string, unknown>[];
  height?: number;
  /** render the x-axis vertically (horizontal bars) — good for ranked/category lists */
  orientation?: 'horizontal';
}

export type ColumnType = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'badge' | 'score';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
  align?: 'left' | 'right' | 'center';
}

export interface ReportTable {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  sort: string | null;
  order: 'asc' | 'desc';
}

export interface ReportRange {
  from: string | null;
  to: string | null;
  preset: string | null;
  days: number;
  granularity: 'day' | 'month';
}

export interface ReportFilterOption { value: string; label: string }

export interface ReportResponse {
  report: ReportId;
  range: ReportRange;
  generated_at: string;
  kpis: ReportKpi[];
  charts: ReportChart[];
  table: ReportTable | null;
  notes: string[];
  /** rule-based business insights computed from real records (never invented) */
  insights?: string[];
  /** module route to open when a table row is drilled into */
  drilldown?: string;
  /** true when the current user lacks permission for this report */
  restricted?: boolean;
  /** previous comparison window (present only when comparison is enabled) */
  prev_range?: { from: string; to: string } | null;
  /** selectable filter values for this report (real records only) */
  filter_options?: {
    source?: ReportFilterOption[];
    stage?: ReportFilterOption[];
    campaign?: ReportFilterOption[];
    agent?: ReportFilterOption[];
    trigger?: ReportFilterOption[];
  } | null;
  meta: {
    currency: string;
    account_name?: string;
    row_count?: number;
    [k: string]: unknown;
  };
}

/**
 * Structural payload accepted by the shared export utilities. Both the Reports
 * response and the Revenue Intelligence response satisfy this shape, so the
 * same CSV / Excel / PDF exporters can be reused without casts.
 */
export interface ExportableReport {
  report: string;
  range: ReportRange;
  generated_at: string;
  kpis: ReportKpi[];
  table: ReportTable | null;
  notes: string[];
  meta: { currency: string; account_name?: string; [k: string]: unknown };
}

// ── Date-range presets ────────────────────────────────────────
export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: '90d', label: 'Last 90 Days' },
  { id: 'custom', label: 'Custom Range' },
];
