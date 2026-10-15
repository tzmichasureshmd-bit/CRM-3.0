/**
 * CRM 3.0 — Revenue Intelligence: shared types
 *
 * Pure type definitions shared by the revenue-intelligence API route (server)
 * and the Revenue Intelligence page (client). Reuses the generic report
 * primitives so the same charts / tables / exporters can be reused.
 */

import type {
  ReportChart, ReportKpi, ReportRange, ReportTable,
} from '@/lib/reports-types';

export type RevenueTab =
  | 'overview'
  | 'trends'
  | 'pipeline'
  | 'forecast'
  | 'winloss'
  | 'breakdowns'
  | 'deals';

export const REVENUE_TABS: RevenueTab[] = [
  'overview', 'trends', 'pipeline', 'forecast', 'winloss', 'breakdowns', 'deals',
];

/** Revenue trend granularity. */
export type RevenueGranularity = 'month' | 'quarter';

export interface RevenueResponse {
  report: RevenueTab;
  range: ReportRange;
  generated_at: string;
  kpis: ReportKpi[];
  charts: ReportChart[];
  table: ReportTable | null;
  notes: string[];
  /** Transparent, rule-based insights derived from the real numbers. */
  insights: string[];
  /** module route to open when a table row is drilled into */
  drilldown?: string;
  meta: {
    currency: string;
    account_name?: string;
    row_count?: number;
    [k: string]: unknown;
  };
}
