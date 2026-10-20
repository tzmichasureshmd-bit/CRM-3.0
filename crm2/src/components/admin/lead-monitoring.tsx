"use client"

// Super Admin → Lead Monitoring.
//
// Cross-tenant live view of every lead (a `deals` row) across all
// customer accounts. All numbers are REAL database counts via the
// get_platform_lead_stats() RPC; the table hydrates the most recent
// leads with contact / customer / assignee / stage and the per-lead
// notification-alert state. Realtime keeps new leads visible the
// moment they're inserted by WhatsApp / Google Forms / Meta / manual
// entry — without a reload.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { cn } from "@/lib/utils"
import {
  stageProgress,
  sourceBadgeInfo,
  relativeTime,
  waLink,
  initials,
} from "@/lib/crm/leads"
import type { PlatformLeadStats, LeadNotificationEvent } from "@/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Search,
  RefreshCw,
  BellRing,
  Building2,
  User,
  Phone,
  Mail,
  CalendarClock,
  AlertTriangle,
  Send,
  ExternalLink,
  Inbox,
} from "lucide-react"

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

interface MonitorStage {
  id: string
  pipeline_id: string
  name: string
  position: number
  color: string
  created_at: string
}

interface MonitorContact {
  id: string
  name?: string | null
  phone?: string | null
  email?: string | null
  source?: string | null
  source_platform?: string | null
  lead_status?: string | null
}

interface MonitorDeal {
  id: string
  title: string
  status: string
  created_at: string
  pipeline_id: string
  stage_id: string
  contact?: MonitorContact | null
  assignee?: { id: string; full_name?: string | null } | null
  account?: { id: string; name?: string | null } | null
  stage?: MonitorStage | null
}

interface FollowUpRow {
  id: string
  contact_id: string
  status: string
  due_date?: string | null
}

interface AlertSummary {
  title: string
  className: string
}

// Time-window helper kept at module scope (never instantiated inside
// the component body) — matches the codebase's render-purity lint.
function rangeStartIso(range: string): string | null {
  const now = new Date()
  switch (range) {
    case "today": {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d.toISOString()
    }
    case "week": {
      const d = new Date(now)
      const day = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - day)
      d.setHours(0, 0, 0, 0)
      return d.toISOString()
    }
    case "month": {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
      return d.toISOString()
    }
    default:
      return null
  }
}

export function LeadMonitoring() {
  const [stats, setStats] = useState<PlatformLeadStats | null>(null)
  const [deals, setDeals] = useState<MonitorDeal[]>([])
  const [stages, setStages] = useState<MonitorStage[]>([])
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([])
  const [eventsByDeal, setEventsByDeal] = useState<Map<string, LeadNotificationEvent[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [selected, setSelected] = useState<MonitorDeal | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 50

  // Filters
  const [search, setSearch] = useState("")
  const [customer, setCustomer] = useState("all")
  const [source, setSource] = useState("all")
  const [stage, setStage] = useState("all")
  const [status, setStatus] = useState("all")
  const [agent, setAgent] = useState("all")
  const [range, setRange] = useState("all")
  const [alertFilter, setAlertFilter] = useState("all")

  const load = useCallback(async () => {
    const supabase = createClient()
    setError(null)
    try {
      const [statsRes, dealsRes, stagesRes, followUpsRes, eventsRes] = await Promise.all([
        supabase.rpc("get_platform_lead_stats"),
        supabase
          .from("deals")
          .select(
            "id, title, status, created_at, pipeline_id, stage_id, " +
              "contact:contacts(id, name, phone, email, source, source_platform, lead_status), " +
              "assignee:profiles!deals_assigned_to_fkey(id, full_name), " +
              "account:accounts(id, name), " +
              "stage:pipeline_stages(id, name, position, color, pipeline_id)",
          )
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("pipeline_stages")
          .select("id, pipeline_id, name, position, color, created_at"),
        supabase
          .from("follow_ups")
          .select("id, contact_id, status, due_date")
          .eq("status", "pending"),
        supabase
          .from("lead_notification_events")
          .select("id, deal_id, account_id, recipient_email, status, retry_count, error_message, created_at, sent_at")
          .order("created_at", { ascending: false })
          .limit(1000),
      ])

      if (statsRes.error) {
        setError(statsRes.error.message)
      } else {
        setStats(statsRes.data as PlatformLeadStats)
      }
      if (dealsRes.error) setError(dealsRes.error.message)
      else setDeals((dealsRes.data as unknown as MonitorDeal[] | null) ?? [])
      if (stagesRes.error) setError(stagesRes.error.message)
      else setStages((stagesRes.data as unknown as MonitorStage[] | null) ?? [])
      if (followUpsRes.error) setError(followUpsRes.error.message)
      else setFollowUps((followUpsRes.data as unknown as FollowUpRow[] | null) ?? [])
      if (eventsRes.error) setError(eventsRes.error.message)
      else {
        const rows = (eventsRes.data as unknown as LeadNotificationEvent[] | null) ?? []
        const map = new Map<string, LeadNotificationEvent[]>()
        for (const ev of rows) {
          const list = map.get(ev.deal_id) ?? []
          list.push(ev)
          map.set(ev.deal_id, list)
        }
        setEventsByDeal(map)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Realtime: refetch (debounced) when a deal or notification event
  // changes anywhere on the platform.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => void load(), 600)
  }, [load])

  useEffect(() => {
    const supabase = createClient()
    const channel: RealtimeChannel = supabase
      .channel("super-admin-lead-monitoring")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals" },
        () => scheduleReload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_notification_events" },
        () => scheduleReload(),
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"))

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [scheduleReload])

  // -------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------

  const stagesByPipeline = useMemo(() => {
    const map = new Map<string, MonitorStage[]>()
    const copy = [...stages].sort((a, b) => a.position - b.position)
    for (const s of copy) {
      const list = map.get(s.pipeline_id) ?? []
      list.push(s)
      map.set(s.pipeline_id, list)
    }
    return map
  }, [stages])

  const pendingFollowUps = useMemo(() => {
    const set = new Set<string>()
    for (const f of followUps) if (f.status === "pending") set.add(f.contact_id)
    return set
  }, [followUps])

  const alertSummary = useCallback(
    (dealId: string): AlertSummary | null => {
      const list = eventsByDeal.get(dealId)
      if (!list || list.length === 0) return null
      const sent = list.filter((e) => e.status === "sent").length
      const pending = list.filter((e) => e.status === "pending" || e.status === "sending").length
      const failed = list.filter((e) => e.status === "failed").length
      if (pending > 0 && failed === 0)
        return { title: `${pending}/${list.length} sending`, className: "border-amber-500/40 bg-amber-500/10 text-amber-500" }
      if (failed > 0 && sent > 0)
        return { title: `${failed} failed · ${sent} sent`, className: "border-destructive/40 bg-destructive/10 text-destructive" }
      if (failed > 0)
        return { title: `${failed}/${list.length} failed`, className: "border-destructive/40 bg-destructive/10 text-destructive" }
      return { title: `${list.length}/${list.length} sent`, className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" }
    },
    [eventsByDeal],
  )

  const progressOf = useCallback(
    (deal: MonitorDeal): number => {
      if (!deal.stage) return 0
      return stageProgress(deal.stage, stagesByPipeline.get(deal.pipeline_id) ?? [])
    },
    [stagesByPipeline],
  )

  const alertTone = useCallback(
    (dealId: string): "none" | "sent" | "pending" | "failed" | "mixed" => {
      const list = eventsByDeal.get(dealId)
      if (!list || list.length === 0) return "none"
      const hasPending = list.some((e) => e.status === "pending" || e.status === "sending")
      const hasFailed = list.some((e) => e.status === "failed")
      const hasSent = list.some((e) => e.status === "sent")
      if (hasPending) return "pending"
      if (hasFailed && hasSent) return "mixed"
      if (hasFailed) return "failed"
      return "sent"
    },
    [eventsByDeal],
  )

  // Filter option lists
  const customerOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of deals) if (d.account?.id && d.account.name) seen.set(d.account.id, d.account.name)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [deals])

  const sourceOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of deals) {
      const info = sourceBadgeInfo(d.contact?.source ?? null, d.contact?.source_platform ?? null)
      if (info) seen.set(info.label, info.label)
    }
    return [...seen.keys()].sort()
  }, [deals])

  const stageOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of deals) if (d.stage?.id && d.stage.name) seen.set(d.stage.id, d.stage.name)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [deals])

  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of deals) if (d.assignee?.id && d.assignee.full_name) seen.set(d.assignee.id, d.assignee.full_name)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [deals])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const startIso = rangeStartIso(range)
    return deals.filter((d) => {
      if (customer !== "all" && d.account?.id !== customer) return false
      if (stage !== "all" && d.stage?.id !== stage) return false
      if (status !== "all" && d.status !== status) return false
      if (agent !== "all" && d.assignee?.id !== agent) return false
      if (source !== "all") {
        const info = sourceBadgeInfo(d.contact?.source ?? null, d.contact?.source_platform ?? null)
        if (!info || info.label !== source) return false
      }
      if (startIso && d.created_at < startIso) return false
      if (alertFilter !== "all" && alertTone(d.id) !== alertFilter) return false
      if (q) {
        const hay = [
          d.contact?.name,
          d.contact?.phone,
          d.contact?.email,
          d.title,
          d.account?.name,
          d.assignee?.full_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [deals, search, customer, source, stage, status, agent, range, alertFilter, alertTone])

  const visible = filtered.slice(0, page * pageSize)

  const statCards = [
    { label: "Total Leads", value: stats?.total_leads, href: "#" },
    { label: "New Today", value: stats?.new_today, href: "#" },
    { label: "New This Week", value: stats?.new_week, href: "#" },
    { label: "Qualified", value: stats?.qualified, href: "#" },
    { label: "Follow-up Required", value: stats?.follow_up_required, href: "#" },
    { label: "Converted", value: stats?.converted, href: "#" },
    { label: "Lost", value: stats?.lost, href: "#" },
  ]

  // -------------------------------------------------------------
  // Render
  // -------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">Lead Monitoring</h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                connected
                  ? "bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/30"
                  : "bg-muted text-muted-foreground ring-1 ring-border",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-muted-foreground")} />
              {connected ? "Live" : "Offline"}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground">
            Every lead across every customer account, with two-person email alert status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Link href="/super-admin/leads/alerts">
            <Button variant="outline" size="sm">
              <BellRing className="size-4" />
              Lead Alerts
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border bg-card">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                {s.value == null ? "—" : s.value.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert mini-strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <BellRing className="size-4 text-primary" />
          Email alerts
        </span>
        <span className="text-muted-foreground">
          Sent <span className="font-medium text-emerald-500">{stats?.alert_sent?.toLocaleString() ?? "—"}</span>
        </span>
        <span className="text-muted-foreground">
          Pending <span className="font-medium text-amber-500">{stats?.alert_pending?.toLocaleString() ?? "—"}</span>
        </span>
        <span className="text-muted-foreground">
          Failed <span className="font-medium text-red-500">{stats?.alert_failed?.toLocaleString() ?? "—"}</span>
        </span>
      </div>

      {/* Filters */}
      <Card className="border-border bg-card">
        <CardContent className="space-y-3 pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email, title, customer, agent…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <SelectFilter value={customer} onValueChange={(v) => setCustomer(v ?? "")} placeholder="All customers">
              {customerOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectFilter>
            <SelectFilter value={source} onValueChange={(v) => setSource(v ?? "")} placeholder="All sources">
              {sourceOptions.map((label) => (
                <SelectItem key={label} value={label}>{label}</SelectItem>
              ))}
            </SelectFilter>
            <SelectFilter value={stage} onValueChange={(v) => setStage(v ?? "")} placeholder="All stages">
              {stageOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectFilter>
            <SelectFilter value={status} onValueChange={(v) => setStatus(v ?? "")} placeholder="All statuses">
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectFilter>
            <SelectFilter value={agent} onValueChange={(v) => setAgent(v ?? "")} placeholder="All agents">
              {agentOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectFilter>
            <SelectFilter value={range} onValueChange={(v) => setRange(v ?? "")} placeholder="All time">
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
            </SelectFilter>
            <SelectFilter value={alertFilter} onValueChange={(v) => setAlertFilter(v ?? "")} placeholder="Alert: any">
              <SelectItem value="sent">Alert sent</SelectItem>
              <SelectItem value="pending">Alert pending</SelectItem>
              <SelectItem value="failed">Alert failed</SelectItem>
              <SelectItem value="none">No alert</SelectItem>
            </SelectFilter>
            {(search || customer !== "all" || source !== "all" || stage !== "all" || status !== "all" || agent !== "all" || range !== "all" || alertFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => {
                setSearch("")
                setCustomer("all")
                setSource("all")
                setStage("all")
                setStatus("all")
                setAgent("all")
                setRange("all")
                setAlertFilter("all")
              }}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Leads</CardTitle>
            <CardDescription>
              Showing {visible.length} of {filtered.length} recent leads (most recent {deals.length} loaded)
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
              <RefreshCw className="size-5 animate-spin" />
              Loading leads…
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <Inbox className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No leads match the current filters.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Alerts</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((d) => {
                    const info = sourceBadgeInfo(d.contact?.source ?? null, d.contact?.source_platform ?? null)
                    const progress = progressOf(d)
                    const alert = alertSummary(d.id)
                    const followUp = d.contact?.id ? pendingFollowUps.has(d.contact.id) : false
                    return (
                      <TableRow key={d.id} className="cursor-pointer" onClick={() => setSelected(d)}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {initials(d.contact?.name ?? null, d.title)}
                            </div>
                            <div className="min-w-0">
                              <p className="max-w-45 truncate text-sm font-medium text-foreground">
                                {d.contact?.name ?? d.title}
                              </p>
                              <p className="max-w-45 truncate text-xs text-muted-foreground">{d.title}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {d.contact?.phone && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="size-3" />
                                {d.contact.phone}
                              </span>
                            )}
                            {d.contact?.email && (
                              <span className="flex max-w-48 items-center gap-1 truncate text-xs text-muted-foreground">
                                <Mail className="size-3" />
                                {d.contact.email}
                              </span>
                            )}
                            {!d.contact?.phone && !d.contact?.email && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.account?.name ?? "—"}</TableCell>
                        <TableCell>
                          {info ? (
                            <Badge className={cn("border", info.className)}>{info.label}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: d.stage?.color ?? "#64748b" }}
                            />
                            <span className="text-sm text-foreground">{d.stage?.name ?? "—"}</span>
                            <span className="text-[11px] text-muted-foreground">{progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {d.assignee?.full_name ?? "Unassigned"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {alert ? (
                            <Badge className={cn("border", alert.className)}>{alert.title}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No alert</span>
                          )}
                          {followUp && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                              Follow-up
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm text-foreground">{relativeTime(d.created_at)}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(d.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {filtered.length > visible.length && (
                <div className="flex justify-center border-t border-border p-3">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                    Load more ({filtered.length - visible.length} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selected && (
        <LeadDetailDialog
          deal={selected}
          progress={progressOf(selected)}
          events={eventsByDeal.get(selected.id) ?? []}
          hasFollowUp={selected.contact?.id ? pendingFollowUps.has(selected.contact.id) : false}
          stages={stagesByPipeline.get(selected.pipeline_id) ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------

function SelectFilter({
  value,
  onValueChange,
  placeholder,
  children,
}: {
  value: string
  onValueChange: (v: string | null) => void
  placeholder: string
  children: React.ReactNode
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-fit">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "won"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : status === "lost"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-sky-500/40 bg-sky-500/10 text-sky-500"
  return (
    <Badge className={cn("border capitalize", tone)}>{status}</Badge>
  )
}

function EventStatusBadge({ status }: { status: string }) {
  const tone =
    status === "sent"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : status === "failed"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-amber-500/40 bg-amber-500/10 text-amber-500"
  return <Badge className={cn("border capitalize", tone)}>{status}</Badge>
}

// ---------------------------------------------------------------
// Lead detail dialog
// ---------------------------------------------------------------

function LeadDetailDialog({
  deal,
  progress,
  events,
  hasFollowUp,
  stages,
  onClose,
}: {
  deal: MonitorDeal
  progress: number
  events: LeadNotificationEvent[]
  hasFollowUp: boolean
  stages: MonitorStage[]
  onClose: () => void
}) {
  const info = sourceBadgeInfo(deal.contact?.source ?? null, deal.contact?.source_platform ?? null)
  const wa = waLink(deal.contact?.phone ?? null)
  const stageIdx = stages.findIndex((s) => s.id === deal.stage_id)

  const rows: Array<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = [
    {
      icon: <User className="size-4" />,
      label: "Contact",
      value: deal.contact?.name ?? deal.title,
    },
    {
      icon: <Phone className="size-4" />,
      label: "Phone",
      value: deal.contact?.phone ?? "—",
    },
    {
      icon: <Mail className="size-4" />,
      label: "Email",
      value: deal.contact?.email ?? "—",
    },
    {
      icon: <Building2 className="size-4" />,
      label: "Customer",
      value: deal.account?.name ?? "—",
    },
    {
      icon: <Inbox className="size-4" />,
      label: "Source",
      value: info?.label ?? "Unknown",
    },
    {
      icon: <User className="size-4" />,
      label: "Assigned agent",
      value: deal.assignee?.full_name ?? "Unassigned",
    },
    {
      icon: <CalendarClock className="size-4" />,
      label: "Received",
      value: new Date(deal.created_at).toLocaleString(),
    },
  ]

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto border-border bg-popover">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {deal.contact?.name ?? deal.title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {deal.title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <StatusBadge status={deal.status} />
          {info && <Badge className={cn("border", info.className)}>{info.label}</Badge>}
          {hasFollowUp && (
            <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-500">Follow-up pending</Badge>
          )}
        </div>

        {/* Progress */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Pipeline stage · {deal.stage?.name ?? "—"}
            </span>
            <span className="font-medium text-foreground">
              {stageIdx < 0 ? "" : `Step ${stageIdx + 1}/${stages.length}`} · {progress}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Details */}
        <div className="grid gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {r.icon}
                {r.label}
              </span>
              <span className="max-w-64 truncate text-right text-sm font-medium text-foreground">{r.value}</span>
            </div>
          ))}
        </div>

        {/* Notifications for this lead */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Send className="size-4 text-primary" />
            Email notifications
          </p>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No alert was sent — lead alerts are either disabled or were off when this lead arrived.
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <div key={ev.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{ev.recipient_email}</p>
                    <p className="text-xs text-muted-foreground">
                      Attempts {ev.retry_count} · {ev.sent_at ? `sent ${new Date(ev.sent_at).toLocaleString()}` : `created ${new Date(ev.created_at).toLocaleString()}`}
                    </p>
                    {ev.error_message && (
                      <p className="mt-0.5 line-clamp-2 max-w-100 text-xs text-destructive">Error: {ev.error_message}</p>
                    )}
                  </div>
                  <EventStatusBadge status={ev.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {deal.account?.id && (
            <Link href={`/super-admin/businesses/${deal.account.id}`}>
              <Button variant="outline" size="sm">
                <ExternalLink className="size-4" />
                Customer
              </Button>
            </Link>
          )}
          {deal.contact?.email && (
            <a href={`mailto:${deal.contact.email}`}>
              <Button variant="outline" size="sm">
                <Mail className="size-4" />
                Email
              </Button>
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <Send className="size-4" />
                WhatsApp
              </Button>
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}