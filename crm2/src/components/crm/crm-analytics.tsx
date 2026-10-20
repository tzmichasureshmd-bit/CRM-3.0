"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Deal, PipelineStage } from "@/types";
import { formatCurrency } from "@/lib/currency";
import { stageProgress } from "@/lib/crm/leads";
import {
  DollarSign,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
  Layers3,
  ArrowDown,
} from "lucide-react";

interface CrmAnalyticsProps {
  stages: PipelineStage[];
  deals: Deal[];
  defaultCurrency: string;
}

export function CrmAnalytics({ stages, deals, defaultCurrency }: CrmAnalyticsProps) {
  const t = useTranslations("Crm.analytics");
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const { totals, funnel, chain: conversionChain } = useMemo(() => {
    // Funnel is anchored on the first active stage (excluding Lost),
    // i.e. every newly-entered deal counted once.
    const firstStage =
      sortedStages.find((s) => {
        const n = s.name.trim().toLowerCase();
        return !n.startsWith("lost") && !n.endsWith("lost");
      }) ?? sortedStages[0];

    const counts = new Map<string, number>();
    for (const stage of sortedStages) counts.set(stage.id, 0);
    for (const deal of deals) {
      const stage = sortedStages.find((s) => s.id === deal.stage_id);
      if (stage) counts.set(stage.id, (counts.get(stage.id) ?? 0) + 1);
    }

    const anchor = firstStage ? counts.get(firstStage.id) ?? 0 : 0;
    const funnel = sortedStages.map((stage) => ({
      stage,
      count: counts.get(stage.id) ?? 0,
      pct: anchor > 0 ? Math.round(((counts.get(stage.id) ?? 0) / anchor) * 100) : 0,
    }));

    const chain: Array<{ from: PipelineStage; to: PipelineStage; pct: number }> = [];
    for (let i = 1; i < sortedStages.length; i++) {
      const from = sortedStages[i - 1];
      const to = sortedStages[i];
      const c = counts.get(to.id) ?? 0;
      const prev = counts.get(from.id) ?? 0;
      chain.push({
        from,
        to,
        pct: prev > 0 ? Math.round((c / prev) * 100) : 0,
      });
    }

    const totalValue = deals.reduce((s, d) => s + Number(d.value || 0), 0);
    const openValue = deals
      .filter((d) => d.status === "open")
      .reduce((s, d) => s + Number(d.value || 0), 0);
    const wonValue = deals
      .filter((d) => d.status === "won")
      .reduce((s, d) => s + Number(d.value || 0), 0);
    const activeCount = deals.filter((d) => d.status !== "lost").length;
    const wonCount = deals.filter((d) => d.status === "won").length;
    const lostCount = deals.filter((d) => d.status === "lost").length;
    const openTotal = deals.filter((d) => d.status === "open").reduce(
      (s, d) => s + Number(d.value || 0) * (stageProgressClosest(d.stage_id, sortedStages) / 100),
      0,
    );

    return {
      totals: {
        totalValue,
        openValue,
        wonValue,
        activeCount,
        wonCount,
        lostCount,
        avgValue: activeCount > 0 ? totalValue / activeCount : 0,
        weighted: openTotal,
        conversionRate:
          activeCount > 0 ? Math.round((wonCount / activeCount) * 100) : 0,
      },
      funnel,
      chain,
    };
  }, [deals, sortedStages]);

  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
        <Layers3 className="h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{t("noData")}</p>
      </div>
    );
  }

  const maxFunnelCount = Math.max(
    1,
    ...funnel.map((f) => f.count),
  );

  return (
    <div className="space-y-4">
      {/* Metric strip */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-3 xl:grid-cols-6">
        <MetricRow
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label={t("converted")}
          sub="convertedDesc"
          value={formatCurrency(totals.wonValue, defaultCurrency)}
        />
        <MetricRow
          icon={<TrendingUp className="h-4 w-4 text-blue-400" />}
          label={t("conversion")}
          sub="conversionDesc"
          value={`${totals.conversionRate}%`}
        />
        <MetricRow
          icon={<Trophy className="h-4 w-4 text-primary" />}
          label="Won Deals"
          value={String(totals.wonCount)}
        />
        <MetricRow
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          label="Lost Deals"
          value={String(totals.lostCount)}
        />
        <MetricRow
          icon={<Target className="h-4 w-4 text-purple-400" />}
          label="Weighted"
          value={formatCurrency(totals.weighted, defaultCurrency)}
        />
        <MetricRow
          icon={<DollarSign className="h-4 w-4 text-sky-400" />}
          label="Avg. Deal"
          value={formatCurrency(totals.avgValue, defaultCurrency)}
        />
      </div>

      {/* Funnel */}
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            {t("funnel")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("funnelDesc")}</p>
        </div>
        <div className="space-y-2">
          {funnel.map((row) => {
            const isLost = row.stage.name.trim().toLowerCase().startsWith("lost");
            const isWon = /^won|won$/.test(row.stage.name.trim().toLowerCase());
            return (
              <div key={row.stage.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs font-medium text-muted-foreground">
                  {row.stage.name}
                </span>
                <div className="h-7 flex-1 overflow-hidden rounded-md bg-muted/50">
                  <div
                    className="flex h-full items-center justify-end rounded-md px-2 transition-all"
                    style={{
                      width: `${Math.max((row.count / maxFunnelCount) * 100, row.count > 0 ? 6 : 0)}%`,
                      backgroundColor: row.stage.color,
                      opacity: isLost ? 0.75 : 0.9,
                    }}
                  >
                    {row.count > 0 && (
                      <span className="text-[10px] font-semibold text-white/95">
                        {row.count}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`w-16 shrink-0 text-right text-xs tabular-nums ${
                    isLost ? "text-red-400" : isWon ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {t("stagePercent", { value: row.pct })}
                </span>
              </div>
            );
          })}
        </div>

        {conversionChain.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-y-2 border-t border-border/50 pt-3">
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              {t("conversion")}
            </span>
            {conversionChain.map((c) => (
              <span
                key={`${c.from.id}-${c.to.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px]"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: c.from.color }}
                />
                <span className="truncate text-muted-foreground">{c.from.name}</span>
                <ArrowDown className="h-3 w-3 rotate-[-90deg] text-muted-foreground" />
                <span className="font-semibold text-foreground">{c.pct}%</span>
                <span className="truncate text-muted-foreground">{c.to.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function stageProgressClosest(
  stageId: string,
  sortedStages: PipelineStage[],
): number {
  const stage = sortedStages.find((s) => s.id === stageId);
  return stage ? stageProgress(stage, sortedStages) : 0;
}

function MetricRow({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  const t = useTranslations("Crm.analytics");
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground/70">{t(sub)}</p>}
    </div>
  );
}