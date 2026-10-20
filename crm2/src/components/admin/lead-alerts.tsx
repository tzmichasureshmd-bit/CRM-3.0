"use client"

// Super Admin → Lead Alerts.
//
// Delivery log for the automatic two-person "new lead" email alerts.
// Real DB stats (sent/pending/failed), per-recipient status, manual
// "process now" drain and one-click retry of failed sends. Realtime
// keeps the log live as the queue drains.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { cn } from "@/lib/utils"
import type {
  PlatformLeadNotificationSettings,
} from "@/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  RefreshCw,
  BellRing,
  Send,
  RotateCcw,
  AlertTriangle,
  Settings2,
  Inbox,
  Zap,
} from "lucide-react"

interface AlertRow {
  id: string
  deal_id: string
  recipient_email: string
  status: string
  retry_count: number
  error_message?: string | null
  created_at: string
  sent_at?: string | null
  deal?: {
    id: string
    title?: string | null
    contact?: { name?: string | null; phone?: string | null; email?: string | null } | null
    account?: { name?: string | null } | null
  } | null
}

interface AlertCounts {
  total: number
  sent: number
  pending: number
  failed: number
}

export function LeadAlerts() {
  const [rows, setRows] = useState<AlertRow[]>([])
  const [counts, setCounts] = useState<AlertCounts | null>(null)
  const [settings, setSettings] = useState<PlatformLeadNotificationSettings | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [recipientFilter, setRecipientFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const supabase = createClient()
    setError(null)
    try {
      const [rowsRes, countsRes, settingsRes] = await Promise.all([
        supabase
          .from("lead_notification_events")
          .select(
            "id, deal_id, recipient_email, status, retry_count, error_message, created_at, sent_at, " +
              "deal:deals(id, title, contact:contacts(name, phone, email), account:accounts(name))",
          )
          .order("created_at", { ascending: false })
          .limit(500),
        Promise.all([
          supabase.from("lead_notification_events").select("id", { count: "exact", head: true }),
          supabase.from("lead_notification_events").select("id", { count: "exact", head: true }).eq("status", "sent"),
          supabase
            .from("lead_notification_events")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "sending"]),
          supabase.from("lead_notification_events").select("id", { count: "exact", head: true }).eq("status", "failed"),
        ]),
        supabase
          .from("platform_lead_notification_settings")
          .select("*")
          .eq("id", 1)
          .maybeSingle(),
      ])

      if (rowsRes.error) setError(rowsRes.error.message)
      else setRows((rowsRes.data as unknown as AlertRow[] | null) ?? [])

      const [total, sent, pending, failed] = countsRes
      if (total.error || sent.error || pending.error || failed.error) {
        const firstErr = countsRes.find((r) => r.error)
        if (firstErr?.error) setError(firstErr.error.message)
      } else {
        setCounts({
          total: total.count ?? 0,
          sent: sent.count ?? 0,
          pending: pending.count ?? 0,
          failed: failed.count ?? 0,
        })
      }
      if (settingsRes.error) setError(settingsRes.error.message)
      else setSettings((settingsRes.data as PlatformLeadNotificationSettings | null) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alert log")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Realtime — keep the log live as the queue drains and new leads land.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => void load(), 600)
  }, [load])

  useEffect(() => {
    const supabase = createClient()
    const channel: RealtimeChannel = supabase
      .channel("super-admin-lead-alerts")
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

  const recipientOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const r of rows) if (r.recipient_email) seen.add(r.recipient_email)
    return [...seen]
  }, [rows])

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (statusFilter === "all" || r.status === statusFilter) &&
          (recipientFilter === "all" || r.recipient_email === recipientFilter),
      ),
    [rows, statusFilter, recipientFilter],
  )

  const failedCount = filtered.filter((r) => r.status === "failed").length

  const processNow = useCallback(async () => {
    setProcessing(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/lead-notifications/process", { method: "POST" })
      const body = (await res.json()) as {
        ok?: boolean
        error?: string
        sent?: number
        retryable?: number
        failed?: number
      }
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Process request failed")
        return
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Process request failed")
    } finally {
      setProcessing(false)
    }
  }, [load])

  const retryFailed = useCallback(async () => {
    const ids = filtered.filter((r) => r.status === "failed").map((r) => r.id)
    if (ids.length === 0) return
    setRetrying(true)
    setError(null)
    setBusyIds(new Set(ids))
    try {
      const res = await fetch("/api/admin/lead-notifications/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const body = (await res.json()) as { ok?: boolean; error?: string; reset?: number }
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Retry request failed")
        return
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry request failed")
    } finally {
      setRetrying(false)
      setBusyIds(new Set())
    }
  }, [filtered, load])

  const statCards = [
    { label: "Total Alerts", value: counts?.total, tone: "text-foreground" },
    { label: "Sent", value: counts?.sent, tone: "text-emerald-500" },
    { label: "Pending", value: counts?.pending, tone: "text-amber-500" },
    { label: "Failed", value: counts?.failed, tone: "text-red-500" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">Lead Alerts</h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                connected
                  ? "bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/30"
                  : "bg-muted text-muted-foreground ring-1 ring-border",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  connected ? "bg-emerald-500" : "bg-muted-foreground",
                )}
              />
              {connected ? "Live log" : "Offline"}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground">
            Delivery log for the automatic two-person new-lead emails.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void processNow()}
            disabled={processing}
          >
            <Zap className="size-4" />
            {processing ? "Processing…" : "Process now"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void retryFailed()}
            disabled={retrying || failedCount === 0}
          >
            <RotateCcw className="size-4" />
            Retry failed ({failedCount})
          </Button>
          <Link href="/super-admin/settings">
            <Button variant="outline" size="sm">
              <Settings2 className="size-4" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Alert configuration strip */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <BellRing className="size-4 text-primary" />
            Configuration
          </span>
          {settings ? (
            <>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
                  settings.enabled
                    ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/30"
                    : "bg-amber-500/10 text-amber-500 ring-amber-500/30",
                )}
              >
                {settings.enabled ? "Enabled" : "Disabled"}
              </span>
              <span className="text-muted-foreground">
                Recipient 1{" "}
                <span className="font-medium text-foreground">{settings.recipient_1_email ?? "—"}</span>
              </span>
              <span className="text-muted-foreground">
                Recipient 2{" "}
                <span className="font-medium text-foreground">{settings.recipient_2_email ?? "—"}</span>
              </span>
              <span className="text-muted-foreground">
                From{" "}
                <span className="font-medium text-foreground">
                  {settings.from_name} &lt;{settings.from_email}&gt;
                </span>
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              No configuration loaded — check the notification settings.
            </span>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border bg-card">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold", s.tone)}>
                {s.value == null ? "—" : s.value.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-fit">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sending">Sending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={recipientFilter} onValueChange={(v) => setRecipientFilter(v ?? "all")}>
          <SelectTrigger className="w-fit">
            <SelectValue placeholder="All recipients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All recipients</SelectItem>
            {recipientOptions.map((email) => (
              <SelectItem key={email} value={email}>{email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(statusFilter !== "all" || recipientFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setRecipientFilter("all") }}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Notification log</CardTitle>
            <CardDescription>
              Showing {filtered.length} of {counts?.total ?? filtered.length} total alert sends
            </CardDescription>
          </div>
          <Send className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
              <RefreshCw className="size-5 animate-spin" />
              Loading alert log…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <Inbox className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No alert events match the current filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="max-w-45 truncate text-sm font-medium text-foreground">
                          {r.deal?.contact?.name ?? r.deal?.title ?? "Unknown lead"}
                        </p>
                        <p className="max-w-45 truncate text-xs text-muted-foreground">
                          {r.deal?.contact?.phone ?? r.deal?.contact?.email ?? ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.deal?.account?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.recipient_email}</TableCell>
                    <TableCell>
                      <EventStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className={cn(r.retry_count >= 3 && r.status === "failed" && "font-medium text-destructive")}>
                        {r.retry_count}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      {r.error_message ? (
                        <span className="line-clamp-2 max-w-55 text-xs text-destructive">{r.error_message}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status === "failed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyIds.has(r.id)}
                          onClick={async () => {
                            setBusyIds((prev) => new Set(prev).add(r.id))
                            try {
                              await fetch("/api/admin/lead-notifications/retry", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ ids: [r.id] }),
                              })
                              await load()
                            } catch { /* surface via next load */ } finally {
                              setBusyIds((prev) => {
                                const next = new Set(prev)
                                next.delete(r.id)
                                return next
                              })
                            }
                          }}
                        >
                          <RotateCcw className="size-3" />
                          Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
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