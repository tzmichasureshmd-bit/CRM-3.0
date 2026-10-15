"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Loader2,
  Zap,
  RefreshCw,
  Search,
  Pause,
  Play,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { Automation, AutomationExecutionLog } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type AutomationRow = Automation & { accounts?: { name: string } | null }

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600",
  failed: "bg-destructive/10 text-destructive",
  running: "bg-blue-500/10 text-blue-600",
  pending: "bg-amber-500/10 text-amber-600",
  skipped: "bg-muted text-muted-foreground",
  waiting: "bg-purple-500/10 text-purple-600",
}

export default function AutomationManagementPage() {
  const [automations, setAutomations] = useState<AutomationRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState("automations")
  const [failedLogs, setFailedLogs] = useState<(AutomationExecutionLog & { accounts?: { name: string } | null })[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: qErr } = await supabase
        .from("automations")
        .select("*, accounts(name)")
        .order("created_at", { ascending: false })
      if (qErr) throw qErr
      setAutomations((data ?? []) as AutomationRow[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automations")
    }
  }, [])

  const loadFailedLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from("automation_execution_logs")
        .select("*, accounts(name)")
        .eq("status", "failed")
        .order("started_at", { ascending: false })
        .limit(50)
      setFailedLogs((data ?? []) as typeof failedLogs)
    } catch {
      setFailedLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (activeTab === "failed") {
      loadFailedLogs()
    }
  }, [activeTab, loadFailedLogs])

  async function toggleAutomation(a: AutomationRow, next: boolean) {
    setAutomations((prev) => prev?.map((x) => x.id === a.id ? { ...x, is_active: next } : x) ?? prev)
    try {
      const res = await fetch(`/api/automations/${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      })
      if (!res.ok) {
        setAutomations((prev) => prev?.map((x) => x.id === a.id ? { ...x, is_active: !next } : x) ?? prev)
      }
    } catch {
      setAutomations((prev) => prev?.map((x) => x.id === a.id ? { ...x, is_active: !next } : x) ?? prev)
    }
  }

  const filtered = automations?.filter((a) => {
    if (!search) return true
    const name = (a.accounts as { name: string } | null)?.name ?? ""
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.trigger_type.toLowerCase().includes(search.toLowerCase())
    )
  })

  const totalExecutions = automations?.reduce((s, a) => s + a.execution_count, 0) ?? 0
  const activeCount = automations?.filter((a) => a.is_active).length ?? 0
  const inactiveCount = automations ? automations.length - activeCount : 0

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  if (!automations) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Workflow Monitoring</h2>
          <p className="text-muted-foreground">Monitor automations, flows, and executions across all accounts.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Automations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{automations.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paused</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">{inactiveCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Executions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{totalExecutions.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as string)}>
        <TabsList>
          <TabsTrigger value="automations">
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Automations
          </TabsTrigger>
          <TabsTrigger value="failed">
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Failed Executions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automations">
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">All Automations</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search account, name..."
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Executions</TableHead>
                    <TableHead>Last Executed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Control</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        No automations found.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered?.map((a) => {
                    const name = (a.accounts as { name: string } | null)?.name ?? "—"
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>{a.name}</TableCell>
                        <TableCell>
                          <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                            {a.trigger_type.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">{a.execution_count.toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.last_executed_at ? new Date(a.last_executed_at).toLocaleDateString() : "Never"}
                        </TableCell>
                        <TableCell>
                          {a.is_active ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" /> Paused
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={a.is_active}
                            onCheckedChange={(v) => toggleAutomation(a, !!v)}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed">
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Failed Execution Logs (last 50)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingLogs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : failedLogs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No failed executions.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failedLogs.map((log) => {
                      const name = (log.accounts as { name: string } | null)?.name ?? "—"
                      const isExpanded = expandedLog === log.id
                      return (
                        <>
                          <TableRow key={log.id}>
                            <TableCell className="font-medium">{name}</TableCell>
                            <TableCell className="font-mono text-xs">{log.workflow_id.slice(0, 8)}...</TableCell>
                            <TableCell>
                              <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                                {log.workflow_type.replace(/_/g, " ")}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(log.started_at).toLocaleString()}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-destructive text-xs">
                              {log.error_message ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </Button>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${log.id}-detail`}>
                              <TableCell colSpan={6} className="bg-muted/30 px-6 py-3">
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground">Error Details</p>
                                  <pre className="whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-xs text-foreground">
                                    {log.error_message ?? "No error message"}
                                  </pre>
                                  {log.duration_ms != null && (
                                    <p className="text-xs text-muted-foreground">Duration: {log.duration_ms.toLocaleString()}ms</p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
