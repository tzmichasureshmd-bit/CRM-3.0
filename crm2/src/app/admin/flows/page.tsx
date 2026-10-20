import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Workflow, PlayCircle, FileEdit, Archive } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

interface AdminFlowsPageProps {
  basePath?: string;
}

/**
 * Platform-wide conversational-flows monitor: how many flows each
 * business runs, their publish status, trigger types and execution
 * volume. Read-only support view — editing happens inside each
 * business's own /flows builder.
 */
export async function AdminFlowsPage({
  basePath = "/admin",
}: AdminFlowsPageProps = {}) {
  const supabase = await createClient();

  const [flowsResult, countsResult, execResult] = await Promise.all([
    supabase
      .from("flows")
      .select(
        `
        id, name, status, trigger_type, execution_count,
        last_executed_at, created_at,
        accounts ( id, name )
      `,
      )
      .order("execution_count", { ascending: false })
      .limit(200),
    supabase.from("flows").select("status"),
    supabase.from("flows").select("execution_count"),
  ]);

  const { data: flows, error } = flowsResult;
  const statuses = (countsResult.data ?? []).map(
    (r: { status: string }) => r.status,
  );
  const totalExecutions = (execResult.data ?? []).reduce(
    (sum: number, r: { execution_count: number | null }) =>
      sum + (r.execution_count ?? 0),
    0,
  );

  const stats = {
    total: statuses.length,
    active: statuses.filter((s) => s === "active").length,
    draft: statuses.filter((s) => s === "draft").length,
    archived: statuses.filter((s) => s === "archived").length,
    executions: totalExecutions,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Flows Monitor</h2>
        <p className="text-muted-foreground">
          Conversational automation usage across the platform.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Workflow className="h-5 w-5" />}
          label="Total Flows"
          value={stats.total}
        />
        <StatCard
          icon={<PlayCircle className="h-5 w-5" />}
          label="Active"
          value={stats.active}
          iconColor="text-emerald-500"
        />
        <StatCard
          icon={<FileEdit className="h-5 w-5" />}
          label="Drafts"
          value={stats.draft}
          iconColor="text-blue-500"
        />
        <StatCard
          icon={<Archive className="h-5 w-5" />}
          label="Executions"
          value={stats.executions}
          iconColor="text-violet-500"
        />
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">All Flows</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="py-16 text-center text-sm text-destructive">
              Failed to load flows: {error.message}
            </div>
          ) : !flows || flows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Workflow className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                No flows built yet
              </p>
              <p className="text-xs text-muted-foreground">
                Businesses create flows from their own workspace.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Flow</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3">Executions</th>
                    <th className="px-4 py-3">Last Run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(flows as Array<Record<string, unknown>>).map((row) => {
                    const accountRows = row.accounts as unknown as
                      | { id: string; name: string | null }[]
                      | null;
                    const account = Array.isArray(accountRows)
                      ? accountRows[0] ?? null
                      : accountRows;
                    const status = row.status as string;
                    return (
                      <tr key={row.id as string} className="transition-colors hover:bg-muted/50">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {row.name as string}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {account ? (
                            <a
                              href={`${basePath}/businesses/${account.id}`}
                              className="text-primary hover:underline"
                            >
                              {account.name ?? "View"}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                              STATUS_STYLES[status] ?? STATUS_STYLES.draft
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 capitalize text-muted-foreground">
                          {(row.trigger_type as string).replace(/_/g, " ")}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {((row.execution_count as number) ?? 0).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {row.last_executed_at
                            ? new Date(row.last_executed_at as string).toLocaleString()
                            : "Never"}
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

function StatCard({
  icon,
  label,
  value,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  iconColor?: string;
}) {
  return (
    <Card className="border-border bg-card">
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
}

export default function FlowsAdminPage() {
  return <AdminFlowsPage basePath="/admin" />;
}
