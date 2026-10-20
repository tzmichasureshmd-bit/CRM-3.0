"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import { cn } from "@/lib/utils";
import type {
  Conversation,
  ConversationPlatform,
  ConversationStatus,
  Tag,
} from "@/types";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Search, ChevronDown, X } from "lucide-react";

// Platform SVG icons — inline so no extra deps needed
function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.845L.057 23.5l5.797-1.522A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.36-.214-3.717.976.993-3.63-.234-.373A9.818 9.818 0 1112 21.818z"/>
        </svg>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
        </svg>
      );
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
          <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      );
    case 'threads':
      return (
        <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
          <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 013.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65zm.36-13.09c-.109 0-.22.003-.333.009-1.084.063-1.932.367-2.455.88-.434.418-.637.953-.601 1.553.069 1.258 1.396 1.974 3.049 1.884 1.22-.066 2.111-.49 2.648-1.261.387-.555.588-1.302.598-2.22a11.738 11.738 0 00-2.906-.845z"/>
        </svg>
      );
    case 'x':
      return (
        <svg viewBox="0 0 24 24" fill="white" width="9" height="9">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      );
    default:
      return null;
  }
}
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  resyncToken?: number;
  /** Pre-select a platform filter from the URL (?channel=instagram etc.) */
  initialPlatformFilter?: PlatformFilter;
}

const PLATFORM_COLORS: Record<ConversationPlatform, { bg: string; dot: string }> = {
  whatsapp:  { bg: 'linear-gradient(135deg,#25D366,#128C7E)', dot: '#25D366' },
  facebook:  { bg: 'linear-gradient(135deg,#1877F2,#4a9af5)', dot: '#1877F2' },
  instagram: { bg: 'linear-gradient(135deg,#E1306C,#f77737)', dot: '#E1306C' },
  telegram:  { bg: 'linear-gradient(135deg,#26A5E4,#5bc8f5)', dot: '#26A5E4' },
  threads:   { bg: 'linear-gradient(135deg,#172033,#475569)', dot: '#172033' },
  x:         { bg: 'linear-gradient(135deg,#172033,#475569)', dot: '#172033' },
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#3462EE,#5b7ff5)',
  'linear-gradient(135deg,#10b981,#34d399)',
  'linear-gradient(135deg,#f59e0b,#fbbf24)',
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#E1306C,#f77737)',
  'linear-gradient(135deg,#1877F2,#4a9af5)',
  'linear-gradient(135deg,#26A5E4,#5bc8f5)',
  'linear-gradient(135deg,#ef4444,#f87171)',
]



type InboxFilter =
  | "all"
  | "unread"
  | "assigned_me"
  | "ai"
  | "archived";

type PlatformFilter = ConversationPlatform | "all";

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
  initialPlatformFilter = "all",
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  
   const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(() => [
     { label: t("filterAll"), value: "all" },
     { label: t("filterUnread"), value: "unread" },
     { label: t("filterAssignedMe"), value: "assigned_me" },
     { label: t("filterAI"), value: "ai" },
     { label: t("filterArchived"), value: "archived" },
   ], [t]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [loading, setLoading] = useState(true);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Multi-channel: filter to one platform. The chip row stays hidden until
  // a non-WhatsApp conversation actually exists, so WhatsApp-only inboxes
  // look exactly as before.
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>(initialPlatformFilter);

  // Drag-and-drop status organization. Track only the id being dragged;
  // the payload is derived from `conversations` so the overlay stays in
  // sync with realtime updates.
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Small distance so plain clicks still select a conversation instead
      // of always starting a drag.
      activationConstraint: { distance: 6 },
    })
  );

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  // Tag definitions for the filter picker — loaded once so labels/colours
  // stay stable regardless of which conversations happen to be loaded.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Company options are derived from the loaded conversations — there's no
  // separate companies table, and only companies with a live conversation
  // are worth offering as an inbox filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const { user } = useAuth();

  const filtered = useMemo(() => {
    let result = conversations;

    if (filter === "unread") {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter === "assigned_me") {
      result = result.filter((c) => c.assigned_agent_id === user?.id);
    } else if (filter === "ai") {
      result = result.filter((c) => (c.ai_reply_count ?? 0) > 0);
    } else if (filter === "archived") {
      result = result.filter((c) => c.status === "closed");
    }

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (platformFilter !== "all") {
      result = result.filter((c) => c.platform === platformFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [conversations, filter, search, selectedTagIds, selectedCompany, user?.id, platformFilter]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  // The platform chip row only appears once Messenger/Instagram data
  // exists — zero visual change for WhatsApp-only inboxes.
  const hasMultiPlatform = useMemo(
    () => conversations.some((c) => c.platform !== "whatsapp"),
    [conversations]
  );

  // Platform tab config with icon + short label
  const PLATFORM_CHIPS: { value: PlatformFilter; icon: string; short: string }[] = useMemo(
    () => [
      { value: "all",       icon: "all",       short: "All" },
      { value: "whatsapp",  icon: "whatsapp",  short: "WA" },
      { value: "facebook",  icon: "facebook",  short: "FB" },
      { value: "instagram", icon: "instagram", short: "IG" },
      { value: "telegram",  icon: "telegram",  short: "TG" },
      { value: "x",         icon: "x",         short: "X" },
      { value: "threads",   icon: "threads",   short: "Th" },
    ],
    []
  );

  const draggableConversation = useMemo(
    () => conversations.find((c) => c.id === activeDragId) ?? null,
    [conversations, activeDragId]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id.toString());
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over) return;
      const dropId = over.id.toString();
      if (!dropId.startsWith("status-")) return;
      const conv = conversations.find((c) => c.id === active.id);
      if (!conv) return;
      const newStatus = dropId.slice("status-".length) as ConversationStatus;
      if (conv.status === newStatus) return;
      // Optimistic update through the existing loading callback (the
      // parent owns the array); realtime reconciles any race below.
      onConversationsLoadedRef.current(
        conversations.map((c) =>
          c.id === conv.id ? { ...c, status: newStatus } : c
        )
      );
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ status: newStatus })
        .eq("id", conv.id);
      if (error) {
        console.error(
          "[inbox] failed to move conversation to " + newStatus + ":",
          error.message
        );
      }
    },
    [conversations]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    <div className="flex h-full w-full flex-col bg-background lg:w-80" style={{ borderRight: "1px solid hsl(var(--border))" }}>

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-foreground">Inbox</h2>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                {activeFilter?.label ?? t("filterAll")}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-border bg-popover">
                {FILTER_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setFilter(opt.value)}
                    className={cn("text-sm", filter === opt.value ? "text-primary font-medium" : "text-popover-foreground")}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {tags.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(
                  "inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted",
                  selectedTagIds.length > 0 ? "text-primary border-primary/40" : "text-muted-foreground hover:text-foreground"
                )}>
                  {t("tags")}
                  {selectedTagIds.length > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {selectedTagIds.length}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 w-56 border-border bg-popover">
                  {tags.map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t.id}
                      checked={selectedTagIds.includes(t.id)}
                      onCheckedChange={() => toggleTag(t.id)}
                      className="text-sm text-popover-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="truncate">{t.name}</span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {companies.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(
                  "inline-flex max-w-32 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted",
                  selectedCompany ? "text-primary border-primary/40" : "text-muted-foreground hover:text-foreground"
                )}>
                  <span className="truncate">{selectedCompany ?? t("company")}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 w-56 border-border bg-popover">
                  <DropdownMenuItem onClick={() => setSelectedCompany(null)} className={cn("text-sm", selectedCompany === null ? "text-primary font-medium" : "text-popover-foreground")}>
                    {t("allCompanies")}
                  </DropdownMenuItem>
                  {companies.map((co) => (
                    <DropdownMenuItem key={co} onClick={() => setSelectedCompany(co)} className={cn("text-sm", selectedCompany === co ? "text-primary font-medium" : "text-popover-foreground")}>
                      <span className="truncate">{co}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Platform tabs — icon + short label, scrollable */}
        <div className="-mx-4 flex items-center overflow-x-auto border-b border-border px-2 mb-3 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {PLATFORM_CHIPS.filter((chip) => chip.value === "all" || hasMultiPlatform || chip.value === "whatsapp").map((chip) => (
            <button
              key={chip.value}
              onClick={() => setPlatformFilter(chip.value)}
              title={chip.short}
              className={cn(
                "relative shrink-0 flex items-center gap-1 rounded-t-md px-2 py-2 text-[10px] font-semibold transition-colors whitespace-nowrap",
                platformFilter === chip.value
                  ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {chip.value === 'all' ? (
                <span className="text-[10px] font-bold">All</span>
              ) : (
                <>
                  {/* Colored icon pill */}
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{ background: PLATFORM_COLORS[chip.value as ConversationPlatform]?.bg ?? '#888' }}
                  >
                    <PlatformIcon platform={chip.value} />
                  </span>
                  <span>{chip.short}</span>
                </>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder={t("searchPlaceholder")}
            className="h-8 rounded-lg border-border bg-muted/50 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
          />
        </div>
      </div>

      {/* Active contact-filter chips */}
      {hasContactFilters && (
        <div className="flex flex-wrap items-center gap-1 px-4 pt-2">
          {selectedTagIds.map((id) => {
            const tag = tagsById.get(id);
            return (
              <button key={id} onClick={() => toggleTag(id)} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag?.color ?? "var(--muted-foreground)" }} />
                <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                <X className="h-3 w-3" />
              </button>
            );
          })}
          {selectedCompany && (
            <button onClick={() => setSelectedCompany(null)} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70">
              <span className="max-w-24 truncate">{selectedCompany}</span>
              <X className="h-3 w-3" />
            </button>
          )}
          <button onClick={clearContactFilters} className="px-1 text-[11px] text-muted-foreground hover:text-foreground">
            {t("clearAll")}
          </button>
        </div>
      )}

      {/* Conversation list */}
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {!loading && conversations.length > 0 && (
          <div className="border-b border-border px-4 py-2">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{t("dropStatusHint")}</p>
            <div className="flex items-center gap-1.5">
              {(["open", "pending", "closed"] as ConversationStatus[]).map((status) => (
                <StatusDropZone key={status} status={status} t={t} />
              ))}
            </div>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-3">
                <Search className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {search.trim() || selectedTagIds.length > 0 || selectedCompany !== null || filter !== "all" || platformFilter !== "all"
                  ? t("noConversationsFilteredDesc")
                  : t("noConversationsTitle")}
              </p>
              {(!search.trim() && selectedTagIds.length === 0 && selectedCompany === null && filter === "all" && platformFilter === "all") && (
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">{t("noConversationsDesc")}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col py-1">
              {filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  onSelect={handleSelect}
                  t={t}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <DragOverlay>
          {draggableConversation && <DragOverlayCard conversation={draggableConversation} t={t} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  t: ReturnType<typeof useTranslations>;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  t,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");
  const initials = displayName.slice(0, 2).toUpperCase();

  // Stable gradient per conversation (hash of id)
  const gradientIdx = conversation.id.charCodeAt(0) % AVATAR_GRADIENTS.length
  const avatarGrad = AVATAR_GRADIENTS[gradientIdx]
  const platform = conversation.platform ?? 'whatsapp'
  const pColor = PLATFORM_COLORS[platform as ConversationPlatform] ?? PLATFORM_COLORS.whatsapp


  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: conversation.id,
  });

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false })
    : "";

  return (
    <button
      ref={setNodeRef}
      onClick={handleClick}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative mx-2 my-0.5 flex w-[calc(100%-1rem)] items-start gap-3 rounded-xl px-3 py-3 text-left transition-all hover:bg-muted/60",
        isActive && "bg-primary/8 ring-1 ring-primary/20 shadow-sm",
        isDragging && "opacity-40"
      )}
    >
      {/* Active accent bar */}
      {isActive && <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full bg-primary" />}

      {/* Avatar with platform badge */}
      <div className="relative shrink-0">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-bold shadow-sm"
          style={{ background: contact?.avatar_url ? undefined : avatarGrad }}
        >
          {contact?.avatar_url ? (
            <img src={contact.avatar_url} alt={displayName} className="h-10 w-10 rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>
        {/* Platform badge */}
        <div
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background"
          style={{ background: pColor.bg }}
        >
          <PlatformIcon platform={platform} />
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-[13px] font-semibold leading-tight", isActive ? "text-primary" : "text-foreground")}>
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={cn("truncate text-[11px] leading-snug", conversation.unread_count > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {conversation.last_message_text || t("noMessagesYet")}
          </p>
          {conversation.unread_count > 0 && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** Drop target for one conversation status, used by the drag strip. */
function StatusDropZone({
  status,
  t,
}: {
  status: ConversationStatus;
  t: ReturnType<typeof useTranslations>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `status-${status}` });
  const label =
    status === "open"
      ? t("dropOpen")
      : status === "pending"
        ? t("dropPending")
        : t("dropClosed");

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 rounded-md border border-dashed px-2 py-1.5 text-center text-[11px] font-medium transition-colors",
        isOver
          ? status === "open"
            ? "border-primary bg-primary/5 text-primary"
            : status === "pending"
              ? "border-amber-500 bg-amber-500/5 text-amber-600"
              : "border-muted-foreground/60 bg-muted/40 text-muted-foreground"
          : "border-border text-muted-foreground/70"
      )}
    >
      {label}
    </div>
  );
}

/** Static preview shown under the pointer while dragging an item. */
function DragOverlayCard({
  conversation,
  t,
}: {
  conversation: Conversation;
  t: ReturnType<typeof useTranslations>;
}) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");
  const platform = conversation.platform ?? 'whatsapp'
  const pColor = PLATFORM_COLORS[platform as ConversationPlatform] ?? PLATFORM_COLORS.whatsapp
  const gradientIdx = conversation.id.charCodeAt(0) % AVATAR_GRADIENTS.length

  return (
    <div className="flex w-72 items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-xl">
      <div className="relative shrink-0">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-bold"
          style={{ background: AVATAR_GRADIENTS[gradientIdx] }}
        >
          {displayName.slice(0, 2).toUpperCase()}
        </div>
        <div
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-card"
          style={{ background: pColor.bg }}
        >
          <PlatformIcon platform={platform} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{conversation.last_message_text || t("noMessagesYet")}</p>
      </div>
    </div>
  );
}
