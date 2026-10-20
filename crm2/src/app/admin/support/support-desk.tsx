"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  FilterX,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Timer,
  User,
  XCircle,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/errors";
import { hasColumn } from "@/lib/db/schema";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/types";
import type {
  AdminTicketCommentResponse,
  AdminTicketDetailResponse,
  AdminTicketListItem,
  AdminTicketListResponse,
  AdminTicketMutationResponse,
  AdminTicketStats,
} from "@/app/api/admin/tickets/types";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE = 25;

const STATUS_OPTIONS: { value: TicketStatus; label: string; icon: typeof CircleDot }[] = [
  { value: "open", label: "Open", icon: CircleDot },
  { value: "in_progress", label: "In Progress", icon: Timer },
  { value: "waiting", label: "Waiting", icon: Clock },
  { value: "resolved", label: "Resolved", icon: CheckCircle2 },
  { value: "closed", label: "Closed", icon: XCircle },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "bg-gray-500" },
  { value: "medium", label: "Medium", color: "bg-blue-500" },
  { value: "high", label: "High", color: "bg-orange-500" },
  { value: "urgent", label: "Urgent", color: "bg-red-500" },
];

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "feature_request", label: "Feature Request" },
  { value: "other", label: "Other" },
];

const STATUS_COLOR_MAP: Record<TicketStatus, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200",
  waiting: "bg-purple-100 text-purple-800 border-purple-200",
  resolved: "bg-green-100 text-green-800 border-green-200",
  closed: "bg-gray-100 text-gray-800 border-gray-200",
};

const PRIORITY_COLOR_MAP: Record<TicketPriority, string> = {
  low: "bg-gray-100 text-gray-800 border-gray-200",
  medium: "bg-blue-100 text-blue-800 border-blue-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  urgent: "bg-red-100 text-red-800 border-red-200",
};

interface TenantOption {
  id: string;
  name: string;
  slug: string | null;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `The request failed (status ${response.status}).`);
  }
  return payload as T;
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface SupportDeskProps {
  basePath: string;
}

export function SupportDesk({ basePath }: SupportDeskProps) {
  const supabase = createClient();

  const [tickets, setTickets] = useState<AdminTicketListItem[]>([]);
  const [stats, setStats] = useState<AdminTicketStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tenants, setTenants] = useState<TenantOption[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminTicketDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [categorySupported, setCategorySupported] = useState(true);

  const hasFilters =
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    accountFilter !== "all" ||
    search.trim().length > 0;

  const loadList = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (accountFilter !== "all") params.set("accountId", accountFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const data = await apiRequest<AdminTicketListResponse>(
        `/api/admin/tickets?${params.toString()}`,
      );
      setTickets(data.tickets);
      setTotal(data.total);
      setStats(data.stats);
    } catch (err) {
      setListError(describeError(err, "The ticket list request failed."));
      setTickets([]);
      setTotal(0);
      toast.error("Tickets could not be loaded", {
        description: describeError(err, "The ticket list request failed."),
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, accountFilter, search, page]);

  const openDetail = useCallback(async (ticketId: string) => {
    setSelectedId(ticketId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setCommentBody("");
    setIsInternal(false);
    try {
      const data = await apiRequest<AdminTicketDetailResponse>(
        `/api/admin/tickets/${ticketId}`,
      );
      setDetail(data);
    } catch (err) {
      setDetailError(describeError(err, "The ticket details could not be loaded."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setCommentBody("");
    setIsInternal(false);
    setCloseConfirmOpen(false);
  }, []);

  const patchTicket = useCallback(
    async (patch: Record<string, unknown>, key: string, successMessage: string) => {
      if (!selectedId) return false;
      setSavingKey(key);
      try {
        const result = await apiRequest<AdminTicketMutationResponse>(
          `/api/admin/tickets/${selectedId}`,
          { method: "PATCH", body: JSON.stringify(patch) },
        );
        setDetail((prev) => {
          if (!prev) return prev;
          const nextTicket = { ...prev.ticket, ...result.ticket };
          const assignee = nextTicket.assigned_agent_id
            ? (prev.agents.find((a) => a.user_id === nextTicket.assigned_agent_id) ?? null)
            : null;
          return { ...prev, ticket: nextTicket, assignee };
        });
        toast.success(successMessage);
        void loadList();
        return true;
      } catch (err) {
        toast.error("Could not update the ticket", {
          description: describeError(err, "The change was rejected."),
        });
        return false;
      } finally {
        setSavingKey(null);
      }
    },
    [selectedId, loadList],
  );

  const postComment = useCallback(async () => {
    if (!selectedId || !commentBody.trim()) return;
    setPostingComment(true);
    try {
      const result = await apiRequest<AdminTicketCommentResponse>(
        `/api/admin/tickets/${selectedId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body: commentBody.trim(), is_internal: isInternal }),
        },
      );
      setDetail((prev) => {
        if (!prev) return prev;
        const author = result.comment.author?.full_name ?? "Someone";
        return {
          ...prev,
          comments: [...prev.comments, result.comment],
          timeline: [
            ...prev.timeline,
            {
              at: result.comment.created_at,
              kind: result.comment.is_internal ? ("note" as const) : ("reply" as const),
              label: result.comment.is_internal
                ? `${author} added an internal note`
                : `${author} replied`,
            },
          ],
        };
      });
      setCommentBody("");
      toast.success(isInternal ? "Internal note added" : "Reply sent");
    } catch (err) {
      toast.error("Could not save the comment", {
        description: describeError(err, "The comment was rejected."),
      });
    } finally {
      setPostingComment(false);
    }
  }, [selectedId, commentBody, isInternal]);

  useEffect(() => {
    let cancelled = false;
    hasColumn(supabase, "tickets", "category").then((ok) => {
      if (!cancelled) setCategorySupported(ok);
    });
    apiRequest<{ accounts: TenantOption[] }>("/api/admin/accounts")
      .then((data) => {
        if (!cancelled) setTenants(data.accounts ?? []);
      })
      .catch((err) => {
        toast.error("Businesses could not be loaded", {
          description: describeError(err, "The tenant list request failed."),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, accountFilter, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function clearFilters() {
    setStatusFilter("all");
    setPriorityFilter("all");
    setAccountFilter("all");
    setSearchInput("");
    setSearch("");
  }

  async function confirmClose() {
    if (!selectedId) return;
    const ok = await patchTicket({ status: "closed" }, "status", "Ticket closed");
    if (ok) setCloseConfirmOpen(false);
  }

  function statusBadge(status: TicketStatus) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR_MAP[status]}`}
      >
        {STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status}
      </span>
    );
  }

  function priorityBadge(priority: TicketPriority) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLOR_MAP[priority]}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${PRIORITY_OPTIONS.find((p) => p.value === priority)?.color ?? ""}`}
        />
        {PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? priority}
      </span>
    );
  }

  const statCards: {
    label: string;
    value: number | null;
    hint: string;
    icon: typeof CircleDot;
    valueClass: string;
    iconClass: string;
  }[] = [
    {
      label: "Open",
      value: stats ? stats.open : null,
      hint: "Awaiting first response",
      icon: CircleDot,
      valueClass: "text-blue-700 dark:text-blue-400",
      iconClass: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "In Progress",
      value: stats ? stats.in_progress : null,
      hint: "Being worked on",
      icon: Timer,
      valueClass: "text-yellow-700 dark:text-yellow-400",
      iconClass: "text-yellow-600 dark:text-yellow-400",
    },
    {
      label: "Waiting",
      value: stats ? stats.waiting : null,
      hint: "Waiting on the customer",
      icon: Clock,
      valueClass: "text-purple-700 dark:text-purple-400",
      iconClass: "text-purple-600 dark:text-purple-400",
    },
    {
      label: "Resolved",
      value: stats ? stats.resolved : null,
      hint: stats
        ? `${stats.resolved_today} today · ${stats.resolved_last_7_days} in the last 7 days`
        : "All time",
      icon: CheckCircle2,
      valueClass: "text-green-700 dark:text-green-400",
      iconClass: "text-green-600 dark:text-green-400",
    },
    {
      label: "Unassigned",
      value: stats ? stats.unassigned : null,
      hint: "Unresolved with no owner",
      icon: User,
      valueClass: "text-foreground",
      iconClass: "text-muted-foreground",
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const ticket = detail?.ticket ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Support Desk</h3>
          <p className="text-sm text-muted-foreground">
            Every ticket across every business — open one to assign, reply or resolve.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadList()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => (
          <Card key={card.label} className="border-border bg-card">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.valueClass}`}>
                    {card.value ?? "—"}
                  </p>
                </div>
                <card.icon className={`h-5 w-5 ${card.iconClass}`} />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border bg-card">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <Label className="mb-1.5 block text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Subject, description, ticket # or requester..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="min-w-[150px]">
              <Label className="mb-1.5 block text-xs">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(
                    (typeof v === "string" ? v : "all") as TicketStatus | "all",
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Label className="mb-1.5 block text-xs">Priority</Label>
              <Select
                value={priorityFilter}
                onValueChange={(v) =>
                  setPriorityFilter(
                    (typeof v === "string" ? v : "all") as TicketPriority | "all",
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <Label className="mb-1.5 block text-xs">Business</Label>
              <Select
                value={accountFilter}
                onValueChange={(v) => setAccountFilter(typeof v === "string" ? v : "all")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Businesses</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <FilterX className="h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquare className="h-4 w-4 text-primary" />
            Tickets
            {typeof total === "number" && (
              <span className="font-normal text-muted-foreground">· {total} total</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : listError && tickets.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="Tickets could not be loaded"
              description={listError}
              action={
                <Button variant="outline" size="sm" onClick={() => void loadList()}>
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </Button>
              }
            />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={hasFilters ? "No tickets match your filters" : "No tickets yet"}
              description={
                hasFilters
                  ? "Try a different status, priority, business or search term."
                  : "Support tickets created by businesses will show up here."
              }
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <FilterX className="h-4 w-4" />
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Ticket</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="w-[160px]">Business</TableHead>
                    <TableHead className="w-[170px]">Requester</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[100px]">Priority</TableHead>
                    <TableHead className="w-[140px]">Assignee</TableHead>
                    <TableHead className="w-[90px]">Created</TableHead>
                    <TableHead className="w-[90px]">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => void openDetail(row.id)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{row.ticket_number}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[280px] truncate text-sm font-medium">
                          {row.subject}
                        </div>
                        {row.description && (
                          <div className="mt-0.5 max-w-[280px] truncate text-xs text-muted-foreground">
                            {row.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[150px] truncate text-sm">
                          {row.account?.name ?? "Unknown"}
                        </div>
                        {row.account?.slug && (
                          <div className="truncate text-xs text-muted-foreground">
                            @{row.account.slug}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[160px] truncate text-sm">
                          {row.requester_name ?? "—"}
                        </div>
                        {row.requester_email && (
                          <div className="max-w-[160px] truncate text-xs text-muted-foreground">
                            {row.requester_email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell>{priorityBadge(row.priority)}</TableCell>
                      <TableCell className="text-sm">
                        {row.assignee?.full_name ?? (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatTimeAgo(row.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatTimeAgo(row.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {tickets.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}–
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Sheet
        open={selectedId !== null}
        onOpenChange={(next) => {
          if (!next) closeDetail();
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-2xl">
          {detailLoading ? (
            <div className="flex h-full items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailError || !detail || !ticket ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={AlertTriangle}
                title="Ticket could not be opened"
                description={detailError ?? "The ticket details are unavailable."}
                action={
                  selectedId ? (
                    <Button variant="outline" size="sm" onClick={() => void openDetail(selectedId)}>
                      <RefreshCw className="h-4 w-4" />
                      Try again
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 pr-8">
                  <span className="font-mono text-sm text-muted-foreground">
                    #{ticket.ticket_number}
                  </span>
                  <span className="truncate">{ticket.subject}</span>
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`${basePath}/businesses/${ticket.account_id}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {detail.ticket.account?.name ?? "Unknown business"}
                    {detail.ticket.account?.slug ? ` (@${detail.ticket.account.slug})` : ""}
                  </Link>
                  <span>·</span>
                  <span>created {formatTimeAgo(ticket.created_at)}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-4 px-4 pb-4">
                <div className="flex flex-wrap gap-2">
                  {statusBadge(ticket.status)}
                  {priorityBadge(ticket.priority)}
                  {ticket.category && (
                    <Badge variant="secondary" className="text-xs">
                      {CATEGORY_OPTIONS.find((c) => c.value === ticket.category)?.label ??
                        ticket.category}
                    </Badge>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select
                      value={ticket.status}
                      disabled={savingKey !== null}
                      onValueChange={(v) => {
                        const next = typeof v === "string" ? v : null;
                        if (next && next !== ticket.status) {
                          void patchTicket(
                            { status: next },
                            "status",
                            `Ticket marked ${STATUS_OPTIONS.find((s) => s.value === next)?.label.toLowerCase() ?? next}`,
                          );
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            <span className="flex items-center gap-1.5">
                              <s.icon className="h-3.5 w-3.5" />
                              {s.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Priority</Label>
                    <Select
                      value={ticket.priority}
                      disabled={savingKey !== null}
                      onValueChange={(v) => {
                        const next = typeof v === "string" ? v : null;
                        if (next && next !== ticket.priority) {
                          void patchTicket({ priority: next }, "priority", "Priority updated");
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            <span className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${p.color}`} />
                              {p.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Category</Label>
                    <Select
                      value={ticket.category ?? "general"}
                      disabled={savingKey !== null || !categorySupported}
                      onValueChange={(v) => {
                        const next = typeof v === "string" ? v : null;
                        if (next && next !== ticket.category) {
                          void patchTicket({ category: next }, "category", "Category updated");
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!categorySupported && (
                      <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                        Category needs the <code>tickets.category</code> column — run{" "}
                        <code>supabase/migrations/077_crm20_stabilization.sql</code>.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Assigned Agent</Label>
                    <Select
                      value={ticket.assigned_agent_id ?? "__none__"}
                      disabled={savingKey !== null}
                      onValueChange={(v) => {
                        const next = typeof v === "string" && v !== "__none__" ? v : null;
                        if (next !== (ticket.assigned_agent_id ?? null)) {
                          void patchTicket(
                            { assigned_agent_id: next },
                            "assignee",
                            next
                              ? `Assigned to ${detail.agents.find((a) => a.user_id === next)?.full_name ?? "agent"}`
                              : "Assignment cleared",
                          );
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {detail.agents.map((agent) => (
                          <SelectItem key={agent.user_id} value={agent.user_id}>
                            {agent.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {ticket.status !== "resolved" && ticket.status !== "closed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingKey !== null}
                      onClick={() =>
                        void patchTicket({ status: "resolved" }, "status", "Ticket marked resolved")
                      }
                    >
                      {savingKey === "status" ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      )}
                      Resolve
                    </Button>
                  )}
                  {(ticket.status === "resolved" || ticket.status === "closed") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingKey !== null}
                      onClick={() =>
                        void patchTicket({ status: "open" }, "status", "Ticket reopened")
                      }
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      Reopen
                    </Button>
                  )}
                  {ticket.status !== "closed" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={savingKey !== null}
                      onClick={() => setCloseConfirmOpen(true)}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      Close ticket
                    </Button>
                  )}
                </div>

                <Separator />

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Description</Label>
                  <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    {ticket.description || "No description provided."}
                  </p>
                </div>

                <div className="grid gap-3 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-2 font-medium text-foreground">Requester</p>
                    {detail.ticket.contact ? (
                      <div className="space-y-0.5 text-muted-foreground">
                        <p className="text-sm text-foreground">
                          {detail.ticket.contact.name ?? "Unnamed contact"}
                        </p>
                        {detail.ticket.contact.email && <p>{detail.ticket.contact.email}</p>}
                        {detail.ticket.contact.phone && <p>{detail.ticket.contact.phone}</p>}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        No contact linked to this ticket.
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-2 font-medium text-foreground">Activity</p>
                    <div className="space-y-1 text-muted-foreground">
                      <div className="flex justify-between gap-2">
                        <span>Created</span>
                        <span>{formatTimeAgo(ticket.created_at)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>Updated</span>
                        <span>{formatTimeAgo(ticket.updated_at)}</span>
                      </div>
                      {ticket.resolved_at && (
                        <div className="flex justify-between gap-2">
                          <span>Resolved</span>
                          <span>{formatTimeAgo(ticket.resolved_at)}</span>
                        </div>
                      )}
                      {ticket.closed_at && (
                        <div className="flex justify-between gap-2">
                          <span>Closed</span>
                          <span>{formatTimeAgo(ticket.closed_at)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <span>Assignee</span>
                        <span>{detail.assignee?.full_name ?? "Unassigned"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Timeline</Label>
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    {detail.timeline.map((entry, index) => (
                      <div key={`${entry.at}-${index}`} className="flex items-start gap-3">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            entry.kind === "note"
                              ? "bg-amber-500"
                              : entry.kind === "resolved" || entry.kind === "closed"
                                ? "bg-green-500"
                                : "bg-primary"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-foreground">{entry.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Conversation ({detail.comments.length})</Label>
                  {detail.comments.length === 0 ? (
                    <EmptyState
                      icon={MessageSquare}
                      title="No messages yet"
                      description="Replies and internal notes added here appear in the thread."
                      className="py-8"
                    />
                  ) : (
                    <div className="flex flex-col gap-3">
                      {detail.comments.map((comment) => (
                        <div
                          key={comment.id}
                          className={
                            comment.is_internal
                              ? "rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40"
                              : "rounded-lg border border-border bg-background p-3"
                          }
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium">
                                {comment.author?.full_name ?? "Unknown"}
                              </span>
                              {comment.is_internal && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-400 text-[10px] text-amber-800 dark:border-amber-600 dark:text-amber-300"
                                >
                                  Internal note — not visible to the customer
                                </Badge>
                              )}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatTimeAgo(comment.created_at)}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator className="my-2" />

                  <div className="flex flex-col gap-2">
                    <Textarea
                      rows={3}
                      placeholder={
                        isInternal
                          ? "Write an internal note (the customer never sees this)..."
                          : "Write a reply to the customer..."
                      }
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      disabled={postingComment}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setIsInternal(false)}
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            !isInternal
                              ? "bg-muted text-foreground"
                              : "bg-muted/50 text-muted-foreground"
                          }`}
                        >
                          Public reply
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsInternal(true)}
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            isInternal
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-muted/50 text-muted-foreground"
                          }`}
                        >
                          Internal note
                        </button>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void postComment()}
                        disabled={postingComment || !commentBody.trim()}
                      >
                        {postingComment ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="mr-1 h-3.5 w-3.5" />
                        )}
                        {postingComment ? "Sending…" : "Send"}
                      </Button>
                    </div>
                    {isInternal && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        Internal note — not visible to the customer.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Close ticket {ticket ? `#${ticket.ticket_number}` : ""}?
            </DialogTitle>
            <DialogDescription>
              Closing marks this conversation as finished. You can reopen it at any time from
              this panel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={savingKey !== null} onClick={confirmClose}>
              {savingKey === "status" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Close ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
