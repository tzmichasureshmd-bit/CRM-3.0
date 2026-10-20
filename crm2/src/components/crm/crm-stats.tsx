"use client";

import { useTranslations } from "next-intl";
import {
  Users,
  Sparkles,
  Activity,
  Star,
  AlarmClock,
  Trophy,
  XCircle,
} from "lucide-react";

export type CrmStatKey =
  | "all"
  | "new"
  | "in_progress"
  | "qualified"
  | "follow_up"
  | "won"
  | "lost";

export interface CrmStats {
  total: number;
  new: number;
  inProgress: number;
  qualified: number;
  followUpRequired: number;
  converted: number;
  lost: number;
  conversionRate: number;
}

interface CrmStatsProps {
  stats: CrmStats;
  activeFilter: string;
  onSelect: (key: CrmStatKey) => void;
}

const CARDS: Array<{
  key: CrmStatKey;
  icon: typeof Users;
  labelKey: string;
  value: (s: CrmStats) => number;
  iconClass: string;
  showRate?: boolean;
}> = [
  { key: "all", icon: Users, labelKey: "totalLeads", value: (s) => s.total, iconClass: "text-primary" },
  { key: "new", icon: Sparkles, labelKey: "newLeads", value: (s) => s.new, iconClass: "text-blue-400" },
  { key: "in_progress", icon: Activity, labelKey: "inProgress", value: (s) => s.inProgress, iconClass: "text-sky-400" },
  { key: "qualified", icon: Star, labelKey: "qualified", value: (s) => s.qualified, iconClass: "text-amber-400" },
  { key: "follow_up", icon: AlarmClock, labelKey: "followUpRequired", value: (s) => s.followUpRequired, iconClass: "text-orange-400" },
  { key: "won", icon: Trophy, labelKey: "converted", value: (s) => s.converted, iconClass: "text-primary", showRate: true },
  { key: "lost", icon: XCircle, labelKey: "lost", value: (s) => s.lost, iconClass: "text-red-400" },
];

export function CrmStats({ stats, activeFilter, onSelect }: CrmStatsProps) {
  const t = useTranslations("Crm.stats");
  const max = Math.max(stats.total, 1);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
      {CARDS.map((card) => {
        const value = card.value(stats);
        const Icon = card.icon;
        const active = activeFilter === card.key;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect(card.key)}
            aria-pressed={active}
            className={`group relative overflow-hidden rounded-xl border p-3 text-left transition-all ${
              active
                ? "border-primary/60 bg-primary/5 shadow-sm"
                : "border-border bg-card/60 hover:border-border hover:bg-card"
            }`}
          >
            {/* subtle bar = share of total */}
            {card.key !== "all" && (
              <span
                aria-hidden
                className="absolute bottom-0 left-0 h-[2px] bg-current opacity-20"
                style={{ width: `${(value / max) * 100}%`, color: "inherit" }}
              />
            )}
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Icon className={`h-3.5 w-3.5 ${card.iconClass}`} />
              <span className="truncate">{t(card.labelKey)}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums text-foreground">
                {value}
              </span>
              {card.showRate && (
                <span className="text-[11px] font-medium text-muted-foreground">
                  {stats.conversionRate}%
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}