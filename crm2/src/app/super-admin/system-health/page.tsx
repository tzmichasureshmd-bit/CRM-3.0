"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Loader2,
  RefreshCw,
  Zap,
  AlertTriangle,
  Activity,
  MessageSquare,
  Bot,
  XCircle,
  Clock,
  CheckCircle,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface HealthData {
  totalAutomations: number
  activeAutomations: number
  totalFlows: number
  failedExecutions: number
  totalAiRequests: number
  totalMessagesSent: number
  totalMessagesReceived: number
  recentErrors: { message: string; account_name: string; created_at: string; workflow_type: string }[]
  failedExecutionList: { id: string; account_name: string; workflow_type: string; error_message: string | null; started_at: string; duration_ms: number | null }[]
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")

  const load = useCallback(async () => {
    try {
      const supabase = createClient()

      const flowsRes = await supabase.from("flows").select("id", { count: "exact", head: true }).then(
        (res) => res,
        () => ({ count: 0, error: null } as { count: number | null; error: null }),
      )

      const [
        automationsRes,
        activeRes,
        failedRes,
        usageRes,
        failedListRes,
      ] = await Promise.all([
        supabase.from("automations").select("id", { count: "exact", head: true }),
        supabase.from("automations").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("automation_execution_logs").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("resource_usage").select("messages_sent, messages_received, ai_requests"),
        supabase
          .from("automation_execution_logs")
          .select("id, workflow_type, error_message, started_at, duration_ms, accounts(name)")
          .eq("status", "failed")
          .order("started_at", { ascending: false })
          .limit(20),
      ])

      const totalMessagesSent = (usageRes.data ?? []).reduce<number>((s, r) => s + (r.messages_sent ?? 0), 0)
      const totalMessagesReceived = (usageRes.data ?? []).reduce<number>((s, r) => s + (r.messages_received ?? 0), 0)
      const totalAiRequests = (usageRes.data ?? []).reduce<number>((s, r) => s + (r.ai_requests ?? 0), 0)

      const failedLogs = (failedListRes.data ?? []).map((log) => ({
        id: log.id,
        account_name: (log.accounts as unknown as { name: string } | null)?.name ?? "—",
        workflow_type: log.workflow_type,
        error_message: log.error_message,
        started_at: log.started_at,
        duration_ms: log.duration_ms,
      }))

      setData({
        totalAutomations: automationsRes.count ?? 0,
        activeAutomations: activeRes.count ?? 0,
        totalFlows: (flowsRes as { count: number | null }).count ?? 0,
        failedExecutions: failedRes.count ?? 0,
        totalAiRequests,
        totalMessagesSent,
        totalMessagesReceived,
        recentErrors: failedLogs.slice(0, 10).map((l) => ({
          message: l.error_message ?? "Unknown error",
          account_name: l.account_name,
          created_at: l.started_at,
          workflow_type: l.workflow_type,
        })),
        failedExecutionList: failedLogs,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system health")
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  if (!data) {
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
          <h2 className="text-2xl font-bold text-foreground">System Health</h2>
          <p className="text-muted-foreground">Platform-wide health overview, usage summaries, and error logs.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Automations
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{data.totalAutomations}</p>
            <p className="text-xs text-muted-foreground">{data.activeAutomations} active</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Flows
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{data.totalFlows}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-destructive" />
                Failed Executions
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{data.failedExecutions}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                AI Requests
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{data.totalAiRequests.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp Usage Summary
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm text-muted-foreground">Messages Sent</span>
                <span className="text-sm font-medium text-foreground tabular-nums">{data.totalMessagesSent.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm text-muted-foreground">Messages Received</span>
                <span className="text-sm font-medium text-foreground tabular-nums">{data.totalMessagesReceived.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm text-muted-foreground">Total Messages</span>
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {(data.totalMessagesSent + data.totalMessagesReceived).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                AI Usage Summary
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm text-muted-foreground">Total AI Requests</span>
                <span className="text-sm font-medium text-foreground tabular-nums">{data.totalAiRequests.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm text-muted-foreground">Active Automations</span>
                <span className="text-sm font-medium text-foreground tabular-nums">{data.activeAutomations}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm text-muted-foreground">Failed Executions</span>
                <span className="text-sm font-medium text-destructive tabular-nums">{data.failedExecutions}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as string)}>
        <TabsList>
          <TabsTrigger value="overview">
            <CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Recent Errors
          </TabsTrigger>
          <TabsTrigger value="failed">
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Failed Executions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recent Errors (last 10)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.recentErrors.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <CheckCircle className="h-8 w-8 text-emerald-500/50" />
                  <p className="text-sm text-muted-foreground">No recent errors. System is healthy.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Workflow Type</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentErrors.map((err, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{err.account_name}</TableCell>
                        <TableCell>
                          <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                            {err.workflow_type.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-destructive text-xs">{err.message}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(err.created_at).toLocaleString()}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed">
          <Card className="border-border bg-card">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                All Failed Executions (last 20)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.failedExecutionList.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <CheckCircle className="h-8 w-8 text-emerald-500/50" />
                  <p className="text-sm text-muted-foreground">No failed executions.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.failedExecutionList.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.account_name}</TableCell>
                        <TableCell>
                          <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                            {log.workflow_type.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-destructive text-xs">{log.error_message ?? "—"}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground text-xs">
                          {log.duration_ms != null ? `${log.duration_ms.toLocaleString()}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{new Date(log.started_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
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
