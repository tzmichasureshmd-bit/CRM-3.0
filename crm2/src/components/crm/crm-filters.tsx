"use client";

import { useTranslations } from "next-intl";
import type { PipelineStage, Tag } from "@/types";
import { Search, FilterX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CrmFilterState {
  search: string;
  stageId: string;
  agentId: string;
  status: string;
  source: string;
  tagId: string;
  minScore: number;
}

export const DEFAULT_FILTERS: CrmFilterState = {
  search: "",
  stageId: "",
  agentId: "",
  status: "",
  source: "",
  tagId: "",
  minScore: 0,
};

export interface QuickFilter {
  id: string;
  labelKey: string;
}

export const QUICK_FILTERS: QuickFilter[] = [
  { id: "all", labelKey: "quickAll" },
  { id: "new", labelKey: "quickNew" },
  { id: "qualified", labelKey: "quickQualified" },
  { id: "follow_up", labelKey: "quickFollowUp" },
  { id: "won", labelKey: "quickWon" },
  { id: "lost", labelKey: "quickLost" },
];

interface CrmFiltersProps {
  dealsCount: number;
  resultCount: number;
  stages: PipelineStage[];
  agents: Array<{ id: string; name: string }>;
  sources: string[];
  allTags: Tag[];
  quickFilters: QuickFilter[];
  activeQuick: string;
  filters: CrmFilterState;
  onChange: (filters: CrmFilterState) => void;
  onQuickChange: (id: string) => void;
  onClear: () => void;
}

function hasActiveFilters(f: CrmFilterState): boolean {
  return (
    !!f.search.trim() ||
    !!f.stageId ||
    !!f.agentId ||
    !!f.status ||
    !!f.source ||
    !!f.tagId ||
    f.minScore > 0
  );
}

export function CrmFilters({
  dealsCount,
  resultCount,
  stages,
  agents,
  sources,
  allTags,
  quickFilters,
  activeQuick,
  filters,
  onChange,
  onQuickChange,
  onClear,
}: CrmFiltersProps) {
  const t = useTranslations("Crm.filters");
  const active = hasActiveFilters(filters);

  return (
    <div className="space-y-2.5">
      {/* Quick filters (segment) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {quickFilters.map((qf) => (
          <button
            key={qf.id}
            type="button"
            onClick={() => onQuickChange(qf.id)}
            aria-pressed={activeQuick === qf.id}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeQuick === qf.id
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t(qf.labelKey)}
          </button>
        ))}
        <span className="ml-auto hidden px-1 text-xs text-muted-foreground sm:inline">
          {t("showing", { count: resultCount, total: dealsCount })}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder={t("searchPlaceholder")}
            className="border-border bg-muted pl-8 text-sm text-foreground"
          />
        </div>

        <Select
          value={filters.stageId}
          onValueChange={(v) => onChange({ ...filters, stageId: v ?? "" })}
        >
          <SelectTrigger className="h-9 w-auto min-w-[130px] border-border bg-muted text-sm text-foreground">
            <SelectValue placeholder={t("allStages")} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-popover-foreground">
            <SelectItem value="">{t("allStages")}</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.agentId}
          onValueChange={(v) => onChange({ ...filters, agentId: v ?? "" })}
        >
          <SelectTrigger className="h-9 w-auto min-w-[120px] border-border bg-muted text-sm text-foreground">
            <SelectValue placeholder={t("allAgents")} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-popover-foreground">
            <SelectItem value="">{t("allAgents")}</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(v) => onChange({ ...filters, status: v ?? "" })}
        >
          <SelectTrigger className="h-9 w-auto min-w-[120px] border-border bg-muted text-sm text-foreground">
            <SelectValue placeholder={t("allStatuses")} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-popover-foreground">
            <SelectItem value="">{t("allStatuses")}</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="won">{t("wonBanner")}</SelectItem>
            <SelectItem value="lost">{t("lostBanner")}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.source}
          onValueChange={(v) => onChange({ ...filters, source: v ?? "" })}
        >
          <SelectTrigger className="h-9 w-auto min-w-[120px] border-border bg-muted text-sm text-foreground">
            <SelectValue placeholder={t("allSources")} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-popover-foreground">
            <SelectItem value="">{t("allSources")}</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.tagId}
          onValueChange={(v) => onChange({ ...filters, tagId: v ?? "" })}
        >
          <SelectTrigger className="h-9 w-auto min-w-[120px] border-border bg-muted text-sm text-foreground">
            <SelectValue placeholder={t("allTags")} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-popover-foreground">
            <SelectItem value="">{t("allTags")}</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(filters.minScore)}
          onValueChange={(v) =>
            onChange({ ...filters, minScore: Number(v) || 0 })
          }
        >
          <SelectTrigger className="h-9 w-auto min-w-[110px] border-border bg-muted text-sm text-foreground">
            <SelectValue placeholder="Score" />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-popover-foreground">
            <SelectItem value="0">Any score</SelectItem>
            <SelectItem value="40">40+ (warm)</SelectItem>
            <SelectItem value="70">70+ (hot)</SelectItem>
          </SelectContent>
        </Select>

        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-9 border border-border bg-card/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <FilterX className="mr-1 h-3.5 w-3.5" />
            {t("clear")}
          </Button>
        )}
      </div>
    </div>
  );
}