import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TrendingUp,
  MessageSquare,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface AdminAnalyticsPageProps {
  basePath?: string;
}

interface DayBucket {
  day: string;
  label: string;
  sent: number;
  received: number;
}

/**
 * Platform-wide messaging analytics: 14-day send/receive volume with a
 * pure-CSS bar chart (no chart library — matches the rest of the admin
 * area) plus the busiest businesses by contact count.
 */
export async function AdminAnalyticsPage({
  basePath = "/admin",
}: AdminAnalyticsPageProps = {}) {
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const [totalsResult, dailyResult, topAccountsResult] = await Promise.all([
    supabase.from("messages").select("sender_type", { count: "exact" }).gte(
      "created_at",
      since.toISOString(),
    ),
    // Volume per day is computed from the created_at timestamps of the
    // window's rows — small enough at platform level for a support view;
    // if this ever grows, swap for a materialized rollup table.
    supabase
      .from("messages")
      .select("sender_type, created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(20000),
    supabase
      .from("accounts")
      .select("id, name, contacts(count)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const total14d = totalsResult.count ?? 0;

  const rows = (dailyResult.data ?? []) as Array<{
    sender_type: string | null;
    created_at: string;
  }>;
  const buckets = new Map<string, DayBucket>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      day: key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      sent: 0,
      received: 0,
    });
  }
  for (const row of rows) {
    const key = row.created_at.slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (row.sender_type === "customer") bucket.received += 1;
    else bucket.sent += 1;
  }
  const series = [...buckets.values()];
  const sentTotal = series.reduce((s, b) => s + b.sent, 0);
  const receivedTotal = series.reduce((s, b) => s + b.received, 0);
  const maxDay = Math.max(...series.map((b) => b.sent + b.received), 1);

  const accounts = (topAccountsResult.data ?? []) as Array<{
    id: string;
    name: string | null;
    contacts: { count: number }[];
  }>;
  const topByContacts = accounts
    .map((a) => ({
      id: a.id,
      name: a.name ?? "Untitled account",
      contacts: Array.isArray(a.contacts) ? a.contacts[0]?.count ?? 0 : 0,
    }))
    .sort((a, b) => b.contacts - a.contacts)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Platform Analytics</h2>
        <p className="text-muted-foreground">
          Messaging activity across the whole platform, last 14 days.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="Messages (14d)"
          value={total14d}
        />
        <StatCard
          icon={<ArrowUpRight className="h-5 w-5" />}
          label="Outbound (14d)"
          value={sentTotal}
          iconColor="text-emerald-500"
        />
        <StatCard
          icon={<ArrowDownLeft className="h-5 w-5" />}
          label="Inbound (14d)"
          value={receivedTotal}
          iconColor="text-blue-500"
        />
      </div>

      {/* Daily volume chart */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Daily Volume
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-end gap-1.5 sm:gap-2">
            {series.map((b) => {
              const h = Math.round(((b.sent + b.received) / maxDay) * 100);
              return (
                <div key={b.day} className="group flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {b.sent + b.received}
                  </span>
                  <div className="relative flex w-full flex-col justify-end" style={{ height: 120 }}>
                    <div
                      className="w-full rounded-t bg-primary/80 transition-all group-hover:bg-primary"
                      style={{ height: `${Math.max(h, 2)}%` }}
                      title={`${b.label}: ${b.sent} sent, ${b.received} received`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{b.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary/80" />
              Outbound + inbound combined
            </span>
            <span>Peak: {maxDay.toLocaleString()} msgs</span>
          </div>
        </CardContent>
      </Card>

      {/* Top accounts */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Businesses by Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topByContacts.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No accounts yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {topByContacts.map((a, i) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 shrink-0 text-sm font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <a
                    href={`${basePath}/businesses/${a.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:text-primary"
                  >
                    {a.name}
                  </a>
                  <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {a.contacts.toLocaleString()} contacts
                  </span>
                </li>
              ))}
            </ul>
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

export default function AnalyticsPage() {
  return <AdminAnalyticsPage basePath="/admin" />;
}
