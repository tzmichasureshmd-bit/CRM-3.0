import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Send, CheckCircle, Clock, FileEdit, ArrowUpDown, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "sent", label: "Sent" },
  { value: "scheduled", label: "Scheduled" },
  { value: "draft", label: "Draft" },
  { value: "failed", label: "Failed" },
];

const statusColor: Record<string, string> = {
  sent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  draft: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

interface AdminCampaignsPageProps {
  basePath?: string;
  searchParams?: Promise<{ status?: string }>;
}

/** Shared by /admin and /super-admin — links derive from `basePath`. */
export async function AdminCampaignsPage({
  basePath = "/admin",
  searchParams,
}: AdminCampaignsPageProps = {}) {
  const params = (await searchParams) ?? { status: undefined };
  const supabase = await createClient();
  const statusFilter = params.status ?? "all";

  let queryBuilder = supabase
    .from("broadcasts")
    .select(
      `
        id, name, status, recipient_count, sent_count, delivered_count, read_count, failed_count, created_at,
        accounts ( name )
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    queryBuilder = queryBuilder.eq("status", statusFilter);
  }

  const { data: broadcasts, error } = await queryBuilder;

  // Summary counts (run in parallel for the 4 statuses)
  const summaryResults = await Promise.all([
    supabase.from("broadcasts").select("id", { count: "exact", head: true }),
    supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("status", "sent"),
    supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
    supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  const totals = {
    all: summaryResults[0].count ?? 0,
    sent: summaryResults[1].count ?? 0,
    scheduled: summaryResults[2].count ?? 0,
    draft: summaryResults[3].count ?? 0,
  };

  function filterUrl(status: string) {
    const sp = new URLSearchParams();
    if (status !== "all") sp.set("status", status);
    const qs = sp.toString();
    return `${basePath}/campaigns${qs ? `?${qs}` : ""}`;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Campaigns</h2>
          <p className="text-muted-foreground">Platform-wide broadcast overview.</p>
        </div>
        <Card className="border-border bg-card">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              Failed to load campaigns: {error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allBroadcasts = broadcasts ?? [];

  // Aggregate delivery performance across the listed window (real
  // counters maintained by the broadcast engine's recompute RPC).
  const agg = allBroadcasts.reduce(
    (acc, b) => {
      acc.sent += b.sent_count ?? 0;
      acc.delivered += b.delivered_count ?? 0;
      acc.read += b.read_count ?? 0;
      acc.failed += b.failed_count ?? 0;
      return acc;
    },
    { sent: 0, delivered: 0, read: 0, failed: 0 }
  );
  const pct = (part: number, whole: number) =>
    whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Campaigns</h2>
        <p className="text-muted-foreground">
          Platform-wide broadcast and campaign overview.
        </p>
      </div>

      {/* Delivery performance across the listed window */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="font-medium text-foreground">
          Message volume: {agg.sent.toLocaleString()} sent
        </span>
        <span className="text-muted-foreground">
          Delivery rate:{" "}
          <span className="font-medium text-foreground">
            {pct(agg.delivered, agg.sent)}
          </span>
        </span>
        <span className="text-muted-foreground">
          Read rate:{" "}
          <span className="font-medium text-foreground">
            {pct(agg.read, agg.sent)}
          </span>
        </span>
        <span className="text-muted-foreground">
          Failure rate:{" "}
          <span className="font-medium text-destructive">
            {pct(agg.failed, agg.sent)}
          </span>
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Mail className="h-5 w-5" />}
          label="Total Campaigns"
          value={totals.all}
          active={statusFilter === "all"}
          href={filterUrl("all")}
        />
        <SummaryCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="Sent"
          value={totals.sent}
          active={statusFilter === "sent"}
          href={filterUrl("sent")}
          iconColor="text-emerald-500"
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5" />}
          label="Scheduled"
          value={totals.scheduled}
          active={statusFilter === "scheduled"}
          href={filterUrl("scheduled")}
          iconColor="text-blue-500"
        />
        <SummaryCard
          icon={<FileEdit className="h-5 w-5" />}
          label="Draft"
          value={totals.draft}
          active={statusFilter === "draft"}
          href={filterUrl("draft")}
          iconColor="text-muted-foreground"
        />
      </div>

      {/* Table */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">All Campaigns</CardTitle>
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
          {allBroadcasts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Send className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                No campaigns found
              </p>
              <p className="text-xs text-muted-foreground">
                {statusFilter !== "all"
                  ? "No campaigns match the selected status."
                  : "No broadcasts have been created yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Campaign Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Recipients</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">Delivered</th>
                    <th className="px-4 py-3">Read</th>
                    <th className="px-4 py-3">Failed</th>
                    <th className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        Created <ArrowUpDown className="h-3 w-3" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allBroadcasts.map((b) => {
                    const accountRows = b.accounts as unknown as { name: string | null }[] | null;
                    const account = Array.isArray(accountRows) ? accountRows[0] ?? null : accountRows;
                    return (
                      <tr
                        key={b.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {account?.name ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-foreground">
                          {b.name ?? (
                            <span className="text-muted-foreground">Untitled</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                              statusColor[b.status] ?? statusColor.draft
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {(b.recipient_count ?? 0).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {(b.sent_count ?? 0).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {(b.delivered_count ?? 0).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {(b.read_count ?? 0).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {(b.failed_count ?? 0).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {b.created_at
                            ? new Date(b.created_at).toLocaleDateString()
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
  href: string;
  iconColor?: string;
}) {
  return (
    <a href={href}>
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
    </a>
  );
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  return <AdminCampaignsPage basePath="/admin" searchParams={searchParams} />;
}