"use client";

import type { Deal, PipelineStage } from "@/types";
import { AlertTriangle, ArrowRight, Calendar, Check, Loader2, RefreshCw, X } from "lucide-react";
import { formatINR } from "@/lib/currency";
import { useTranslations } from "next-intl";
import { LeadStatusBadge } from "@/components/crm/lead-status-badge";
import { stageMilestone, leadStatusForMilestone } from "@/lib/crm/leads";
import { leadStatusLabel, parseLeadStatus, type LeadStatus } from "@/lib/crm/lead-status";

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  /**
   * Pushes the stage's expected lead status onto the deal's contact.
   * Only rendered when supplied, so overlay/legacy boards stay clean.
   */
  onSyncStatus?: (deal: Deal, status: LeadStatus) => void;
  /** True while this deal's contact status write is in flight. */
  syncing?: boolean;
  isOverlay?: boolean;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function initials(name?: string, fallback?: string) {
  const source = (name || fallback || "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

export function DealCard({
  deal,
  stage,
  onEdit,
  onSyncStatus,
  syncing = false,
  isOverlay,
}: DealCardProps) {
  const t = useTranslations("Pipelines.card");
  const contactLabel = deal.contact?.name || deal.contact?.phone || t("noContact");
  const assigneeLabel = deal.assignee?.full_name || null;

  const expectedStatus = stage
    ? leadStatusForMilestone(stageMilestone(stage))
    : null;
  const currentStatus = parseLeadStatus(deal.contact?.lead_status);
  const showSync =
    !isOverlay &&
    Boolean(onSyncStatus) &&
    Boolean(deal.contact) &&
    expectedStatus !== null &&
    currentStatus !== expectedStatus;

  return (
    <div
      className={`group relative w-full rounded-xl border border-border/50 bg-muted/70 shadow-sm transition-all ${
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

      <button
        type="button"
        onClick={(e) => {
          // `onClick` still fires after a non-drag tap because the PointerSensor
          // requires 5px movement before it counts as a drag.
          if (isOverlay) return;
          e.stopPropagation();
          onEdit(deal);
        }}
        className="block w-full cursor-pointer py-3 pl-4 pr-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="flex-1 text-sm font-semibold leading-snug text-foreground break-words">
            {deal.title}
          </h4>
          {deal.status === "won" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Check className="h-3 w-3" />
              {t("won")}
            </span>
          )}
          {deal.status === "lost" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
              <X className="h-3 w-3" />
              {t("lost")}
            </span>
          )}
        </div>

        {/* Contact row */}
        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
            {initials(deal.contact?.name, deal.contact?.phone)}
          </span>
          <span className="truncate text-xs text-muted-foreground">{contactLabel}</span>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-bold text-primary">
            {formatINR(deal.value)}
          </span>
          {deal.expected_close_date && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(deal.expected_close_date)}
            </span>
          )}
        </div>

        {assigneeLabel && (
          <div className="mt-2 flex items-center justify-end">
            <span
              title={assigneeLabel}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
            >
              {initials(assigneeLabel)}
            </span>
          </div>
        )}
      </button>

      {/* Contact/lead-status drift: the stage expects one status, the
          linked contact carries another (or none). Sits *beside* the card
          body button — never nested inside it. */}
      {showSync && expectedStatus && onSyncStatus && (
        <div className="space-y-1.5 border-t border-border/60 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
            <LeadStatusBadge status={currentStatus} />
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            <LeadStatusBadge status={expectedStatus} />
          </div>
          <button
            type="button"
            disabled={syncing}
            title={t("statusMismatch", {
              current: leadStatusLabel(currentStatus),
              expected: leadStatusLabel(expectedStatus),
            })}
            onClick={(e) => {
              e.stopPropagation();
              onSyncStatus(deal, expectedStatus);
            }}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {t("syncContactStatus")}
          </button>
        </div>
      )}
    </div>
  );
}
