import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  MessageSquare,
  Radio,
  Zap,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Clock,
  UserCheck,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OrgAdminDashboard() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, account_id, account_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const accountId = profile?.account_id;
  if (!accountId) redirect("/dashboard");

  const [
    membersResult,
    contactsResult,
    conversationsResult,
    openConversationsResult,
    resolvedConversationsResult,
    broadcastsResult,
    automationsResult,
    activeAutomationsResult,
    messagesResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "open"),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "resolved"),
    supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("is_active", true),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("account_id", accountId),
  ]);

  // Recent team members
  const { data: recentMembers } = await supabase
    .from("profiles")
    .select("id, full_name, email, account_role, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(5);

  const stats = [
    { label: "Team Members", value: membersResult.count ?? 0, icon: Users, href: "/admin/team", color: "text-blue-500 bg-blue-500/10" },
    { label: "Total Contacts", value: contactsResult.count ?? 0, icon: UserCheck, href: "/contacts", color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Total Conversations", value: conversationsResult.count ?? 0, icon: MessageSquare, href: "/inbox", color: "text-violet-500 bg-violet-500/10" },
    { label: "Open Conversations", value: openConversationsResult.count ?? 0, icon: Clock, href: "/inbox", color: "text-amber-500 bg-amber-500/10" },
    { label: "Resolved", value: resolvedConversationsResult.count ?? 0, icon: CheckCircle2, href: "/inbox", color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Broadcasts", value: broadcastsResult.count ?? 0, icon: Radio, href: "/broadcasts", color: "text-pink-500 bg-pink-500/10" },
    { label: "Automations (Active)", value: `${automationsResult.count ?? 0} (${activeAutomationsResult.count ?? 0})`, icon: Zap, href: "/automations", color: "text-orange-500 bg-orange-500/10" },
    { label: "Total Messages", value: messagesResult.count ?? 0, icon: BarChart3, href: "/admin/analytics", color: "text-primary bg-primary/10" },
  ];

  const roleColor: Record<string, string> = {
    owner: "bg-amber-500/10 text-amber-600",
    admin: "bg-primary/10 text-primary",
    agent: "bg-emerald-500/10 text-emerald-600",
    viewer: "bg-muted text-muted-foreground",
  };

  const quickLinks = [
    { label: "Manage Team", href: "/admin/team", icon: Users, desc: "Invite, remove and manage roles" },
    { label: "Analytics", href: "/admin/analytics", icon: BarChart3, desc: "Conversations & message stats" },
    { label: "Broadcasts", href: "/broadcasts", icon: Radio, desc: "Send bulk WhatsApp messages" },
    { label: "Automations", href: "/automations", icon: Zap, desc: "Manage active automations" },
    { label: "Billing", href: "/admin/billing", icon: BarChart3, desc: "Subscription & payment info" },
    { label: "Settings", href: "/admin/settings", icon: BarChart3, desc: "Account & WhatsApp config" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Organisation Dashboard</h2>
        <p className="text-muted-foreground">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}. Here&apos;s your organisation overview.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="border-border bg-card transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.color}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
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

      {/* Quick Links */}
      <div>
        <h3 className="mb-3 text-lg font-semibold text-foreground">Quick Actions</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="border-border bg-card transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <link.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Team Members */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>Recent members in your organisation</CardDescription>
          </div>
          <Link href="/admin/team" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentMembers && recentMembers.length > 0 ? (
            <div className="space-y-3">
              {recentMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{member.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleColor[member.account_role ?? "viewer"] ?? roleColor.viewer}`}>
                    {member.account_role ?? "viewer"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">No team members yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
