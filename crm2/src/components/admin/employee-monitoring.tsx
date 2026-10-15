"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { cn } from "@/lib/utils"
import { relativeTime } from "@/lib/crm/leads"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  RefreshCw, Users, AlertTriangle, Inbox, Clock,
  CheckCircle2, CalendarClock, TrendingUp,
  ExternalLink, History, X, ScrollText,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────

interface EmployeeStat {
  user_id: string
  full_name: string | null
  email: string
  account_role: string | null
  avatar_url: string | null
  presence_status: "online" | "away" | null
  last_seen_at: string | null
  assigned_total: number
  leads_new: number
  leads_contacted: number
  leads_qualified: number
  leads_converted: number
  leads_lost: number
  followups_due: number
  followups_today: number
  followups_overdue: number
  leads_overdue: number
}

interface TimelineEntry {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  details: Record<string, unknown> | null
  created_at: string
  actor_email: string | null
}

interface AssignedLead {
  id: string
  title: string
  status: string
  priority: string | null
  created_at: string
  contact: { name: string | null; phone: string; lead_status: string | null } | null
  followup: { due_date: string | null; status: string } | null
}

// ── Helpers ────────────────────────────────────────────────────

function presenceStatus(status: "online" | "away" | null, lastSeenAt: string | null) {
  if (!lastSeenAt) return { label: "Offline", dot: "bg-slate-400", badge: "bg-slate-400/10 text-slate-500 ring-slate-400/20" }
  const diffMin = (Date.now() - new Date(lastSeenAt).getTime()) / 60_000
  if (diffMin > 10) return { label: "Offline", dot: "bg-slate-400", badge: "bg-slate-400/10 text-slate-500 ring-slate-400/20" }
  if (status === "away" || diffMin > 5) return { label: "Away", dot: "bg-amber-400", badge: "bg-amber-400/10 text-amber-500 ring-amber-400/20" }
  return { label: "Online", dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20" }
}

function initials(name: string | null, email: string) {
  return (name ?? email).charAt(0).toUpperCase()
}

function actionLabel(action: string): { label: string; color: string; icon: string } {
  const map: Record<string, { label: string; color: string; icon: string }> = {
    "contact.created":        { label: "New lead created",       color: "text-sky-500",     icon: "🆕" },
    "member.joined":          { label: "Joined organisation",    color: "text-primary",     icon: "👤" },
    "member.role_changed":    { label: "Role changed",           color: "text-amber-500",   icon: "🔄" },
    "broadcast.created":      { label: "Broadcast created",      color: "text-violet-500",  icon: "📢" },
    "invitation.created":     { label: "Invitation sent",        color: "text-blue-500",    icon: "✉️" },
    "whatsapp.connected":     { label: "WhatsApp connected",     color: "text-emerald-500", icon: "✅" },
    "whatsapp.disconnected":  { label: "WhatsApp disconnected",  color: "text-red-500",     icon: "❌" },
    "super_admin.view_org_as_admin": { label: "Viewed org as admin", color: "text-amber-500", icon: "👁️" },
  }
  return map[action] ?? { label: action, color: "text-muted-foreground", icon: "📋" }
}

// ── Main component ─────────────────────────────────────────────

export function EmployeeMonitoring() {
  const [employees, setEmployees] = useState<EmployeeStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState<EmployeeStat | null>(null)
  const [empSearch, setEmpSearch] = useState("")

  const load = useCallback(async () => {
    const supabase = createClient()
    setError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc("get_employee_lead_stats")
      if (rpcErr) { setError(rpcErr.message); return }
      setEmployees((data as EmployeeStat[] | null) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employee stats")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => void load(), 800)
  }, [load])

  useEffect(() => {
    const supabase = createClient()
    const channel: RealtimeChannel = supabase
      .channel("super-admin-employee-monitoring")
      .on("postgres_changes", { event: "*", schema: "public", table: "member_presence" }, () => scheduleReload())
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => scheduleReload())
      .on("postgres_changes", { event: "*", schema: "public", table: "follow_ups" }, () => scheduleReload())
      .subscribe((s) => setConnected(s === "SUBSCRIBED"))
    return () => { void supabase.removeChannel(channel) }
  }, [scheduleReload])

  const totalAssigned    = employees.reduce((s, e) => s + e.assigned_total, 0)
  const totalNew         = employees.reduce((s, e) => s + e.leads_new, 0)
  const totalOverdue     = employees.reduce((s, e) => s + e.leads_overdue, 0)
  const totalConverted   = employees.reduce((s, e) => s + e.leads_converted, 0)
  const totalFollowups   = employees.reduce((s, e) => s + e.followups_today, 0)
  const onlineCount      = employees.filter((e) => e.last_seen_at && (Date.now() - new Date(e.last_seen_at).getTime()) / 60_000 <= 10).length
  const offlineCount     = employees.length - onlineCount

  const overviewCards = [
    { label: "Total Employees",   value: employees.length, icon: Users,        tone: "text-foreground" },
    { label: "Online Now",        value: onlineCount,      icon: Clock,        tone: "text-emerald-500" },
    { label: "Offline",           value: offlineCount,     icon: Clock,        tone: "text-slate-400" },
    { label: "Total Assigned",    value: totalAssigned,    icon: TrendingUp,   tone: "text-sky-500" },
    { label: "Follow-ups Today",  value: totalFollowups,   icon: CalendarClock,tone: "text-amber-500" },
    { label: "Overdue",           value: totalOverdue,     icon: AlertTriangle,tone: "text-red-500" },
    { label: "Converted",         value: totalConverted,   icon: CheckCircle2, tone: "text-emerald-500" },
    { label: "New Leads",         value: totalNew,         icon: TrendingUp,   tone: "text-sky-500" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">Employee Monitoring</h2>
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
              connected ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/30" : "bg-muted text-muted-foreground ring-border",
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-muted-foreground")} />
              {connected ? "Live" : "Offline"}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground">
            Real-time lead and activity overview for every employee. Click an employee to view their activity timeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" placeholder="Search employees…" value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48" />
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
          <Link href="/super-admin/leads">
            <Button variant="outline" size="sm">
              <ExternalLink className="size-4" /> Lead Monitoring
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />{error}
          </CardContent>
        </Card>
      )}

      {/* Overview cards */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        {overviewCards.map((c) => (
          <Card key={c.label} className="border-border bg-card">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold", c.tone)}>{loading ? "—" : c.value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Employee cards */}
      {loading ? (
        <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
          <RefreshCw className="size-5 animate-spin" /> Loading employees…
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <Inbox className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No employees found. Invite employees with Agent role to see them here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {employees
            .filter(e => !empSearch || (e.full_name ?? e.email).toLowerCase().includes(empSearch.toLowerCase()) || e.email.toLowerCase().includes(empSearch.toLowerCase()))
            .map((emp) => (
            <EmployeeCard key={emp.user_id} emp={emp} onViewTimeline={() => setSelectedEmp(emp)} />
          ))}
        </div>
      )}

      {/* Timeline panel */}
      {selectedEmp && (
        <TimelinePanel emp={selectedEmp} onClose={() => setSelectedEmp(null)} />
      )}
    </div>
  )
}

// ── Employee card ──────────────────────────────────────────────

function EmployeeCard({ emp, onViewTimeline }: { emp: EmployeeStat; onViewTimeline: () => void }) {
  const presence = presenceStatus(emp.presence_status, emp.last_seen_at)

  const stats = [
    { label: "Assigned",       value: emp.assigned_total,  tone: undefined },
    { label: "New",            value: emp.leads_new,       tone: emp.leads_new > 0 ? "text-sky-500" : undefined },
    { label: "Contacted",      value: emp.leads_contacted, tone: undefined },
    { label: "Qualified",      value: emp.leads_qualified, tone: emp.leads_qualified > 0 ? "text-violet-500" : undefined },
    { label: "Converted",      value: emp.leads_converted, tone: emp.leads_converted > 0 ? "text-emerald-500" : undefined },
    { label: "Lost",           value: emp.leads_lost,      tone: emp.leads_lost > 0 ? "text-destructive" : undefined },
    { label: "Follow-ups Due", value: emp.followups_due,   tone: emp.followups_due > 0 ? "text-amber-500" : undefined },
    { label: "Overdue",        value: emp.leads_overdue,   tone: emp.leads_overdue > 0 ? "text-red-500" : undefined },
  ]

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(emp.full_name, emp.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{emp.full_name ?? emp.email}</p>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", presence.badge)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", presence.dot)} />
                {presence.label}
              </span>
              {emp.account_role && (
                <Badge variant="outline" className="text-[11px] capitalize">{emp.account_role}</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{emp.email}</p>
            {emp.last_seen_at && (
              <p className="mt-0.5 text-xs text-muted-foreground">Last active: {relativeTime(emp.last_seen_at)}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-muted/30 px-2 py-2 text-center">
              <p className={cn("text-lg font-bold leading-none", s.tone ?? "text-foreground")}>{s.value}</p>
              <p className="mt-1 text-[10px] text-muted-foreground leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {(emp.leads_overdue > 0 || emp.followups_overdue > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
            <AlertTriangle className="size-3.5 shrink-0 text-red-500" />
            <span className="text-xs text-red-500">
              {emp.leads_overdue > 0 && `${emp.leads_overdue} overdue lead${emp.leads_overdue !== 1 ? "s" : ""}`}
              {emp.leads_overdue > 0 && emp.followups_overdue > 0 && " · "}
              {emp.followups_overdue > 0 && `${emp.followups_overdue} overdue follow-up${emp.followups_overdue !== 1 ? "s" : ""}`}
            </span>
          </div>
        )}

        {emp.assigned_total === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Inbox className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">No leads assigned</span>
          </div>
        )}

        {/* View Timeline button */}
        <Button variant="outline" size="sm" className="w-full" onClick={onViewTimeline}>
          <History className="size-4" />
          View Details &amp; Leads
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Timeline panel ─────────────────────────────────────────────

function TimelinePanel({ emp, onClose }: { emp: EmployeeStat; onClose: () => void }) {
  const [tab, setTab] = useState<"leads" | "timeline">("leads")
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [leads, setLeads] = useState<AssignedLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      setLoading(true)
      setError(null)
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("account_id")
          .eq("user_id", emp.user_id)
          .maybeSingle()

        if (!profile?.account_id) { setLoading(false); return }

        // Load assigned leads
        const { data: dealsData } = await supabase
          .from("deals")
          .select("id, title, status, priority, created_at, contact:contacts(name, phone, lead_status)")
          .eq("assigned_to", emp.user_id)
          .eq("account_id", profile.account_id)
          .order("created_at", { ascending: false })
          .limit(50)

        if (dealsData) {
          const leadsWithFollowups = await Promise.all(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (dealsData as any[]).map(async (deal) => {
              const contactId = Array.isArray(deal.contact) ? deal.contact[0]?.id : deal.contact?.id
              const { data: fu } = await supabase
                .from("follow_ups")
                .select("due_date, status")
                .eq("contact_id", contactId ?? deal.id)
                .eq("status", "pending")
                .order("due_date", { ascending: true })
                .limit(1)
                .maybeSingle()
              const contact = Array.isArray(deal.contact) ? deal.contact[0] ?? null : deal.contact ?? null
              return { ...deal, contact, followup: fu ?? null } as AssignedLead
            })
          )
          setLeads(leadsWithFollowups)
        }

        // Load timeline
        const { data: auditData, error: auditErr } = await supabase
          .from("audit_log")
          .select("id, action, resource_type, resource_id, details, created_at, actor_email")
          .eq("account_id", profile.account_id)
          .eq("actor_user_id", emp.user_id)
          .order("created_at", { ascending: false })
          .limit(50)

        if (auditErr) {
          const { data: fallback } = await supabase
            .from("audit_log")
            .select("id, action, resource_type, resource_id, details, created_at, actor_email")
            .eq("account_id", profile.account_id)
            .order("created_at", { ascending: false })
            .limit(50)
          setEntries((fallback as TimelineEntry[] | null) ?? [])
        } else {
          setEntries((auditData as TimelineEntry[] | null) ?? [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [emp.user_id])

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const presence = presenceStatus(emp.presence_status, emp.last_seen_at)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(emp.full_name, emp.email)}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{emp.full_name ?? emp.email}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", presence.badge)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", presence.dot)} />
                  {presence.label}
                </span>
                <span className="text-xs text-muted-foreground">{emp.email}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
          {[
            { label: "Assigned", value: emp.assigned_total },
            { label: "Converted", value: emp.leads_converted },
            { label: "Overdue", value: emp.leads_overdue },
            { label: "Follow-ups", value: emp.followups_due },
          ].map((s) => (
            <div key={s.label} className="bg-card px-3 py-3 text-center">
              <p className="text-lg font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          <button type="button" onClick={() => setTab("leads")}
            className={cn("flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === "leads" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
            Assigned Leads ({leads.length})
          </button>
          <button type="button" onClick={() => setTab("timeline")}
            className={cn("flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === "timeline" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
            Activity Timeline
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
              <RefreshCw className="size-5 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="m-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />{error}
            </div>
          ) : tab === "leads" ? (
            <LeadsTab leads={leads} />
          ) : (
            <TimelineTab entries={entries} />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 shrink-0">
          <p className="text-xs text-muted-foreground text-center">
            Super Admin view only · Data from audit_log &amp; deals
          </p>
        </div>
      </div>
    </>
  )
}

// ── Leads tab ──────────────────────────────────────────────────

function LeadsTab({ leads }: { leads: AssignedLead[] }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const statusColors: Record<string, string> = {
    new: "bg-sky-500/10 text-sky-500",
    contacted: "bg-blue-500/10 text-blue-500",
    qualified: "bg-violet-500/10 text-violet-500",
    proposal: "bg-amber-500/10 text-amber-500",
    negotiation: "bg-orange-500/10 text-orange-500",
    won: "bg-emerald-500/10 text-emerald-500",
    lost: "bg-destructive/10 text-destructive",
    open: "bg-sky-500/10 text-sky-500",
  }
  const priorityColors: Record<string, string> = {
    urgent: "text-red-500", high: "text-orange-500",
    medium: "text-amber-500", low: "text-muted-foreground",
  }

  const filtered = leads.filter((l) => {
    const c = l.contact
    const name = (c?.name ?? l.title).toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase())
    const displayStatus = c?.lead_status ?? l.status
    const matchStatus = statusFilter === "all" || displayStatus === statusFilter || l.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <input type="text" placeholder="Search leads…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="all">All</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="won">Converted</option>
          <option value="lost">Lost</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <Inbox className="size-7 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No leads found.</p>
        </div>
      ) : filtered.map((lead) => {
        const c = lead.contact
        const displayStatus = c?.lead_status ?? lead.status
        return (
          <div key={lead.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground truncate">{c?.name ?? lead.title}</p>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                statusColors[displayStatus] ?? "bg-muted text-muted-foreground")}>
                {displayStatus}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              {lead.priority && (
                <span className={cn("font-medium capitalize", priorityColors[lead.priority] ?? "")}>
                  {lead.priority} priority
                </span>
              )}
              <span>Assigned {new Date(lead.created_at).toLocaleDateString()}</span>
              {lead.followup?.due_date && (
                <span className={cn(
                  new Date(lead.followup.due_date) < new Date() ? "text-red-500" : "text-amber-500"
                )}>
                  Follow-up {new Date(lead.followup.due_date).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Timeline tab ───────────────────────────────────────────────

function TimelineTab({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <Inbox className="size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          Activity appears here when the employee creates contacts, sends broadcasts, or connects WhatsApp.
        </p>
      </div>
    )
  }
  return (
    <div className="px-5 py-4">
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-4 pl-10">
          {entries.map((entry) => {
            const info = actionLabel(entry.action)
            const date = new Date(entry.created_at)
            return (
              <div key={entry.id} className="relative">
                <div className="absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-border bg-card text-[11px]">
                  {info.icon}
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-sm font-medium", info.color)}>{info.label}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {date.toLocaleDateString()} · {entry.resource_type}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
