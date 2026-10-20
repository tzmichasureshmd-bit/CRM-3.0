"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/currency";
import {
  endExclusiveISO,
  previousPeriod,
  rangeFromSearchParams,
  resolvePreset,
  startISO,
  type RangeState,
} from "@/lib/date-range";
import {
  DateRangeSelect,
  DeltaBadge,
} from "@/components/reports/date-range-select";
import {
  Loader2,
  FileSpreadsheet,
  FileText,
  Users,
  MessageSquare,
  Megaphone,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import jsPDF from "jspdf";

type ReportType = "leads" | "customers" | "conversations" | "sales" | "employees" | "agent-performance" | "daily" | "monthly";

const REPORT_TYPES: { value: ReportType; label: string; icon: typeof Users }[] = [
  { value: "leads", label: "Leads", icon: Users },
  { value: "customers", label: "Customers", icon: Users },
  { value: "conversations", label: "WhatsApp Conversations", icon: MessageSquare },
  { value: "sales", label: "Sales", icon: TrendingUp },
  { value: "agent-performance", label: "Agent Performance", icon: Users },
  { value: "employees", label: "Employee Directory", icon: Users },
  { value: "daily", label: "Daily Summary", icon: BarChart3 },
  { value: "monthly", label: "Monthly Summary", icon: BarChart3 },
];

interface ReportMetric {
  key: string;
  label: string;
  value: number;
}

interface RangeCounts {
  contacts: number;
  conversations: number;
  deals: number;
  broadcasts: number;
}

interface ComparisonPayload {
  period: { from: string | null; to: string | null };
  metrics: ReportMetric[];
}

// `useSearchParams` needs a Suspense boundary in the production build.
export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsPageInner />
    </Suspense>
  );
}

function ReportsPageInner() {
  const t = useTranslations("Reports.page");
  const { accountId, defaultCurrency } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rangeState, setRangeState] = useState<RangeState>(
    () =>
      rangeFromSearchParams(new URLSearchParams(searchParams.toString())) ?? {
        range: resolvePreset("last30"),
        preset: "last30",
        compare: false,
      },
  );
  const [reportType, setReportType] = useState<ReportType>(
    (searchParams.get("type") as ReportType) || "daily",
  );
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [metrics, setMetrics] = useState<ReportMetric[]>([]);
  const [comparison, setComparison] = useState<ComparisonPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState<RangeCounts | null>(null);
  const [summaryPrevious, setSummaryPrevious] = useState<RangeCounts | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const { range, compare } = rangeState;

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("type", reportType);
    params.set("from", range.from);
    params.set("to", range.to);
    if (compare) params.set("compare", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }, [reportType, range, compare, pathname, router]);

  const loadCounts = useCallback(
    async (db: ReturnType<typeof createClient>, bounds: RangeState["range"]): Promise<RangeCounts> => {
      const start = startISO(bounds);
      const end = endExclusiveISO(bounds);
      const inRange = (table: string) => {
        let query = db
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId as string);
        if (start) query = query.gte("created_at", start);
        if (end) query = query.lt("created_at", end);
        return query;
      };
      const [contacts, conversations, deals, broadcasts] = await Promise.all([
        inRange("contacts"),
        inRange("conversations"),
        inRange("deals"),
        inRange("broadcasts"),
      ]);
      return {
        contacts: contacts.count ?? 0,
        conversations: conversations.count ?? 0,
        deals: deals.count ?? 0,
        broadcasts: broadcasts.count ?? 0,
      };
    },
    [accountId],
  );

  useEffect(() => {
    if (!accountId) return;
    const db = createClient();
    let cancelled = false;
    setSummaryLoading(true);
    void (async () => {
      try {
        const current = await loadCounts(db, range);
        const previous = compare ? await loadCounts(db, previousPeriod(range)) : null;
        if (cancelled) return;
        setSummary(current);
        setSummaryPrevious(previous);
      } catch {
        if (!cancelled) {
          setSummary(null);
          setSummaryPrevious(null);
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, range, compare, loadCounts]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: reportType });
      params.set("from", range.from);
      params.set("to", range.to);
      if (compare) params.set("compare", "1");

      const res = await fetch(`/api/reports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? []);
        setCount(data.count ?? 0);
        setMetrics(data.metrics ?? []);
        setComparison(compare ? (data.comparison ?? null) : null);
      }
    } catch {
      setRows([]);
      setCount(0);
      setMetrics([]);
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, [reportType, range, compare]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const exportExcel = async () => {
    if (rows.length === 0) return;
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(sanitizeReportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `report-${reportType}-${Date.now()}.xlsx`);
  };

  // Build report rows with phone numbers removed, so exported data never
  // exposes customer mobile numbers. The button stays; the sensitive
  // column is stripped. Heuristically drops columns whose header contains
  // "phone"/"mobile", and masks a bare phone used as a fallback contact
  // name in the "Contact" column.
  const sanitizeReportRows = () => {
    const PII_HEADER = /phone|mobile/i;
    const PHONE_RE = /\b(\+?\d[\d\s.\-()]{6,})\b/g;
    return rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (PII_HEADER.test(key)) continue;
        if (typeof value === "string" && /phone|mobile|contact/i.test(key)) {
          // For "Contact", a bare phone (fallback when name unknown)
          // should not leak — mask it.
          out[key] = value.replace(PHONE_RE, "[hidden]");
        } else {
          out[key] = value;
        }
      }
      return out;
    });
  };

  const exportPDF = () => {
    if (rows.length === 0) return;
    const safe = sanitizeReportRows();
    const doc = new jsPDF();
    const headers = safe[0] ? Object.keys(safe[0]) : [];
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    const colWidth = (pageWidth - margin * 2) / headers.length;

    doc.setFontSize(14);
    doc.text(`Report: ${reportType}`, margin, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 22);

    let y = 30;
    doc.setFontSize(8);
    headers.forEach((h, i) => {
      doc.setFont("helvetica", "bold");
      doc.text(h, margin + i * colWidth, y);
    });
    y += 5;

    safe.forEach((row) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      headers.forEach((h, i) => {
        const val = String(row[h] ?? "");
        doc.setFont("helvetica", "normal");
        doc.text(val, margin + i * colWidth, y);
      });
      y += 5;
    });

    doc.save(`report-${reportType}-${Date.now()}.pdf`);
  };

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  const formatMetricValue = (metric: ReportMetric) =>
    metric.key === "dealValue"
      ? formatCurrency(metric.value, defaultCurrency)
      : metric.value.toLocaleString();

  const summaryCards: {
    icon: typeof Users;
    label: string;
    value: number | null;
    previous: number | null;
  }[] = [
    { icon: Users, label: "New Contacts", value: summary?.contacts ?? null, previous: summaryPrevious?.contacts ?? null },
    { icon: MessageSquare, label: "New Conversations", value: summary?.conversations ?? null, previous: summaryPrevious?.conversations ?? null },
    { icon: TrendingUp, label: "New Deals", value: summary?.deals ?? null, previous: summaryPrevious?.deals ?? null },
    { icon: Megaphone, label: "New Broadcasts", value: summary?.broadcasts ?? null, previous: summaryPrevious?.broadcasts ?? null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <SummaryStatCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              loading={summaryLoading}
              compare={compare}
              previous={card.previous}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Counts are scoped to the selected range and filtered on the server.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t("filters")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>{t("reportType")}</Label>
              <Select value={reportType} onValueChange={(v) => { if (v) setReportType(v as ReportType); }}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((rt) => (
                    <SelectItem key={rt.value} value={rt.value}>
                      {rt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => void fetchReport()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("generate")}
            </Button>

            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => void exportExcel()} disabled={rows.length === 0}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Excel
              </Button>
              <Button variant="outline" onClick={exportPDF} disabled={rows.length === 0}>
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>

          <DateRangeSelect
            value={rangeState}
            onChange={setRangeState}
            className="border-t border-border pt-4"
          />
        </CardContent>
      </Card>

      {metrics.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {compare ? "Period comparison" : "Totals for the selected range"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {compare && comparison ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Metric</TableHead>
                      <TableHead className="text-xs">Selected period</TableHead>
                      <TableHead className="text-xs">Previous period</TableHead>
                      <TableHead className="text-xs">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.map((metric) => {
                      const prev = comparison.metrics.find((m) => m.key === metric.key);
                      return (
                        <TableRow key={metric.key}>
                          <TableCell className="text-xs font-medium">{metric.label}</TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {formatMetricValue(metric)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-muted-foreground">
                            {prev ? formatMetricValue(prev) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {prev ? (
                              <DeltaBadge current={metric.value} previous={prev.value} />
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {metrics.map((metric) => (
                  <div
                    key={metric.key}
                    className="rounded-xl border border-border bg-muted/30 px-4 py-3"
                  >
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {formatMetricValue(metric)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {t("results", { count })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Generating report...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BarChart3 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">{t("noData")}</p>
              <p className="text-xs text-muted-foreground">{t("noDataHint")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col} className="text-xs">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      {columns.map((col) => (
                        <TableCell key={col} className="text-xs">
                          {String(row[col] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStatCard({
  icon: Icon,
  label,
  value,
  loading,
  compare,
  previous,
}: {
  icon: typeof Users;
  label: string;
  value: number | null;
  loading: boolean;
  compare?: boolean;
  previous?: number | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <div className="mt-1 h-5 w-12 animate-pulse rounded bg-muted" />
        ) : (
          <p className="text-lg font-bold tabular-nums text-foreground">
            {(value ?? 0).toLocaleString()}
          </p>
        )}
        {!loading && compare && previous !== null && previous !== undefined && value !== null ? (
          <DeltaBadge current={value} previous={previous} label="vs previous" />
        ) : null}
      </div>
    </div>
  );
}
