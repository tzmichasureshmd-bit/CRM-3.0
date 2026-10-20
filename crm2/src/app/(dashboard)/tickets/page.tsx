"use client"

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import {
  Plus,
  Search,
  Loader2,
  MessageSquare,
  User,
  Clock,
  Send,
  Eye,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Circle,
  CircleDot,
  Timer,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { describeError } from "@/lib/errors"
import { hasColumn } from "@/lib/db/schema"
import type { Ticket, TicketStatus, TicketPriority, TicketCategory, TicketComment, Profile, Contact } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"

const STATUS_OPTIONS: { value: TicketStatus; label: string; icon: typeof Circle }[] = [
  { value: "open", label: "Open", icon: CircleDot },
  { value: "in_progress", label: "In Progress", icon: Timer },
  { value: "waiting", label: "Waiting", icon: Clock },
  { value: "resolved", label: "Resolved", icon: CheckCircle2 },
  { value: "closed", label: "Closed", icon: XCircle },
]

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "bg-gray-500" },
  { value: "medium", label: "Medium", color: "bg-blue-500" },
  { value: "high", label: "High", color: "bg-orange-500" },
  { value: "urgent", label: "Urgent", color: "bg-red-500" },
]

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "feature_request", label: "Feature Request" },
  { value: "other", label: "Other" },
]

const STATUS_COLOR_MAP: Record<TicketStatus, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200",
  waiting: "bg-purple-100 text-purple-800 border-purple-200",
  resolved: "bg-green-100 text-green-800 border-green-200",
  closed: "bg-gray-100 text-gray-800 border-gray-200",
}

const PRIORITY_COLOR_MAP: Record<TicketPriority, string> = {
  low: "bg-gray-100 text-gray-800 border-gray-200",
  medium: "bg-blue-100 text-blue-800 border-blue-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  urgent: "bg-red-100 text-red-800 border-red-200",
}

interface TicketWithRelations extends Ticket {
  contact?: Contact | null
}

export default function TicketsPage() {
  const { accountId, user } = useAuth()

  const [tickets, setTickets] = useState<TicketWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all")
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all")
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "all">("all")
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize] = useState(25)

  // Detail view
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null)
  const [comments, setComments] = useState<TicketComment[]>([])
  const [newComment, setNewComment] = useState("")
  const [isInternalNote, setIsInternalNote] = useState(false)
  const [loadingComments, setLoadingComments] = useState(false)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    subject: "",
    description: "",
    priority: "medium" as TicketPriority,
    category: "general" as TicketCategory,
    assigned_agent_id: "",
    contact_id: "",
    tags: "",
  })

  // Agents list for assignment
  const [agents, setAgents] = useState<Profile[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])

  // True only when the `tickets.category` column (migration 066) exists.
  // When false the Category control is disabled with an explanation
  // instead of the insert silently failing.
  const [categorySupported, setCategorySupported] = useState(true)

  // Per-action busy flags so every button can show a real state.
  const [savingField, setSavingField] = useState<string | null>(null)
  const [savingComment, setSavingComment] = useState(false)

  const supabase = createClient()

  const loadAgents = useCallback(async () => {
    if (!accountId) return
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, user_id")
      .eq("account_id", accountId)
    if (data) setAgents(data as unknown as Profile[])
  }, [accountId, supabase])

  const loadContacts = useCallback(async () => {
    if (!accountId) return
    const { data } = await supabase
      .from("contacts")
      .select("id, name, phone, email")
      .eq("account_id", accountId)
      .limit(200)
    if (data) setContacts(data as unknown as Contact[])
  }, [accountId, supabase])

  const loadTickets = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    try {
      let query = supabase
        .from("tickets")
        .select("*, contact:contacts(id, name, phone, email)", { count: "exact" })
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter)
      }
      if (priorityFilter !== "all") {
        query = query.eq("priority", priorityFilter)
      }
      if (categoryFilter !== "all" && categorySupported) {
        query = query.eq("category", categoryFilter)
      }
      if (agentFilter !== "all") {
        query = query.eq("assigned_agent_id", agentFilter)
      }
      if (search.trim()) {
        const s = search.trim()
        query = query.or(`subject.ilike.%${s}%,description.ilike.%${s}%,ticket_number::text.ilike.%${s}%`)
      }

      const { data, error, count } = await query
      if (error) throw error
      setTickets((data ?? []) as TicketWithRelations[])
      setTotal(count ?? 0)
    } catch (err) {
      toast.error("Tickets could not be loaded", {
        description: describeError(err, "The ticket list request failed."),
      })
    } finally {
      setLoading(false)
    }
  }, [accountId, supabase, statusFilter, priorityFilter, categoryFilter, categorySupported, agentFilter, search, page, pageSize])

  const loadComments = useCallback(async (ticketId: string) => {
    setLoadingComments(true)
    try {
      const { data, error } = await supabase
        .from("ticket_comments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true })
      if (error) throw error
      setComments((data ?? []) as TicketComment[])
    } catch (err) {
      console.error("[TicketsPage] loadComments:", err)
    } finally {
      setLoadingComments(false)
    }
  }, [supabase])

  useEffect(() => {
    loadAgents()
    loadContacts()
    let cancelled = false
    hasColumn(supabase, "tickets", "category").then((ok) => {
      if (!cancelled) setCategorySupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [loadAgents, loadContacts, supabase])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, priorityFilter, categoryFilter, agentFilter])

  useEffect(() => {
    if (selectedTicket) {
      loadComments(selectedTicket.id)
    }
  }, [selectedTicket, loadComments])

  async function handleCreate() {
    if (!accountId || !user) return
    if (!form.subject.trim()) {
      toast.error("Subject is required", {
        description: "Enter a short ticket title before saving.",
      })
      return
    }
    setCreating(true)
    try {
      const tags = form.tags
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : []

      const payload: Record<string, unknown> = {
        account_id: accountId,
        subject: form.subject.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        status: "open" as TicketStatus,
        assigned_agent_id: form.assigned_agent_id || null,
        contact_id: form.contact_id || null,
        tags,
        created_by: user.id,
      }
      if (categorySupported) payload.category = form.category

      // Preferred: the atomic per-account number generator (migration
      // 066). If that function is not installed we do NOT fail the
      // save — the SERIAL column still hands out a unique number.
      const { data: nextNumber, error: nextError } = await supabase
        .rpc("next_ticket_number", { p_account_id: accountId })
      if (!nextError && typeof nextNumber === "number") {
        payload.ticket_number = nextNumber
      } else if (nextError) {
        console.warn("[TicketsPage] next_ticket_number unavailable:", nextError.message)
      }

      const { data, error } = await supabase
        .from("tickets")
        .insert(payload)
        .select("*, contact:contacts(id, name, phone, email)")
        .single()

      if (error) throw error

      const created = data as TicketWithRelations
      setTickets((prev) => [created, ...prev])
      setTotal((prev) => prev + 1)
      setCreateOpen(false)
      setForm({ subject: "", description: "", priority: "medium", category: "general", assigned_agent_id: "", contact_id: "", tags: "" })

      const agentName = getAgentName(created.assigned_agent_id)
      toast.success("Ticket created successfully", {
        description: [
          `Ticket #${created.ticket_number}`,
          STATUS_OPTIONS.find((s) => s.value === created.status)?.label ?? created.status,
          PRIORITY_OPTIONS.find((p) => p.value === created.priority)?.label ?? created.priority,
          agentName ? `Assigned to ${agentName}` : "Unassigned",
          new Date(created.created_at).toLocaleString(),
        ].join("  ·  "),
        duration: 8000,
      })
    } catch (err) {
      toast.error("Could not save ticket", {
        description: describeError(err, "The ticket could not be created."),
      })
    } finally {
      setCreating(false)
    }
  }

  async function handleStatusChange(ticketId: string, newStatus: TicketStatus) {
    setSavingField(`status:${ticketId}`)
    try {
      const update: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }
      if (newStatus === "resolved") update.resolved_at = new Date().toISOString()
      if (newStatus === "closed") update.closed_at = new Date().toISOString()

      const { error } = await supabase
        .from("tickets")
        .update(update)
        .eq("id", ticketId)
      if (error) throw error

      setTickets((prev) =>
        prev.map((tk) =>
          tk.id === ticketId ? { ...tk, ...update } as TicketWithRelations : tk
        )
      )
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) =>
          prev ? { ...prev, ...update } as TicketWithRelations : null
        )
      }
      toast.success(`Ticket ${newStatus.replace("_", " ")} — updated successfully`)
    } catch (err) {
      toast.error("Could not update status", {
        description: describeError(err, "The status change was rejected."),
      })
    } finally {
      setSavingField(null)
    }
  }

  async function handleFieldChange(ticketId: string, field: "priority" | "category", value: string) {
    if (field === "category" && !categorySupported) return
    setSavingField(`${field}:${ticketId}`)
    try {
      const { error } = await supabase
        .from("tickets")
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("id", ticketId)
      if (error) throw error

      setTickets((prev) =>
        prev.map((tk) =>
          tk.id === ticketId ? { ...tk, [field]: value } as TicketWithRelations : tk
        )
      )
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) => prev ? { ...prev, [field]: value } as TicketWithRelations : null)
      }
      toast.success("Ticket updated successfully")
    } catch (err) {
      toast.error("Could not save ticket", {
        description: describeError(err, "The change was rejected."),
      })
    } finally {
      setSavingField(null)
    }
  }

  async function handleAddComment() {
    if (!selectedTicket || !user || !newComment.trim()) return
    setSavingComment(true)
    try {
      const { data, error } = await supabase
        .from("ticket_comments")
        .insert({
          account_id: selectedTicket.account_id,
          ticket_id: selectedTicket.id,
          user_id: user.id,
          content: newComment.trim(),
          is_internal: isInternalNote,
        })
        .select("*")
        .single()
      if (error) throw error
      setComments((prev) => [...prev, data as TicketComment])
      setNewComment("")
      setIsInternalNote(false)
      toast.success(isInternalNote ? "Internal note added" : "Reply sent")
    } catch (err) {
      toast.error("Could not save comment", {
        description: describeError(err, "The comment was rejected."),
      })
    } finally {
      setSavingComment(false)
    }
  }

  async function handleAssignAgent(ticketId: string, agentId: string | null) {
    setSavingField(`assign:${ticketId}`)
    try {
      const { error } = await supabase
        .from("tickets")
        .update({ assigned_agent_id: agentId, updated_at: new Date().toISOString() })
        .eq("id", ticketId)
      if (error) throw error

      setTickets((prev) =>
        prev.map((tk) =>
          tk.id === ticketId ? { ...tk, assigned_agent_id: agentId } as TicketWithRelations : tk
        )
      )
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) => prev ? { ...prev, assigned_agent_id: agentId } as TicketWithRelations : null)
      }
      toast.success(agentId ? `Assigned to ${getAgentName(agentId) ?? "agent"}` : "Agent removed")
    } catch (err) {
      toast.error("Could not assign agent", {
        description: describeError(err, "The assignment was rejected."),
      })
    } finally {
      setSavingField(null)
    }
  }

  function getStatusBadge(status: TicketStatus) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR_MAP[status]}`}>
        {STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status}
      </span>
    )
  }

  function getPriorityBadge(priority: TicketPriority) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLOR_MAP[priority]}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_OPTIONS.find((p) => p.value === priority)?.color ?? ""}`} />
        {PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? priority}
      </span>
    )
  }

  function getAgentName(agentId: string | undefined) {
    if (!agentId) return "Unassigned"
    // assigned_agent_id references auth.users(id), which is
    // profiles.user_id — NOT profiles.id.
    const agent = agents.find((a) => a.user_id === agentId) ?? agents.find((a) => a.id === agentId)
    return agent?.full_name ?? "Unknown"
  }

  function formatTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  // Detail view
  if (selectedTicket) {
    return (
      <TooltipProvider>
        <div className="flex h-full flex-col gap-4 p-4 md:p-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedTicket(null); setComments([]) }}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                #{selectedTicket.ticket_number}
              </span>
              <h1 className="text-lg font-semibold">{selectedTicket.subject}</h1>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main content */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedTicket.description || "No description provided."}
                  </p>
                </CardContent>
              </Card>

              {/* Comments / Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Comments ({comments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingComments ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No comments yet.
                    </p>
                  ) : (
                    <ScrollArea className="max-h-96">
                      <div className="flex flex-col gap-4">
                        {comments.map((comment) => (
                          <div
                            key={comment.id}
                            className={`rounded-lg border p-3 ${
                              comment.is_internal
                                ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950"
                                : "border-border bg-background"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">
                                  {comment.user_id
                                    ? agents.find((a) => a.user_id === comment.user_id)?.full_name ?? "Agent"
                                    : "System"}
                                </span>
                                {/* 10px text on a transparent background:
                                 *  yellow-700 is only ~3.4:1 on white, under
                                 *  the 4.5:1 small-text floor. */}
                                {comment.is_internal && (
                                  <Badge variant="outline" className="border-yellow-400 text-[10px] text-yellow-800 dark:border-yellow-600 dark:text-yellow-300">
                                    Internal Note
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatTimeAgo(comment.created_at)}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}

                  <Separator className="my-4" />

                  {/* Add comment */}
                  <div className="flex flex-col gap-2">
                    <Textarea
                      placeholder={isInternalNote ? "Add an internal note..." : "Add a comment..."}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsInternalNote(!isInternalNote)}
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            isInternalNote
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isInternalNote ? "Internal Note" : "Public Comment"}
                        </button>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Send
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Details</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <Select
                      value={selectedTicket.status}
                      onValueChange={(v) => handleStatusChange(selectedTicket.id, v as TicketStatus)}
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
                    <span className="text-xs text-muted-foreground">Priority</span>
                    <Select
                      value={selectedTicket.priority}
                      disabled={savingField !== null}
                      onValueChange={(v) => handleFieldChange(selectedTicket.id, "priority", v ?? "")}
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
                    <span className="text-xs text-muted-foreground">Category</span>
                    <Select
                      value={selectedTicket.category ?? "general"}
                      disabled={!categorySupported}
                      onValueChange={(v) => handleFieldChange(selectedTicket.id, "category", v ?? "")}
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
                        <code>supabase/migrations/066_upgrade_features.sql</code>.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Assigned Agent</span>
                    <Select
                      value={selectedTicket.assigned_agent_id ?? "__none__"}
                      disabled={savingField !== null}
                      onValueChange={(v) =>
                        handleAssignAgent(selectedTicket.id, v === "__none__" ? null : v)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {agents.map((agent) => (
                          <SelectItem key={agent.user_id} value={agent.user_id}>
                            {agent.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  {selectedTicket.contact && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">Contact</span>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div>{selectedTicket.contact.name ?? "Unknown"}</div>
                          {selectedTicket.contact.phone && (
                            <div className="text-xs text-muted-foreground">{selectedTicket.contact.phone}</div>
                          )}
                          {selectedTicket.contact.email && (
                            <div className="text-xs text-muted-foreground">{selectedTicket.contact.email}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedTicket.tags.length > 0 && (
                    <>
                      <Separator />
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-muted-foreground">Tags</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedTicket.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Created</span>
                      <span>{formatTimeAgo(selectedTicket.created_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Updated</span>
                      <span>{formatTimeAgo(selectedTicket.updated_at)}</span>
                    </div>
                    {selectedTicket.resolved_at && (
                      <div className="flex justify-between">
                        <span>Resolved</span>
                        <span>{formatTimeAgo(selectedTicket.resolved_at)}</span>
                      </div>
                    )}
                    {selectedTicket.closed_at && (
                      <div className="flex justify-between">
                        <span>Closed</span>
                        <span>{formatTimeAgo(selectedTicket.closed_at)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // List view
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Support Tickets</h1>
            <p className="text-sm text-muted-foreground">
              Manage and track support requests
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Ticket
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs mb-1.5 block">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tickets..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="min-w-[140px]">
                <Label className="text-xs mb-1.5 block">Status</Label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TicketStatus | "all")}>
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
              <div className="min-w-[140px]">
                <Label className="text-xs mb-1.5 block">Priority</Label>
                <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as TicketPriority | "all")}>
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
              <div className="min-w-[150px]">
                <Label className="text-xs mb-1.5 block">Category</Label>
                <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as TicketCategory | "all")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs mb-1.5 block">Assigned Agent</Label>
                <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.user_id} value={agent.user_id}>
                        {agent.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ticket table */}
        <Card>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                <AlertCircle className="h-8 w-8" />
                <p className="text-sm">No tickets found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Ticket</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                      <TableHead className="w-[100px]">Priority</TableHead>
                      <TableHead className="w-[110px]">Category</TableHead>
                      <TableHead className="w-[140px]">Assigned To</TableHead>
                      <TableHead className="w-[100px]">Contact</TableHead>
                      <TableHead className="w-[80px]">Tags</TableHead>
                      <TableHead className="w-[90px]">Created</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.map((ticket) => (
                      <TableRow
                        key={ticket.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          #{ticket.ticket_number}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm truncate max-w-[300px]">
                            {ticket.subject}
                          </div>
                          {ticket.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[300px] mt-0.5">
                              {ticket.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                        <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ticket.category
                            ? CATEGORY_OPTIONS.find((c) => c.value === ticket.category)?.label ??
                              ticket.category
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {getAgentName(ticket.assigned_agent_id)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ticket.contact?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {ticket.tags.length > 0 && (
                            <div className="flex gap-1">
                              {ticket.tags.slice(0, 2).map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-[10px]">
                                  {tag}
                                </Badge>
                              ))}
                              {ticket.tags.length > 2 && (
                                <Badge variant="secondary" className="text-[10px]">
                                  +{ticket.tags.length - 2}
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimeAgo(ticket.created_at)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Circle className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedTicket(ticket)
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {STATUS_OPTIONS.map((s) => (
                                <DropdownMenuItem
                                  key={s.value}
                                  disabled={ticket.status === s.value}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleStatusChange(ticket.id, s.value)
                                  }}
                                >
                                  <s.icon className="h-4 w-4 mr-2" />
                                  {s.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {tickets.length > 0 ? (page - 1) * pageSize + 1 : 0}–
              {Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{total}</p>
                </div>
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Open</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    {tickets.filter((tk) => tk.status === "open").length}
                  </p>
                </div>
                <CircleDot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                  {/* yellow-600 on white is ~2.4:1 and yellow-500 ~1.9:1 —
                   *  below the 3:1 floor for large text and for the icon,
                   *  so "In Progress" was washed out in light mode (the
                   *  default). Darken for light, lighten for dark. */}
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                    {tickets.filter((tk) => tk.status === "in_progress").length}
                  </p>
                </div>
                <Timer className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Urgent</p>
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {tickets.filter((tk) => tk.priority === "urgent").length}
                  </p>
                </div>
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Ticket</DialogTitle>
              <DialogDescription>
                Open a new support ticket to track and resolve an issue.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Subject *</Label>
                <Input
                  placeholder="Brief summary of the issue"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Description</Label>
                <Textarea
                  placeholder="Detailed description..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Priority</Label>
                  <Select
                    value={form.priority}
                    onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TicketPriority }))}
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
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    disabled={!categorySupported}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v as TicketCategory }))}
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
                      <code>supabase/migrations/066_upgrade_features.sql</code>.
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Assigned Agent</Label>
                  <Select
                    value={(form.assigned_agent_id ?? "") || "__none__"}
                    onValueChange={(v) => setForm((f) => ({ ...f, assigned_agent_id: v === "__none__" ? "" : (v ?? "") }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {agents.map((agent) => (
                        <SelectItem key={agent.user_id} value={agent.user_id}>
                          {agent.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Contact</Label>
                  <Select
                    value={(form.contact_id ?? "") || "__none__"}
                    onValueChange={(v) => setForm((f) => ({ ...f, contact_id: v === "__none__" ? "" : (v ?? "") }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a contact..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No contact</SelectItem>
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name ?? contact.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tags (comma separated)</Label>
                <Input
                  placeholder="bug, login, urgent"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {creating ? "Saving…" : "Create Ticket"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
