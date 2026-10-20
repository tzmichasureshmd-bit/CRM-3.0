"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import type {
  Deal,
  FollowUp,
  Pipeline,
  PipelineStage,
  Tag,
} from "@/types";
import {
  stageMilestone,
  leadStatusForMilestone,
  attentionItems,
  waLink,
  type LeadProgression,
} from "@/lib/crm/leads";
import { setContactLeadStatus } from "@/lib/crm/lead-status";
import {
  CrmPipelineBoard,
} from "@/components/crm/crm-pipeline-board";
import { CrmStats, type CrmStats as CrmStatsShape } from "@/components/crm/crm-stats";
import {
  CrmFilters,
  DEFAULT_FILTERS,
  QUICK_FILTERS,
  type CrmFilterState,
} from "@/components/crm/crm-filters";
import { CrmLeadList } from "@/components/crm/crm-lead-list";
import { CrmAnalytics } from "@/components/crm/crm-analytics";
import { CrmNeedsAttention } from "@/components/crm/crm-needs-attention";
import { DealForm } from "@/components/pipelines/deal-form";
import { PipelineSettings } from "@/components/pipelines/pipeline-settings";
import { ContactDetailView } from "@/components/contacts/contact-detail-view";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GitBranch,
  Plus,
  ChevronDown,
  Settings,
  Target,
  Columns3,
  List,
  ChartColumn,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

type CrmView = "kanban" | "list" | "analytics";

// Same seed the Pipelines page uses, so the CRM tab and /pipelines share
// one source of truth for newly-created pipelines.
const SPEC_DEFAULT_STAGES = [
  { name: "New Lead", color: "#3b82f6", position: 0 },
  { name: "Qualified", color: "#eab308", position: 1 },
  { name: "Proposal Sent", color: "#f97316", position: 2 },
  { name: "Negotiation", color: "#8b5cf6", position: 3 },
  { name: "Won", color: "#22c55e", position: 4 },
  { name: "Lost", color: "#ef4444", position: 5 },
];

export default function CrmPage() {
  const t = useTranslations("Crm");
  const ma = useTranslations("Crm.mainActions");
  const supabase = createClient();
  const router = useRouter();
  const { accountId, defaultCurrency } = useAuth();
  const canEditSettings = useCan("edit-settings");
  const canCreateDeals = useCan("send-messages");

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [contactTags, setContactTags] = useState<Record<string, Tag[]>>({});
  const [conversationsByContact, setConversationsByContact] = useState<
    Record<string, string>
  >({});

  const [view, setView] = useState<CrmView>("kanban");
  const [filters, setFilters] = useState<CrmFilterState>(DEFAULT_FILTERS);
  const [activeQuick, setActiveQuick] = useState("all");

  // Dialogs / sheets
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contactDetailOpen, setContactDetailOpen] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [creating, setCreating] = useState(false);

  const seedAttempted = useRef(false);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  // ---------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------

  const loadPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .order("created_at");
    if (error) {
      console.error("Failed to load pipelines:", error.message);
      return [] as Pipeline[];
    }
    return (data ?? []) as Pipeline[];
  }, [supabase]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      return (data ?? []) as PipelineStage[];
    },
    [supabase],
  );

  const loadDeals = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("deals")
        .select("*, contact:contacts(*), assignee:profiles!deals_assigned_to_fkey(*)")
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Deal[];
    },
    [supabase],
  );

  const loadFollowUps = useCallback(async () => {
    if (!accountId) return [] as FollowUp[];
    const { data } = await supabase
      .from("follow_ups")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .order("due_date", { ascending: true });
    return (data ?? []) as FollowUp[];
  }, [supabase, accountId]);

  const loadContactTags = useCallback(async (dealList: Deal[]) => {
    const contactIds = Array.from(
      new Set(
        dealList
          .map((d) => d.contact_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (contactIds.length === 0) {
      setContactTags({});
      return;
    }
    const { data } = await supabase
      .from("contacts")
      .select("id, tags:contact_tags(tag:tags(*))")
      .in("id", contactIds);
    const map: Record<string, Tag[]> = {};
    for (const row of data ?? []) {
      const tags = (row.tags ?? [])
        .map((ct: { tag?: Tag | Tag[] }) => ct.tag)
        .flat()
        .filter(Boolean) as Tag[];
      map[row.id as string] = tags;
    }
    setContactTags(map);
  }, [supabase]);

  const loadConversations = useCallback(async (dealList: Deal[]) => {
    const contactIds = Array.from(
      new Set(
        dealList
          .map((d) => d.contact_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (contactIds.length === 0) {
      setConversationsByContact({});
      return;
    }
    const { data } = await supabase
      .from("conversations")
      .select("id, contact_id, last_message_at")
      .in("contact_id", contactIds)
      .order("last_message_at", { ascending: false });
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      const cid = row.contact_id as string;
      if (!map[cid]) map[cid] = row.id as string;
    }
    setConversationsByContact(map);
  }, [supabase]);

  const seedDefaultPipeline = useCallback(async (): Promise<Pipeline | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    if (!accountId) return null;

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name: "Sales Pipeline" })
      .select()
      .single();
    if (error || !pipeline) {
      console.error("Failed to seed pipeline:", error?.message);
      return null;
    }
    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);
    return pipeline as Pipeline;
  }, [supabase, accountId]);

  // Initial load + seed-if-empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        let list = await loadPipelines();
        if (list.length === 0 && !seedAttempted.current) {
          seedAttempted.current = true;
          const seeded = await seedDefaultPipeline();
          if (seeded) list = await loadPipelines();
        }
        if (cancelled) return;
        setPipelines(list);
        if (list.length > 0) {
          setSelectedPipelineId((prev) =>
            prev && list.some((p) => p.id === prev) ? prev : list[0].id,
          );
        } else {
          setSelectedPipelineId("");
        }
      } catch (e) {
        console.error("CRM load failed:", e);
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "unknown");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, seedDefaultPipeline]);

  // Load stages + deals + context whenever the selected pipeline changes
  useEffect(() => {
    if (!selectedPipelineId) {
      setStages([]);
      setDeals([]);
      setFollowUps([]);
      setContactTags({});
      setConversationsByContact({});
      return;
    }
    let cancelled = false;
    (async () => {
      const [s, d, f] = await Promise.all([
        loadStages(selectedPipelineId),
        loadDeals(selectedPipelineId),
        loadFollowUps(),
      ]);
      if (cancelled) return;
      setStages(s);
      setDeals(d);
      setFollowUps(f);
      await Promise.all([loadContactTags(d), loadConversations(d)]);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedPipelineId,
    loadStages,
    loadDeals,
    loadFollowUps,
    loadContactTags,
    loadConversations,
  ]);

  // ---------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------

  const followUpsByContact = useMemo(() => {
    const map: Record<string, FollowUp> = {};
    for (const f of followUps) {
      if (!map[f.contact_id]) map[f.contact_id] = f;
    }
    return map;
  }, [followUps]);

  const stats: CrmStatsShape = useMemo(() => {
    const progressionOf = (d: Deal) => {
      const stage = sortedStages.find((s) => s.id === d.stage_id);
      return stage ? stageMilestone(stage) : null;
    };
    const qualified: LeadProgression[] = ["qualified", "proposal", "negotiation"];
    let total = 0,
      new_ = 0,
      inProgress = 0,
      qualifiedCount = 0,
      followUpCount = 0,
      won = 0,
      lost = 0;
    for (const d of deals) {
      total++;
      const m = progressionOf(d);
      if (m === "new") new_++;
      if (d.status === "open") {
        inProgress++;
        if (m && (qualified as string[]).includes(m)) qualifiedCount++;
        if (d.contact_id && followUpsByContact[d.contact_id]) followUpCount++;
      }
      if (d.status === "won") won++;
      if (d.status === "lost") lost++;
    }
    return {
      total,
      new: new_,
      inProgress,
      qualified: qualifiedCount,
      followUpRequired: followUpCount,
      converted: won,
      lost,
      conversionRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0,
    };
  }, [deals, sortedStages, followUpsByContact]);

  const agents = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of deals) {
      if (d.assignee?.full_name) {
        map.set(d.assignee.id, d.assignee.full_name);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [deals]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const d of deals) {
      const c = d.contact;
      if (!c) continue;
      set.add(c.source || c.source_platform || "Unknown");
    }
    return Array.from(set).sort();
  }, [deals]);

  const allTags = useMemo(() => {
    const map = new Map<string, Tag>();
    for (const tags of Object.values(contactTags)) {
      for (const tag of tags) map.set(tag.id, tag);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [contactTags]);

  const filteredDeals = useMemo(() => {
    let list = deals;
    switch (activeQuick) {
      case "new":
        list = list.filter((d) => {
          const stage = sortedStages.find((s) => s.id === d.stage_id);
          return stage ? stageMilestone(stage) === "new" : false;
        });
        break;
      case "qualified":
        list = list.filter((d) => {
          const stage = sortedStages.find((s) => s.id === d.stage_id);
          const m = stage ? stageMilestone(stage) : null;
          return (
            d.status === "open" &&
            (m === "qualified" || m === "proposal" || m === "negotiation")
          );
        });
        break;
      case "follow_up":
        list = list.filter(
          (d) =>
            d.status === "open" &&
            !!d.contact_id &&
            !!followUpsByContact[d.contact_id],
        );
        break;
      case "won":
        list = list.filter((d) => d.status === "won");
        break;
      case "lost":
        list = list.filter((d) => d.status === "lost");
        break;
      default:
        break;
    }

    const q = filters.search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) => {
        const c = d.contact;
        const haystack = [
          d.title,
          c?.name,
          c?.phone,
          c?.email,
          c?.company,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    if (filters.stageId) list = list.filter((d) => d.stage_id === filters.stageId);
    if (filters.agentId) list = list.filter((d) => d.assigned_to === filters.agentId);
    if (filters.status) list = list.filter((d) => d.status === filters.status);
    if (filters.source) {
      list = list.filter(
        (d) =>
          d.contact &&
          (d.contact.source === filters.source ||
            d.contact.source_platform === filters.source),
      );
    }
    if (filters.tagId) {
      list = list.filter((d) =>
        (contactTags[d.contact_id ?? ""] ?? []).some(
          (tag) => tag.id === filters.tagId,
        ),
      );
    }
    if (filters.minScore > 0) {
      list = list.filter((d) => (d.contact?.lead_score ?? 0) >= filters.minScore);
    }
    return list;
  }, [deals, activeQuick, filters, sortedStages, followUpsByContact, contactTags]);

  const attentionList = useMemo(
    () => attentionItems(deals, followUps),
    [deals, followUps],
  );

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    const d = await loadDeals(selectedPipelineId);
    setDeals(d);
    await Promise.all([loadContactTags(d), loadConversations(d)]);
  }, [selectedPipelineId, loadDeals, loadContactTags, loadConversations]);

  const refreshStages = useCallback(async () => {
    if (!selectedPipelineId) return;
    setStages(await loadStages(selectedPipelineId));
  }, [selectedPipelineId, loadStages]);

  const refreshPipelines = useCallback(async () => {
    const list = await loadPipelines();
    setPipelines(list);
    if (list.length === 0) setSelectedPipelineId("");
    else if (!list.some((p) => p.id === selectedPipelineId))
      setSelectedPipelineId(list[0].id);
  }, [loadPipelines, selectedPipelineId]);

  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      const prev = deals.find((d) => d.id === dealId);
      setDeals((prevList) =>
        prevList.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)),
      );
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: newStageId })
        .eq("id", dealId);
      if (error) {
        toast.error(t("loadError.title"));
        refreshDeals();
        return;
      }
      // Keep the linked contact's lead_status in sync with the stage when
      // the stage maps cleanly to a lead-status milestone. One write path
      // (`setContactLeadStatus`) is shared with Inbox/Contacts/Pipeline.
      const stage = sortedStages.find((s) => s.id === newStageId);
      const milestone = stage ? stageMilestone(stage) : null;
      const leadStatus = milestone ? leadStatusForMilestone(milestone) : null;
      if (leadStatus && prev?.contact_id) {
        const sync = await setContactLeadStatus(supabase, prev.contact_id, leadStatus);
        if (sync.ok) {
          setDeals((prevList) =>
            prevList.map((d) =>
              d.id === dealId && d.contact
                ? { ...d, contact: { ...d.contact, lead_status: sync.status } }
                : d,
            ),
          );
        } else {
          console.warn("Failed to sync contact lead_status:", sync.error);
        }
      }
    },
    [supabase, deals, sortedStages, refreshDeals, t],
  );

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? sortedStages[0]?.id ?? "");
      setDealFormOpen(true);
    },
    [sortedStages],
  );

  const handleEditDeal = useCallback(
    (deal: Deal) => {
      setEditingDeal(deal);
      setDefaultStageId(deal.stage_id);
      setDealFormOpen(true);
    },
    [],
  );

  const handleOpenLead = useCallback(
    (deal: Deal) => {
      if (deal.contact_id) {
        setContactId(deal.contact_id);
        setContactDetailOpen(true);
      } else {
        handleEditDeal(deal);
      }
    },
    [handleEditDeal],
  );

  const handleWhatsApp = useCallback(
    (deal: Deal) => {
      const conversationId =
        deal.conversation_id || conversationsByContact[deal.contact_id ?? ""];
      if (conversationId) {
        router.push(`/inbox?c=${conversationId}`);
        return;
      }
      const link = waLink(deal.contact?.phone);
      if (link) {
        window.open(link, "_blank", "noopener,noreferrer");
      }
    },
    [router, conversationsByContact],
  );

  const handleStageFilter = useCallback(
    (stageId: string) => {
      setActiveQuick("all");
      setFilters((f) => ({ ...f, stageId }));
    },
    [],
  );

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setActiveQuick("all");
  }, []);

  async function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name) return;
    setCreating(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user || !accountId) {
      setCreating(false);
      return;
    }
    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name })
      .select()
      .single();
    if (error || !pipeline) {
      toast.error(t("loadError.title"));
      setCreating(false);
      return;
    }
    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);
    setNewPipelineName("");
    setNewPipelineOpen(false);
    setSelectedPipelineId(pipeline.id);
    await refreshPipelines();
    setCreating(false);
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  // ---------------------------------------------------------------
  // Loading / error / empty states
  // ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="h-8 w-56 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
        <div className="flex gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-96 w-72 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
        <Target className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium text-foreground">
          {t("loadError.title")}
        </h3>
        <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
          {t("loadError.description")}
        </p>
        <Button
          onClick={() => {
            setLoadError(null);
            setLoading(true);
            seedAttempted.current = false;
            // Simple retry: refetch pipelines via the normal path
            (async () => {
              const list = await loadPipelines();
              setPipelines(list);
              if (list.length > 0) setSelectedPipelineId(list[0].id);
              setLoading(false);
            })();
          }}
          className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          {t("loadError.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header: pipeline selector + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted data-[popup-open]:bg-muted">
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="font-semibold">
                {selectedPipeline?.name ?? t("selectPipeline")}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 border-border bg-popover text-popover-foreground"
            >
              {pipelines.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {t("empty.title")}
                </DropdownMenuItem>
              )}
              {pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setSelectedPipelineId(p.id)}
                  className={
                    p.id === selectedPipelineId
                      ? "text-primary"
                      : "text-popover-foreground"
                  }
                >
                  <GitBranch className="mr-2 h-3.5 w-3.5" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              {selectedPipeline && (
                <DropdownMenuItem
                  onClick={() => setSettingsOpen(true)}
                  className="text-popover-foreground"
                >
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  {ma("managePipelines")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View switcher */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
            {(
              [
                ["kanban", Columns3],
                ["list", List],
                ["analytics", ChartColumn],
              ] as Array<[CrmView, typeof List]>
            ).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  view === key
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t(`nav.${key}`)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="border-border bg-card text-foreground hover:bg-muted"
          >
            <Plus className="mr-1 h-4 w-4" />
            {ma("newPipeline")}
          </GatedButton>
          <GatedButton
            canAct={canCreateDeals}
            gateReason="create deals"
            disabled={!selectedPipelineId || sortedStages.length === 0}
            onClick={() => handleAddDeal()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addLead")}
          </GatedButton>
        </div>
      </div>

      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <GitBranch className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            {t("empty.title")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("empty.description")}
          </p>
          <GatedButton
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {ma("newPipeline")}
          </GatedButton>
        </div>
      ) : deals.length === 0 ? (
        <>
          <CrmStats stats={stats} activeFilter={activeQuick} onSelect={setActiveQuick} />
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
            <Target className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium text-foreground">
              {t("empty.title")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("empty.description")}
            </p>
            <GatedButton
              canAct={canCreateDeals}
              gateReason="create deals"
              onClick={() => handleAddDeal()}
              className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-1 h-4 w-4" />
              {t("empty.addFirstLead")}
            </GatedButton>
          </div>
        </>
      ) : (
        <>
          <CrmStats stats={stats} activeFilter={activeQuick} onSelect={setActiveQuick} />

          {view === "analytics" ? (
            <>
              <CrmAnalytics
                stages={sortedStages}
                deals={deals}
                defaultCurrency={defaultCurrency}
              />
              <CrmNeedsAttention
                items={attentionList}
                sortedStages={sortedStages}
                defaultCurrency={defaultCurrency}
                onOpenLead={handleOpenLead}
                onWhatsApp={handleWhatsApp}
              />
            </>
          ) : (
            <>
              <CrmFilters
                dealsCount={deals.length}
                resultCount={filteredDeals.length}
                stages={sortedStages}
                agents={agents}
                sources={sources}
                allTags={allTags}
                quickFilters={QUICK_FILTERS}
                activeQuick={activeQuick}
                filters={filters}
                onChange={setFilters}
                onQuickChange={setActiveQuick}
                onClear={handleClearFilters}
              />

              <CrmNeedsAttention
                items={attentionList}
                sortedStages={sortedStages}
                defaultCurrency={defaultCurrency}
                onOpenLead={handleOpenLead}
                onWhatsApp={handleWhatsApp}
              />

              {view === "kanban" ? (
                <CrmPipelineBoard
                  stages={sortedStages}
                  deals={filteredDeals}
                  contactTags={contactTags}
                  followUpsByContact={followUpsByContact}
                  defaultCurrency={defaultCurrency}
                  canManage={canEditSettings}
                  onDealMoved={handleDealMoved}
                  onAddDeal={handleAddDeal}
                  onOpenLead={handleOpenLead}
                  onWhatsApp={handleWhatsApp}
                  onStageSettings={() => setSettingsOpen(true)}
                  onStageFilter={handleStageFilter}
                />
              ) : (
                <CrmLeadList
                  deals={filteredDeals}
                  sortedStages={sortedStages}
                  followUpsByContact={followUpsByContact}
                  defaultCurrency={defaultCurrency}
                  onOpenLead={handleOpenLead}
                  onWhatsApp={handleWhatsApp}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Deal form (create / edit) */}
      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={selectedPipelineId}
        stages={sortedStages}
        defaultStageId={defaultStageId}
        onSaved={refreshDeals}
      />

      {/* Pipeline settings */}
      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={sortedStages}
          onPipelinesChanged={refreshPipelines}
          onStagesChanged={refreshStages}
          onCreateNewPipeline={() => {
            setSettingsOpen(false);
            setNewPipelineOpen(true);
          }}
        />
      )}

      {/* Contact quick view */}
      <ContactDetailView
        open={contactDetailOpen}
        onOpenChange={setContactDetailOpen}
        contactId={contactId}
        onUpdated={refreshDeals}
      />

      {/* New pipeline dialog */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="sm:max-w-sm border-border bg-popover">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {ma("newPipeline")}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-muted-foreground">{ma("pipelineName")}</Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder={ma("pipelineNamePlaceholder")}
              className="mt-2 border-border bg-muted text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePipeline();
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {ma("newPipelineDesc")}
            </p>
          </div>
          <DialogFooter className="border-border bg-popover/50">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {ma("cancel")}
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? ma("creating") : ma("createPipeline")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}