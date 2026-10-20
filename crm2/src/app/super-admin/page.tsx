import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import {
  Building2,
  Users,
  MessageSquare,
  CreditCard,
  Activity,
  ScrollText,
  FileText,
  ArrowRight,
  Radio,
  Zap,
  DollarSign,
  Target,
} from "lucide-react";
import type { PlatformLeadStats } from "@/types";
import { sourceBadgeInfo } from "@/lib/crm/leads";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const supabase = await createClient();
  const basePath = "/super-admin";

  const { data: user } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", user?.user?.id ?? "")
    .maybeSingle();

  const [
    accountsResult,
    activeAccountsResult,
    suspendedAccountsResult,
    usersResult,
    contactsResult,
    messagesResult,
    inboundMessagesResult,
    conversationsResult,
    broadcastsResult,
    sendingBroadcastsResult,
    automationsResult,
    activeAutomationsResult,
    activeSubscriptionsResult,
    trialingSubscriptionsResult,
    pastDueSubscriptionsResult,
    failedPaymentsResult,
    revenueResult,
    recentAccountsResult,
    recentAuditResult,
  ] = await Promise.all([
    supabase.from("accounts").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("status", "suspended"),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }).in("sender_type", ["agent", "bot"]),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender_type", "customer"),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase.from("broadcasts").select("id", { count: "exact", head: true }),
    supabase.from("broadcasts").select("id", { count: "exact", head: true }).in("status", ["sending", "scheduled"]),
    supabase.from("automations").select("id", { count: "exact", head: true }),
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("business_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("business_subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing"),
    supabase.from("business_subscriptions").select("id", { count: "exact", head: true }).eq("status", "past_due"),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("payments").select("amount_cents").eq("status", "succeeded"),
    supabase.from("accounts").select("id, name, slug, status, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("audit_log").select("id, actor_email, action, resource_type, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const totalRevenueCents = (revenueResult.data ?? []).reduce(
    (sum, row) => sum + ((row.amount_cents as number | null) ?? 0), 0
  );

  const [statsRes, recentRes] = await Promise.all([
    supabase.rpc("get_platform_lead_stats"),
    supabase
      .from("deals")
      .select("id, title, status, created_at, contact:contacts(name, phone, email, source, source_platform), account:accounts(name), assignee:profiles!deals_assigned_to_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const leadStats = !statsRes.error ? (statsRes.data as PlatformLeadStats) : undefined;
  const recentLeads = (!recentRes.error ? recentRes.data : []) as Array<{
    id: string; title: string; status: string; created_at: string;
    contact?: { name?: string | null; phone?: string | null; email?: string | null; source?: string | null; source_platform?: string | null } | null;
    account?: { name?: string | null } | null;
    assignee?: { full_name?: string | null } | null;
  }>;

  const formatMoney = (cents: number) =>
    `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const stats = [
    { label: "Total Accounts", value: accountsResult.count ?? 0, icon: Building2, href: `${basePath}/businesses` },
    { label: "Active", value: activeAccountsResult.count ?? 0, icon: Building2, href: `${basePath}/businesses` },
    { label: "Suspended", value: suspendedAccountsResult.count ?? 0, icon: Building2, href: `${basePath}/businesses` },
    { label: "Total Users", value: usersResult.count ?? 0, icon: Users, href: `${basePath}/users` },
    { label: "Total Contacts", value: contactsResult.count ?? 0, icon: MessageSquare, href: `${basePath}/usage` },
    { label: "Total Conversations", value: conversationsResult.count ?? 0, icon: MessageSquare, href: `${basePath}/usage` },
    { label: "Messages Sent", value: messagesResult.count ?? 0, icon: FileText, href: `${basePath}/usage` },
    { label: "Messages Received", value: inboundMessagesResult.count ?? 0, icon: FileText, href: `${basePath}/usage` },
    { label: "Campaigns (Sending)", value: `${broadcastsResult.count ?? 0} (${sendingBroadcastsResult.count ?? 0})`, icon: Radio, href: `${basePath}/campaigns` },
    { label: "Automations (Active)", value: `${automationsResult.count ?? 0} (${activeAutomationsResult.count ?? 0})`, icon: Zap, href: `${basePath}/automations` },
    { label: "Active Subscriptions", value: activeSubscriptionsResult.count ?? 0, icon: CreditCard, href: `${basePath}/subscriptions` },
    { label: "Trials", value: trialingSubscriptionsResult.count ?? 0, icon: CreditCard, href: `${basePath}/subscriptions?status=trialing` },
    { label: "Past Due", value: pastDueSubscriptionsResult.count ?? 0, icon: CreditCard, href: `${basePath}/subscriptions?status=past_due` },
    { label: "Failed Payments", value: failedPaymentsResult.count ?? 0, icon: DollarSign, href: `${basePath}/payments?status=failed` },
    { label: "Revenue", value: formatMoney(totalRevenueCents), icon: DollarSign, href: `${basePath}/payments` },
    { label: "New Leads Today", value: leadStats?.new_today ?? 0, icon: Target, href: `${basePath}/leads` },
    { label: "New This Week", value: leadStats?.new_week ?? 0, icon: Target, href: `${basePath}/leads` },
    { label: "Qualified Leads", value: leadStats?.qualified ?? 0, icon: Target, href: `${basePath}/leads` },
    { label: "Follow-up Required", value: leadStats?.follow_up_required ?? 0, icon: Target, href: `${basePath}/leads` },
    { label: "Alerts Sent", value: leadStats?.alert_sent ?? 0, icon: Zap, href: `${basePath}/leads/alerts` },
  ];

  const quickLinks = [
    { label: "Businesses", href: `${basePath}/businesses`, icon: Building2 },
    { label: "Users", href: `${basePath}/users`, icon: Users },
    { label: "Plans", href: `${basePath}/plans`, icon: FileText },
    { label: "Payments", href: `${basePath}/payments`, icon: DollarSign },
    { label: "Employee Monitoring", href: `${basePath}/employees`, icon: Users },
    { label: "WhatsApp Monitor", href: `${basePath}/whatsapp`, icon: Activity },
    { label: "Audit Logs", href: `${basePath}/audit`, icon: ScrollText },
    { label: "Platform Health", href: `${basePath}/health`, icon: Activity },
    { label: "Subscriptions", href: `${basePath}/subscriptions`, icon: CreditCard },
  ];

  const statusColor: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    suspended: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    deleted: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Super Admin Dashboard</h2>
        <p className="text-muted-foreground">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}. Platform overview and management.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="border-border bg-card transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">
                  {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-foreground">Quick Links</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="border-border bg-card transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <link.icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium text-foreground flex-1">{link.label}</p>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Recent Accounts</CardTitle>
            <CardDescription>Last 5 registered businesses</CardDescription>
          </CardHeader>
          <CardContent>
            {recentAccountsResult.data && recentAccountsResult.data.length > 0 ? (
              <div className="space-y-3">
                {recentAccountsResult.data.map((account) => (
                  <Link key={account.id} href={`${basePath}/businesses/${account.id}`}
                    className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{account.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.slug ? `@${account.slug}` : "No slug"} &middot; {new Date(account.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[account.status ?? "active"] ?? statusColor.active}`}>
                      {account.status ?? "active"}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No accounts yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Recent Audit Logs</CardTitle>
            <CardDescription>Latest platform activity</CardDescription>
          </CardHeader>
          <CardContent>
            {recentAuditResult.data && recentAuditResult.data.length > 0 ? (
              <div className="space-y-3">
                {recentAuditResult.data.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ScrollText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{entry.actor_email ?? "System"}</span> {entry.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.resource_type} &middot; {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No audit log entries yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent Leads</CardTitle>
            <CardDescription>Newest leads across all customer accounts</CardDescription>
          </div>
          <Link href={`${basePath}/leads`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            Lead Monitoring <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentLeads.length > 0 ? (
            <div className="space-y-3">
              {recentLeads.map((lead) => {
                const info = sourceBadgeInfo(lead.contact?.source ?? null, lead.contact?.source_platform ?? null);
                return (
                  <Link key={lead.id} href={`${basePath}/leads?lead=${lead.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{lead.contact?.name ?? lead.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {lead.account?.name ?? "—"}{info ? ` · ${info.label}` : ""}{lead.assignee?.full_name ? ` · ${lead.assignee.full_name}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        lead.status === "won" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : lead.status === "lost" ? "bg-destructive/10 text-destructive"
                          : "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                      }`}>
                        {lead.status}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">No leads received yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
