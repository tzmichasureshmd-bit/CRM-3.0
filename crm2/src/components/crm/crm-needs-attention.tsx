"use client";

import { useTranslations } from "next-intl";
import type { PipelineStage } from "@/types";
import { AlarmClock, Clock, UserX, MessageCircle } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { stageProgress, initials, shortDate } from "@/lib/crm/leads";
import type { AttentionItem } from "@/lib/crm/leads";

interface CrmNeedsAttentionProps {
  items: AttentionItem[];
  sortedStages: PipelineStage[];
  defaultCurrency: string;
  onOpenLead: (deal: AttentionItem["deal"]) => void;
  onWhatsApp: (deal: AttentionItem["deal"]) => void;
  onOpenList?: () => void;
}

const KIND_ICON = {
  overdue_follow_up: AlarmClock,
  silent: UserX,
  no_activity: Clock,
};

export function CrmNeedsAttention({
  items,
  sortedStages,
  defaultCurrency,
  onOpenLead,
  onWhatsApp,
  onOpenList,
}: CrmNeedsAttentionProps) {
  const t = useTranslations("Crm.attention");
  const stageById = new Map(sortedStages.map((s) => [s.id, s]));
  const maxItems = 6;
  const visible = items.slice(0, maxItems);

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/15 text-orange-400">
            <AlarmClock className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {items.length}
          </span>
        </div>
        {onOpenList && items.length > maxItems && (
          <button
            type="button"
            onClick={onOpenList}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t("viewAll")}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-center text-sm text-muted-foreground">
          <span className="mx-auto">{t("empty")}</span>
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const deal = item.deal;
            const stage = stageById.get(deal.stage_id) ?? null;
            const progress = stage ? stageProgress(stage, sortedStages) : 0;
            const contact = deal.contact;
            const reason =
              item.kind === "overdue_follow_up"
                ? t("overdueFollowUp")
                : item.kind === "silent"
                  ? t("daysSilent", { days: item.days })
                  : t("noActivity");
            const dueLabel =
              item.followUp?.due_date
                ? shortDate(item.followUp.due_date)
                : null;
            return (
              <div
                key={deal.id}
                className="group rounded-lg border border-border/60 bg-muted/40 p-3 transition-colors hover:border-border hover:bg-muted"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenLead(deal)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contact?.name || contact?.phone || "—"}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="WhatsApp"
                      onClick={() => onWhatsApp(deal)}
                      className="rounded-md border border-border/60 bg-background/60 p-1 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </button>
                    {stage && (
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${stage.color}20`,
                          color: stage.color,
                        }}
                        title={stage.name}
                      >
                        {initials(stage.name)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      item.kind === "overdue_follow_up"
                        ? "text-red-400"
                        : item.kind === "silent"
                          ? "text-amber-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {reason}
                    {dueLabel && <span className="text-muted-foreground">· {dueLabel}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatCurrency(
                      Number(deal.value || 0),
                      deal.currency || defaultCurrency,
                    )}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: stage?.color ?? "var(--primary)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {progress}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}