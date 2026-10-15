"use client";

import { useTranslations } from "next-intl";
import type { Deal, FollowUp, PipelineStage } from "@/types";
import { formatCurrency } from "@/lib/currency";
import {
  stageProgress,
  relativeTime,
  initials,
  sourceBadgeInfo,
  scoreTone,
  shortDate,
  isPast,
} from "@/lib/crm/leads";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { MessageCircle } from "lucide-react";

interface CrmLeadListProps {
  deals: Deal[];
  sortedStages: PipelineStage[];
  followUpsByContact: Record<string, FollowUp>;
  defaultCurrency: string;
  onOpenLead: (deal: Deal) => void;
  onWhatsApp: (deal: Deal) => void;
}

export function CrmLeadList({
  deals,
  sortedStages,
  followUpsByContact,
  defaultCurrency,
  onOpenLead,
  onWhatsApp,
}: CrmLeadListProps) {
  const t = useTranslations("Crm.list");
  const stageById = new Map(sortedStages.map((s) => [s.id, s]));

  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        {t("noLeads")}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead>{t("columnLead")}</TableHead>
            <TableHead>{t("columnStage")}</TableHead>
            <TableHead>{t("columnProgress")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("columnAgent")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("columnSource")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("columnScore")}</TableHead>
            <TableHead>{t("columnValue")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("columnLastActivity")}</TableHead>
            <TableHead className="hidden xl:table-cell">{t("columnNextFollowUp")}</TableHead>
            <TableHead className="text-right">{t("columnActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => {
            const stage = stageById.get(deal.stage_id) ?? null;
            const progress = stage ? stageProgress(stage, sortedStages) : 0;
            const contact = deal.contact;
            const followUp = deal.contact_id
              ? (followUpsByContact[deal.contact_id] ?? null)
              : null;
            const source = sourceBadgeInfo(contact?.source, contact?.source_platform);
            const score = scoreTone(contact?.lead_score);
            const lastActivity =
              contact?.last_customer_reply_at || contact?.last_contacted_at || null;
            return (
              <TableRow
                key={deal.id}
                className="cursor-pointer border-border/60"
                onClick={() => onOpenLead(deal)}
              >
                <TableCell>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {deal.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contact?.name || contact?.phone || t("columnLead")}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  {stage && (
                    <span
                      className="inline-flex items-center gap-1.5 text-xs text-foreground"
                      style={{ color: stage.color }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-muted-foreground">{stage.name}</span>
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex w-24 items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${progress}%`,
                          backgroundColor: stage?.color ?? "var(--primary)",
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                      {progress}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {deal.assignee?.full_name ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                        {initials(deal.assignee.full_name)}
                      </span>
                      <span className="truncate">{deal.assignee.full_name}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {source ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${source.className}`}
                    >
                      {source.label}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {contact?.lead_score != null ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${score.className}`}
                    >
                      {contact.lead_score}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(
                      Number(deal.value || 0),
                      deal.currency || defaultCurrency,
                    )}
                  </span>
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                  {lastActivity ? relativeTime(lastActivity) : "—"}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                  {followUp?.due_date
                    ? (isPast(followUp.due_date)
                        ? `${t("columnNextFollowUp")}: `
                        : ""
                      ) + shortDate(followUp.due_date)
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    aria-label="WhatsApp"
                    title="WhatsApp"
                    onClick={(e) => {
                      e.stopPropagation();
                      onWhatsApp(deal);
                    }}
                    className="rounded-md border border-border/60 bg-background/60 p-1.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}