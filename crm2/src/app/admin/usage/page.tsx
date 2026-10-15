import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Send,
  MessageSquare,
  Users,
  Bot,
  Webhook,
  BarChart3,
} from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface AdminUsagePageProps {
  basePath?: string;
  searchParams?: SearchParams;
}

/** Shared by /admin and /super-admin — links derive from `basePath`. */
export async function AdminUsagePage({
  basePath = "/admin",
  searchParams,
}: AdminUsagePageProps = {}) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();

  const periodFilter =
    typeof params.period === "string" ? params.period.trim() : "";

  // Build the query
  let query = supabase
    .from("resource_usage")
    .select(
      `
        id,
        period_start,
        period_end,
        messages_sent,
        messages_received,
        contacts_created,
        ai_requests,
        api_requests,
        storage_mb,
        accounts(name)
      `,
      { count: "exact" }
    );

  if (periodFilter) {
    const startDate = `${periodFilter}-01T00:00:00`;
    const endDate = `${periodFilter}-31T23:59:59`;
    query = query
      .gte("period_start", startDate)
      .lte("period_start", endDate);
  }

  const {
    data: usages,
    count,
    error,
  } = await query.order("period_start", { ascending: false });

  // For the current period, aggregate all rows whose period_start falls in the current month
  const now = new Date();
  const currentPeriodStart = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), 1)
  ).toISOString();
  const currentPeriodEnd = new Date(
    Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  ).toISOString();

  const { data: currentPeriodRows } = await supabase
    .from("resource_usage")
    .select(
      "messages_sent, messages_received, contacts_created, ai_requests, api_requests"
    )
    .gte("period_start", currentPeriodStart)
    .lte("period_start", currentPeriodEnd);

  let messagesSent = 0;
  let messagesReceived = 0;
  let contactsCreated = 0;
  let aiRequests = 0;
  let apiRequests = 0;

  if (currentPeriodRows) {
    for (const row of currentPeriodRows) {
      messagesSent += row.messages_sent ?? 0;
      messagesReceived += row.messages_received ?? 0;
      contactsCreated += row.contacts_created ?? 0;
      aiRequests += row.ai_requests ?? 0;
      apiRequests += row.api_requests ?? 0;
    }
  }

  // Build period options for the filter
  const { data: allPeriods } = await supabase
    .from("resource_usage")
    .select("period_start")
    .order("period_start", { ascending: false });

  const periodsSet = new Set<string>();
  if (allPeriods) {
    for (const row of allPeriods) {
      const d = new Date(row.period_start);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      periodsSet.add(key);
    }
  }
  const periodOptions = Array.from(periodsSet).slice(0, 12);

  function periodUrl(p: string) {
    const sp = new URLSearchParams();
    if (p) sp.set("period", p);
    return `${basePath}/usage?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          Platform Usage
        </h2>
        <p className="text-muted-foreground">
          Platform-wide usage statistics across all accounts.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <SummaryCard
          title="Messages Sent"
          value={messagesSent}
          icon={<Send className="h-4 w-4 text-emerald-500" />}
        />
        <SummaryCard
          title="Messages Received"
          value={messagesReceived}
          icon={<MessageSquare className="h-4 w-4 text-blue-500" />}
        />
        <SummaryCard
          title="Contacts Created"
          value={contactsCreated}
          icon={<Users className="h-4 w-4 text-purple-500" />}
        />
        <SummaryCard
          title="AI Requests"
          value={aiRequests}
          icon={<Bot className="h-4 w-4 text-amber-500" />}
        />
        <SummaryCard
          title="API Requests"
          value={apiRequests}
          icon={<Webhook className="h-4 w-4 text-cyan-500" />}
        />
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Filter by period
              </span>
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              <Link href={periodUrl("")}>
                <Button
                  variant={!periodFilter ? "default" : "outline"}
                  size="xs"
                >
                  All
                </Button>
              </Link>
              {periodOptions.map((p) => (
                <Link key={p} href={periodUrl(p)}>
                  <Button
                    variant={periodFilter === p ? "default" : "outline"}
                    size="xs"
                  >
                    {p}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-sm text-destructive">
                Failed to load usage data. Please try again.
              </p>
            </div>
          ) : !usages || usages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {periodFilter
                  ? `No usage data for period "${periodFilter}".`
                  : "No usage data found."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3 text-right">Sent</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Contacts</th>
                    <th className="px-4 py-3 text-right">AI</th>
                    <th className="px-4 py-3 text-right">API</th>
                    <th className="px-4 py-3 text-right">Storage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usages.map((row: Record<string, unknown>) => {
                    const account = row.accounts as
                      | { name: string | null }
                      | null;
                    const periodDate = new Date(row.period_start as string);
                    const periodLabel = `${periodDate.getUTCFullYear()}-${String(periodDate.getUTCMonth() + 1).padStart(2, "0")}`;
                    return (
                      <tr
                        key={row.id as string}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {account?.name || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {periodLabel}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                          {(row.messages_sent as number)?.toLocaleString() ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                          {(row.messages_received as number)?.toLocaleString() ??
                            0}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                          {(row.contacts_created as number)?.toLocaleString() ??
                            0}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                          {(row.ai_requests as number)?.toLocaleString() ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                          {(row.api_requests as number)?.toLocaleString() ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                          {row.storage_mb != null
                            ? `${(row.storage_mb as number).toFixed(1)} MB`
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
        {typeof count === "number" && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {count.toLocaleString()} record{count !== 1 && "s"}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {icon}
            {title}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-foreground">
          {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <AdminUsagePage basePath="/admin" searchParams={searchParams} />;
}
