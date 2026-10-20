"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Deal, FollowUp, PipelineStage, Tag } from "@/types";
import { formatCurrency } from "@/lib/currency";
import { stageProgress } from "@/lib/crm/leads";
import { useTranslations } from "next-intl";
import { Plus, MoreHorizontal, Settings2, Filter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CrmLeadCard } from "./crm-lead-card";
import { Button } from "@/components/ui/button";

interface CrmPipelineBoardProps {
  stages: PipelineStage[];
  deals: Deal[];
  contactTags: Record<string, Tag[]>;
  followUpsByContact: Record<string, FollowUp>;
  defaultCurrency: string;
  canManage: boolean;
  onDealMoved: (dealId: string, newStageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onOpenLead: (deal: Deal) => void;
  onWhatsApp: (deal: Deal) => void;
  onStageSettings: () => void;
  onStageFilter: (stageId: string) => void;
}

export function CrmPipelineBoard({
  stages,
  deals,
  contactTags,
  followUpsByContact,
  defaultCurrency,
  canManage,
  onDealMoved,
  onAddDeal,
  onOpenLead,
  onWhatsApp,
  onStageSettings,
  onStageFilter,
}: CrmPipelineBoardProps) {
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of sortedStages) map.set(stage.id, []);
    for (const deal of deals) {
      const bucket = map.get(deal.stage_id);
      if (bucket) bucket.push(deal);
    }
    return map;
  }, [sortedStages, deals]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const activeDeal = activeDealId
    ? deals.find((d) => d.id === activeDealId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveDealId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDealId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const targetStageId = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === targetStageId) return;
    if (!sortedStages.some((s) => s.id === targetStageId)) return;
    onDealMoved(dealId, targetStageId);
  }

  function handleDragCancel() {
    setActiveDealId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="crm-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:snap-none">
        {sortedStages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) ?? [];
          const weightedValue = stageDeals.reduce(
            (sum, d) =>
              sum +
              Number(d.value || 0) *
                (stageProgress(stage, sortedStages) / 100),
            0,
          );
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              sortedStages={sortedStages}
              deals={stageDeals}
              totalValue={weightedValue}
              currency={defaultCurrency}
              contactTags={contactTags}
              followUpsByContact={followUpsByContact}
              canManage={canManage}
              onAddDeal={() => onAddDeal(stage.id)}
              onOpenLead={onOpenLead}
              onWhatsApp={onWhatsApp}
              onStageSettings={onStageSettings}
              onStageFilter={() => onStageFilter(stage.id)}
            />
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {activeDeal ? (
          <div className="opacity-90">
            <CrmLeadCard
              deal={activeDeal}
              stage={
                sortedStages.find((s) => s.id === activeDeal.stage_id) ?? null
              }
              sortedStages={sortedStages}
              contactTags={contactTags[activeDeal.contact_id ?? ""] ?? []}
              followUp={
                activeDeal.contact_id
                  ? (followUpsByContact[activeDeal.contact_id] ?? null)
                  : null
              }
              defaultCurrency={defaultCurrency}
              onOpen={() => {}}
              onWhatsApp={() => {}}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .crm-scroll {
          scroll-behavior: smooth;
        }
        @media (hover: none), (pointer: coarse) {
          .crm-scroll::-webkit-scrollbar {
            height: 0;
            display: none;
          }
          .crm-scroll {
            scrollbar-width: none;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .crm-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
          }
          .crm-scroll::-webkit-scrollbar {
            height: 8px;
          }
          .crm-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .crm-scroll::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 9999px;
          }
          .crm-scroll::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted-foreground);
          }
        }
      `}</style>
    </DndContext>
  );
}

function StageColumn({
  stage,
  sortedStages,
  deals,
  totalValue,
  currency,
  contactTags,
  followUpsByContact,
  canManage,
  onAddDeal,
  onOpenLead,
  onWhatsApp,
  onStageSettings,
  onStageFilter,
}: {
  stage: PipelineStage;
  sortedStages: PipelineStage[];
  deals: Deal[];
  totalValue: number;
  currency: string;
  contactTags: Record<string, Tag[]>;
  followUpsByContact: Record<string, FollowUp>;
  canManage: boolean;
  onAddDeal: () => void;
  onOpenLead: (deal: Deal) => void;
  onWhatsApp: (deal: Deal) => void;
  onStageSettings: () => void;
  onStageFilter: () => void;
}) {
  const t = useTranslations("Crm");
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className="flex w-[85vw] min-w-[280px] max-w-[340px] shrink-0 snap-start flex-col rounded-xl border border-border bg-card/60 p-4 lg:w-auto lg:max-w-none lg:flex-1 lg:basis-[290px] lg:shrink lg:snap-none">
      <div
        className="-mx-4 -mt-4 h-[3px] rounded-t-xl"
        style={{ backgroundColor: stage.color }}
      />
      <div className="flex items-center justify-between gap-2 pt-3">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {stage.name}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {deals.length}
          </span>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("board.stageMenu")}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 border-border bg-popover text-popover-foreground"
              >
                <DropdownMenuItem
                  onClick={onAddDeal}
                  className="text-popover-foreground"
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {t("board.addLead")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onStageFilter}
                  className="text-popover-foreground"
                >
                  <Filter className="mr-2 h-3.5 w-3.5" />
                  {t("board.viewLeads")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  onClick={onStageSettings}
                  className="text-popover-foreground"
                >
                  <Settings2 className="mr-2 h-3.5 w-3.5" />
                  {t("board.stageSettings")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatCurrency(totalValue, currency)}
      </p>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-1 flex-col gap-2 rounded-lg transition-all ${
          isOver
            ? "bg-primary/5 outline outline-2 outline-dashed outline-primary outline-offset-2"
            : ""
        }`}
      >
        {deals.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border py-10 text-xs text-muted-foreground">
            {t("board.noLeadsInStage")}
          </div>
        ) : (
          deals.map((deal) => (
            <DraggableLeadCard
              key={deal.id}
              deal={deal}
              stage={stage}
              sortedStages={sortedStages}
              contactTags={contactTags[deal.contact_id ?? ""] ?? []}
              followUp={
                deal.contact_id
                  ? (followUpsByContact[deal.contact_id] ?? null)
                  : null
              }
              currency={currency}
              onOpenLead={onOpenLead}
              onWhatsApp={onWhatsApp}
            />
          ))
        )}
      </div>

      {canManage && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddDeal}
          className="mt-3 w-full justify-start border border-dashed border-border bg-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("board.addLead")}
        </Button>
      )}
    </div>
  );
}

function DraggableLeadCard({
  deal,
  stage,
  sortedStages,
  contactTags,
  followUp,
  currency,
  onOpenLead,
  onWhatsApp,
}: {
  deal: Deal;
  stage: PipelineStage;
  sortedStages: PipelineStage[];
  contactTags: Tag[];
  followUp: FollowUp | null;
  currency: string;
  onOpenLead: (deal: Deal) => void;
  onWhatsApp: (deal: Deal) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}
    >
      <CrmLeadCard
        deal={deal}
        stage={stage}
        sortedStages={sortedStages}
        contactTags={contactTags}
        followUp={followUp}
        defaultCurrency={currency}
        onOpen={onOpenLead}
        onWhatsApp={onWhatsApp}
      />
    </div>
  );
}