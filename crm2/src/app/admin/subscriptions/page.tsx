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
  CreditCard,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Filter,
} from "lucide-react";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface AdminSubscriptionsPageProps {
  basePath?: string;
  searchParams?: SearchParams;
}

/**
 * Shared by /admin and /super-admin — internal links derive from
 * `basePath` so either tree stays self-contained.
 */
export async function AdminSubscriptionsPage({
  basePath = "/admin",
  searchParams,
}: AdminSubscriptionsPageProps = {}) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();

  const statusFilter =
    typeof params.status === "string" ? params.status.trim() : "";

  // Fetch all subscriptions with plan and account info
  let query = supabase
    .from("business_subscriptions")
    .select(
      `
        id,
        status,
        billing_period,
        trial_started_at,
        trial_ends_at,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        canceled_at,
        created_at,
        accounts(name),
        subscription_plans(name, slug)
      `,
      { count: "exact" }
    );

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: subscriptions, count, error } = await query.order(
    "created_at",
    { ascending: false }
  );

  // Fetch summary counts (all statuses)
  const { data: allSubs } = await supabase
    .from("business_subscriptions")
    .select("status");

  const summary = {
    active: 0,
    trial: 0,
    past_due: 0,
    canceled: 0,
  };

  if (allSubs) {
    for (const sub of allSubs) {
      if (sub.status === "active") summary.active++;
      else if (sub.status === "trialing") summary.trial++;
      else if (sub.status === "past_due") summary.past_due++;
      else if (sub.status === "canceled" || sub.status === "expired")
        summary.canceled++;
    }
  }

  const statusOptions = [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "trialing", label: "Trial" },
    { value: "past_due", label: "Past Due" },
    { value: "canceled", label: "Canceled" },
    { value: "expired", label: "Expired" },
    { value: "paused", label: "Paused" },
  ];

  function statusUrl(s: string) {
    const sp = new URLSearchParams();
    if (s) sp.set("status", s);
    return `${basePath}/subscriptions?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Subscriptions</h2>
        <p className="text-muted-foreground">
          Overview of all business subscriptions on the platform.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Active"
          value={summary.active}
          icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
          href={statusFilter === "active" ? undefined : statusUrl("active")}
        />
        <SummaryCard
          title="Trial"
          value={summary.trial}
          icon={<Clock className="h-4 w-4 text-blue-500" />}
          href={statusFilter === "trialing" ? undefined : statusUrl("trialing")}
        />
        <SummaryCard
          title="Past Due"
          value={summary.past_due}
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          href={statusFilter === "past_due" ? undefined : statusUrl("past_due")}
        />
        <SummaryCard
          title="Canceled"
          value={summary.canceled}
          icon={<XCircle className="h-4 w-4 text-destructive" />}
          href={
            statusFilter === "canceled" ? undefined : statusUrl("canceled")
          }
        />
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Filter by status
              </span>
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              {statusOptions.map((opt) => (
                <Link key={opt.value} href={statusUrl(opt.value)}>
                  <Button
                    variant={
                      statusFilter === opt.value ||
                      (!statusFilter && !opt.value)
                        ? "default"
                        : "outline"
                    }
                    size="xs"
                  >
                    {opt.label}
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
                Failed to load subscriptions. Please try again.
              </p>
            </div>
          ) : !subscriptions || subscriptions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {statusFilter
                  ? `No subscriptions with status "${statusFilter}".`
                  : "No subscriptions found."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Billing</th>
                    <th className="px-4 py-3">Trial Ends</th>
                    <th className="px-4 py-3">Period Ends</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscriptions.map(
                    (sub: Record<string, unknown>) => {
                      const account = sub.accounts as
                        | { name: string | null }
                        | null;
                      const plan = sub.subscription_plans as
                        | { name: string | null; slug: string | null }
                        | null;
                      return (
                        <tr
                          key={sub.id as string}
                          className="hover:bg-muted/50 transition-colors"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                            {account?.name || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {plan?.name || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <StatusBadge status={sub.status as string} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 capitalize text-muted-foreground">
                            {sub.billing_period as string}
                            {sub.cancel_at_period_end ? (
                              <span className="ml-1 text-xs text-amber-500">
                                (cancels)
                              </span>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {sub.trial_ends_at
                              ? new Date(
                                  sub.trial_ends_at as string
                                ).toLocaleDateString()
                              : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {sub.current_period_end
                              ? new Date(
                                  sub.current_period_end as string
                                ).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {typeof count === "number" && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {count.toLocaleString()} subscription{count !== 1 && "s"}
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
  href,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
}) {
  const content = (
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

  if (href) {
    return <Link href={href} className="block transition-opacity hover:opacity-80">{content}</Link>;
  }
  return content;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600",
    trialing: "bg-blue-500/10 text-blue-600",
    past_due: "bg-amber-500/10 text-amber-600",
    canceled: "bg-destructive/10 text-destructive",
    expired: "bg-muted text-muted-foreground",
    paused: "bg-orange-500/10 text-orange-600",
  };
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${styles[status] ?? styles.expired}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <AdminSubscriptionsPage basePath="/admin" searchParams={searchParams} />;
}
