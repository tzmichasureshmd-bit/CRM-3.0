import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Building2,
  Users,
  MessageSquare,
  Zap,
  Radio,
  BarChart3,
  Shield,
  Eye,
  ScrollText,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ViewOrgAsAdminPage({ params }: Props) {
  const { id: accountId } = await params;

  // ── 1. Enforce Super Admin ──────────────────────────────────────
  let ctx;
  try {
    ctx = await requireSuperAdmin();
  } catch (err) {
    const res = toErrorResponse(err);
    if (res.status === 401) redirect("/super-admin/login");
    redirect("/super-admin/unauthorized");
  }

  const supabase = ctx.supabase;

  // ── 2. Validate the organisation exists ────────────────────────
  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .select("id, name, status, created_at")
    .eq("id", accountId)
    .maybeSingle();

  if (accountErr || !account) notFound();

  // ── 3. Audit log — record the view action ──────────────────────
  await supabase.from("audit_log").insert({
    actor_user_id: ctx.userId,
    actor_email: ctx.account.name, // super admin's account name as identifier
    actor_role: "super_admin",
    action: "super_admin.view_org_as_admin",
    resource_type: "account",
    resource_id: accountId,
    account_id: accountId,
    details: {
      super_admin_user_id: ctx.userId,
      org_id: accountId,
      org_name: account.name,
      note: "Super Admin viewed organisation admin panel",
    },
  });

  // ── 4. Load org data (scoped to this account) ──────────────────
  const [
    membersRes,
    contactsRes,
    conversationsRes,
    openConvRes,
    broadcastsRes,
    automationsRes,
    activeAutoRes,
    dealsRes,
    wonDealsRes,
    followUpsRes,
    auditRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, account_role, created_at").eq("account_id", accountId).order("created_at"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "open"),
    supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("is_active", true),
    supabase.from("deals").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "open"),
    supabase.from("deals").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "won"),
    supabase.from("follow_ups").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "pending"),
    supabase.from("audit_log").select("id, actor_email, action, resource_type, created_at").eq("account_id", accountId).order("created_at", { ascending: false }).limit(8),
  ]);

  const members = membersRes.data ?? [];

  const roleColor: Record<string, string> = {
    owner: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    admin: "bg-primary/10 text-primary",
    agent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    viewer: "bg-muted text-muted-foreground",
  };

  const stats = [
    { label: "Team Members", value: members.length, icon: Users, color: "text-blue-500 bg-blue-500/10" },
    { label: "Contacts", value: contactsRes.count ?? 0, icon: MessageSquare, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Conversations", value: conversationsRes.count ?? 0, icon: MessageSquare, color: "text-violet-500 bg-violet-500/10" },
    { label: "Open Conversations", value: openConvRes.count ?? 0, icon: MessageSquare, color: "text-amber-500 bg-amber-500/10" },
    { label: "Broadcasts", value: broadcastsRes.count ?? 0, icon: Radio, color: "text-pink-500 bg-pink-500/10" },
    { label: "Automations (Active)", value: `${automationsRes.count ?? 0} (${activeAutoRes.count ?? 0})`, icon: Zap, color: "text-orange-500 bg-orange-500/10" },
    { label: "Open Deals", value: dealsRes.count ?? 0, icon: BarChart3, color: "text-sky-500 bg-sky-500/10" },
    { label: "Won Deals", value: wonDealsRes.count ?? 0, icon: BarChart3, color: "text-emerald-500 bg-emerald-500/10" },
    { label: "Pending Follow-ups", value: followUpsRes.count ?? 0, icon: ScrollText, color: "text-amber-500 bg-amber-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Super Admin Banner — always visible */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <Eye className="size-5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
            Super Admin View — Viewing {account.name}
          </p>
          <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
            You are viewing this organisation&apos;s admin data as Super Admin. This action has been logged.
            No changes to your roles or the organisation&apos;s data have been made.
          </p>
        </div>
        <Link href="/super-admin">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400">
            <ArrowLeft className="size-3.5" />
            Back to Super Admin
          </span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/super-admin/businesses/${accountId}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-2xl font-bold text-foreground">{account.name}</h2>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              account.status === "active"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}>
              {account.status ?? "active"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Organisation Admin view · Created {new Date(account.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.color}`}>
                  <s.icon className="h-4 w-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Team Members */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Members ({members.length})
            </CardTitle>
            <CardDescription>All users in this organisation</CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No members found.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {m.full_name?.charAt(0)?.toUpperCase() ?? m.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{m.full_name ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleColor[m.account_role ?? "viewer"] ?? roleColor.viewer}`}>
                      <Shield className="h-3 w-3" />
                      {m.account_role ?? "viewer"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Audit */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest audit log entries for this organisation</CardDescription>
          </CardHeader>
          <CardContent>
            {(auditRes.data ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No audit entries yet.</p>
            ) : (
              <div className="space-y-2">
                {(auditRes.data ?? []).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{entry.actor_email ?? "System"}</span>{" "}
                      {entry.action}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.resource_type} · {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Security note */}
      <Card className="border-border bg-card">
        <CardContent className="flex items-start gap-3 py-4">
          <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Security Notice</p>
            <p>
              This view is read-only. Your Super Admin session has not been modified. You have not been
              added to this organisation. All data shown is scoped to <strong className="text-foreground">{account.name}</strong> only.
              This access has been recorded in the platform audit log with your user ID, the organisation ID, and a timestamp.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
