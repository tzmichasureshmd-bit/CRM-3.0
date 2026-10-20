import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Zap, PlayCircle, PauseCircle, AlertTriangle, ArrowUpDown, Workflow } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "error", label: "Error" },
];

const statusColor: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error: "bg-destructive/10 text-destructive",
};

interface AdminAutomationsPageProps {
  basePath?: string;
  searchParams?: Promise<{ status?: string }>;
}

/** Shared by /admin and /super-admin — links derive from `basePath`. */
export async function AdminAutomationsPage({
  basePath = "/admin",
  searchParams,
}: AdminAutomationsPageProps = {}) {
  const params = (await searchParams) ?? { status: undefined };
  const supabase = await createClient();
  const statusFilter = params.status ?? "all";

  let queryBuilder = supabase
    .from("automations")
    .select(
      `
        id, name, status, trigger_type, execution_count, created_at,
        accounts ( name )
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    queryBuilder = queryBuilder.eq("status", statusFilter);
  }

  const { data: automations, error } = await queryBuilder;

  // Summary counts
  const summaryResults = await Promise.all([
    supabase.from("automations").select("id", { count: "exact", head: true }),
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("status", "paused"),
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("status", "error"),
  ]);

  const totals = {
    all: summaryResults[0].count ?? 0,
    active: summaryResults[1].count ?? 0,
    paused: summaryResults[2].count ?? 0,
    error: summaryResults[3].count ?? 0,
  };

  // Platform-wide execution volume + failures (real counters written
  // by the automation engine).
  const [executionRows, failedRuns] = await Promise.all([
    supabase.from("automations").select("execution_count"),
    supabase
      .from("automation_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);
  const totalExecutions = (executionRows.data ?? []).reduce(
    (sum, row) => sum + ((row.execution_count as number | null) ?? 0),
    0
  );
  const failedExecutions = failedRuns.count ?? 0;

  function filterUrl(status: string) {
    const sp = new URLSearchParams();
    if (status !== "all") sp.set("status", status);
    const qs = sp.toString();
    return `${basePath}/automations${qs ? `?${qs}` : ""}`;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Automations</h2>
          <p className="text-muted-foreground">Platform-wide automation overview.</p>
        </div>
        <Card className="border-border bg-card">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              Failed to load automations: {error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allAutomations = automations ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Automations</h2>
        <p className="text-muted-foreground">
          Platform-wide automation and workflow overview.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          icon={<Workflow className="h-5 w-5" />}
          label="Total Automations"
          value={totals.all}
          active={statusFilter === "all"}
          href={filterUrl("all")}
        />
        <SummaryCard
          icon={<PlayCircle className="h-5 w-5" />}
          label="Active"
          value={totals.active}
          active={statusFilter === "active"}
          href={filterUrl("active")}
          iconColor="text-emerald-500"
        />
        <SummaryCard
          icon={<PauseCircle className="h-5 w-5" />}
          label="Paused"
          value={totals.paused}
          active={statusFilter === "paused"}
          href={filterUrl("paused")}
          iconColor="text-amber-500"
        />
        <SummaryCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Error"
          value={totals.error}
          active={statusFilter === "error"}
          href={filterUrl("error")}
          iconColor="text-destructive"
        />
        <SummaryCard
          icon={<PlayCircle className="h-5 w-5" />}
          label="Total Executions"
          value={totalExecutions}
          active={false}
        />
        <SummaryCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Failed Executions"
          value={failedExecutions}
          active={false}
          iconColor="text-destructive"
        />
      </div>

      {/* Table */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">All Automations</CardTitle>
            <div className="flex items-center gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <a
                  key={opt.value}
                  href={filterUrl(opt.value)}
                  className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {opt.label}
                </a>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {allAutomations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Zap className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                No automations found
              </p>
              <p className="text-xs text-muted-foreground">
                {statusFilter !== "all"
                  ? "No automations match the selected status."
                  : "No automations have been created yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3">Executions</th>
                    <th className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        Created <ArrowUpDown className="h-3 w-3" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allAutomations.map((a) => {
                    const accountRows = a.accounts as unknown as { name: string | null }[] | null;
                    const account = Array.isArray(accountRows) ? accountRows[0] ?? null : accountRows;
                    return (
                      <tr
                        key={a.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {account?.name ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-foreground">
                          {a.name ?? (
                            <span className="text-muted-foreground">Untitled</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                              statusColor[a.status] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground capitalize">
                          {a.trigger_type ? (
                            <span className="inline-flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              {a.trigger_type.replace(/_/g, " ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {(a.execution_count ?? 0).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {a.created_at
                            ? new Date(a.created_at).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  active,
  href,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  active: boolean;
  href?: string;
  iconColor?: string;
}) {
  const card = (
    <Card
      className={`border-border bg-card transition-colors hover:bg-muted/50 ${
        active ? "ring-2 ring-primary" : ""
      }`}
    >
      <CardContent className="flex items-center gap-4 py-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ${
            iconColor ?? "text-primary"
          }`}
        >
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">
            {value.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <a href={href}>{card}</a> : card;
}

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  return <AdminAutomationsPage basePath="/admin" searchParams={searchParams} />;
}