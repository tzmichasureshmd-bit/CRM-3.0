import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Building2,
  Users,
  MessageSquare,
  FileText,
  ScrollText,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PlatformHealthPage() {
  const supabase = await createClient();

  const [
    accountsResult,
    usersResult,
    contactsResult,
    messagesResult,
    conversationsResult,
    activeCount,
    suspendedCount,
    deletedCount,
    activeSubCount,
    trialingSubCount,
    pastDueSubCount,
    canceledSubCount,
    recentErrorsResult,
  ] = await Promise.all([
    supabase.from("accounts").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "suspended"),
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "deleted"),
    supabase
      .from("business_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("business_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "trialing"),
    supabase
      .from("business_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "past_due"),
    supabase
      .from("business_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "canceled"),
    supabase
      .from("audit_log")
      .select("id, actor_email, action, resource_type, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const hasPastDue =
    (pastDueSubCount.count ?? 0) > 0 || (suspendedCount.count ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Platform Health</h2>
        <p className="text-muted-foreground">
          System status, database statistics, and recent activity.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {hasPastDue ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              )}
              System Status
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                hasPastDue
                  ? "bg-amber-500 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            <p className="text-lg font-semibold text-foreground">
              {hasPastDue
                ? "Needs Attention"
                : "All Systems Operational"}
            </p>
          </div>
          {(pastDueSubCount.count ?? 0) > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {pastDueSubCount.count} subscription(s) past due, suspended
              account(s) detected.
            </p>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-foreground">
          Database Statistics
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total Accounts"
            value={accountsResult.count ?? 0}
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            label="Total Users"
            value={usersResult.count ?? 0}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            label="Total Contacts"
            value={contactsResult.count ?? 0}
            icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            label="Total Messages"
            value={messagesResult.count ?? 0}
            icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            label="Total Conversations"
            value={conversationsResult.count ?? 0}
            icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Account Status Breakdown</CardTitle>
            <CardDescription>Distribution by account status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <BreakdownRow
                label="Active"
                count={activeCount.count ?? 0}
                color="bg-emerald-500"
              />
              <BreakdownRow
                label="Suspended"
                count={suspendedCount.count ?? 0}
                color="bg-amber-500"
              />
              <BreakdownRow
                label="Deleted"
                count={deletedCount.count ?? 0}
                color="bg-destructive"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Subscription Health</CardTitle>
            <CardDescription>Distribution by subscription status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <BreakdownRow
                label="Active"
                count={activeSubCount.count ?? 0}
                color="bg-emerald-500"
              />
              <BreakdownRow
                label="Trialing"
                count={trialingSubCount.count ?? 0}
                color="bg-blue-500"
              />
              <BreakdownRow
                label="Past Due"
                count={pastDueSubCount.count ?? 0}
                color="bg-amber-500"
              />
              <BreakdownRow
                label="Canceled"
                count={canceledSubCount.count ?? 0}
                color="bg-muted-foreground"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 5 audit log entries</CardDescription>
        </CardHeader>
        <CardContent>
          {!recentErrorsResult.data ||
          recentErrorsResult.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ScrollText className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No audit log entries yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentErrorsResult.data.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ScrollText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">
                        {entry.actor_email ?? "System"}
                      </span>{" "}
                      {entry.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.resource_type} &middot;{" "}
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {icon}
            {label}
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

function BreakdownRow({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <span className="text-sm font-medium text-foreground">
        {count.toLocaleString()}
      </span>
    </div>
  );
}
