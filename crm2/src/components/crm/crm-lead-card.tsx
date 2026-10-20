"use client";

import type { Deal, FollowUp, PipelineStage, Tag } from "@/types";
import { Check, X, MessageCircle, MoreHorizontal, AlarmClock } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useTranslations } from "next-intl";
import {
  stageProgress,
  relativeTime,
  shortDate,
  initials,
  sourceBadgeInfo,
  scoreTone,
  isPast,
} from "@/lib/crm/leads";

interface CrmLeadCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  sortedStages: PipelineStage[];
  contactTags?: Tag[];
  followUp?: FollowUp | null;
  defaultCurrency?: string;
  onOpen: (deal: Deal) => void;
  onWhatsApp: (deal: Deal) => void;
  onMenu?: (deal: Deal) => void;
  isOverlay?: boolean;
}

export function CrmLeadCard({
  deal,
  stage,
  sortedStages,
  contactTags = [],
  followUp,
  defaultCurrency = "USD",
  onOpen,
  onWhatsApp,
  onMenu,
  isOverlay,
}: CrmLeadCardProps) {
  const t = useTranslations("Crm");
  const contact = deal.contact;
  const progress = stage ? stageProgress(stage, sortedStages) : 0;

  const contactLabel = contact?.name || contact?.phone || t("card.noPhone");
  const value = formatCurrency(Number(deal.value || 0), deal.currency || defaultCurrency);
  const source = sourceBadgeInfo(contact?.source, contact?.source_platform);
  const score = scoreTone(contact?.lead_score);

  const followUpOverdue = !!followUp && isPast(followUp.due_date);

  const lastActivity =
    contact?.last_customer_reply_at || contact?.last_contacted_at || null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (isOverlay) return;
        e.stopPropagation();
        onOpen(deal);
      }}
      onKeyDown={(e) => {
        if (isOverlay) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onOpen(deal);
        }
      }}
      className={`group relative w-full cursor-pointer rounded-xl border border-border/50 bg-muted/70 pl-4 pr-3 py-3 text-left shadow-sm transition-all ${
        isOverlay
          ? "shadow-xl"
          : "hover:-translate-y-0.5 hover:border-border hover:bg-muted hover:shadow-lg"
      }`}
    >
      {/* 4px left accent bar using stage color */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
      />

      {/* Header: title + status badge + menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold leading-snug text-foreground break-words">
            {deal.title}
          </h4>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {source && (
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize ${source.className}`}
              >
                {source.label}
              </span>
            )}
            {contact?.lead_score != null && (
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${score.className}`}
                title={`Lead score: ${contact.lead_score}/100`}
              >
                {score.label} {contact.lead_score}
              </span>
            )}
            {contactTags.length > 0 && (
              <span className="flex items-center gap-1">
                {contactTags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
                {contactTags.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{contactTags.length - 2}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {deal.status === "won" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Check className="h-3 w-3" />
              {t("wonBanner")}
            </span>
          )}
          {deal.status === "lost" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
              <X className="h-3 w-3" />
              {t("lostBanner")}
            </span>
          )}
          {onMenu && (
            <button
              type="button"
              aria-label="Lead actions"
              onClick={(e) => {
                e.stopPropagation();
                onMenu(deal);
              }}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Contact row */}
      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
          {initials(contact?.name, contact?.phone)}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {contactLabel}
        </span>
      </div>

      {/* Progress */}
      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{stage?.name ?? "—"}</span>
          <span className="font-semibold text-foreground">{progress}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              backgroundColor: stage?.color ?? "var(--primary)",
            }}
          />
        </div>
      </div>

      {/* Value + expected close / follow-up */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-primary">{value}</span>
        {followUp ? (
          <span
            className={`flex items-center gap-1 text-[11px] ${
              followUpOverdue ? "text-red-400" : "text-muted-foreground"
            }`}
            title={followUp.title}
          >
            <AlarmClock className="h-3 w-3" />
            {followUpOverdue ? t("card.overdue") : t("card.nextFollowUp")}{" "}
            {shortDate(followUp.due_date)}
          </span>
        ) : (
          deal.expected_close_date && (
            <span className="text-[11px] text-muted-foreground">
              {shortDate(deal.expected_close_date)}
            </span>
          )
        )}
      </div>

      {/* Footer: last activity + WhatsApp + assignee */}
      <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>{t("card.lastActivity")}:</span>
          {lastActivity ? (
            relativeTime(lastActivity)
          ) : (
            <span className="text-red-400/80">{t("attention.noActivity")}</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={t("card.openWhatsApp")}
            title={t("card.openWhatsApp")}
            onClick={(e) => {
              e.stopPropagation();
              onWhatsApp(deal);
            }}
            className="rounded-md border border-border/60 bg-background/60 p-1 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
          {deal.assignee?.full_name && (
            <span
              title={`${t("card.assignedTo")}: ${deal.assignee.full_name}`}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
            >
              {initials(deal.assignee.full_name)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}