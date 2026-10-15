import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Settings,
  Globe,
  Shield,
  Bell,
  Server,
  Users,
  CreditCard,
  MessageSquare,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { SuperAdminMembersCard } from "@/components/admin/super-admin-members-card";
import { SuperAdminLeadNotificationSettings } from "@/components/admin/super-admin-lead-notification-settings";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
  const supabase = await createClient();

  const [
    accountsResult,
    usersResult,
    plansResult,
    whatsappConfigsResult,
    emailConfigsResult,
    auditResult,
    activeSubResult,
    pastDueSubResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("subscription_plans")
      .select("id, name, is_active", { count: "exact" })
      .order("price_cents", { ascending: true }),
    supabase
      .from("whatsapp_config")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("email_config")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("business_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("business_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "past_due"),
  ]);

  const totalAccounts = accountsResult.count ?? 0;
  const totalUsers = usersResult.count ?? 0;
  const totalPlans = plansResult.count ?? 0;
  const activePlans = plansResult.data?.filter((p) => p.is_active).length ?? 0;
  const whatsappConfigs = whatsappConfigsResult.count ?? 0;
  const emailConfigs = emailConfigsResult.count ?? 0;
  const totalAuditEvents = auditResult.count ?? 0;
  const activeSubscriptions = activeSubResult.count ?? 0;
  const pastDueSubscriptions = pastDueSubResult.count ?? 0;

  const dbError = accountsResult.error || usersResult.error;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Platform Settings</h2>
        <p className="text-muted-foreground">
          View and manage platform-wide configuration.
        </p>
      </div>

      {dbError ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive/50" />
            <p className="text-sm text-destructive">
              Unable to load platform settings. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* General */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                General
              </CardTitle>
              <CardDescription>
                Basic platform information derived from your database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow
                  label="Total Accounts"
                  value={totalAccounts.toLocaleString()}
                />
                <InfoRow
                  label="Total Users"
                  value={totalUsers.toLocaleString()}
                />
                <InfoRow
                  label="Active Subscriptions"
                  value={activeSubscriptions.toLocaleString()}
                />
                <InfoRow
                  label="Past Due Subscriptions"
                  value={pastDueSubscriptions.toLocaleString()}
                  highlight={pastDueSubscriptions > 0}
                />
              </div>
            </CardContent>
          </Card>

          {/* Platform */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                Platform
              </CardTitle>
              <CardDescription>
                Service configuration and integration status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatusRow
                  label="Database"
                  status="operational"
                />
                <StatusRow
                  label="Authentication"
                  status="operational"
                />
                <StatusRow
                  label="WhatsApp Integration"
                  status={whatsappConfigs > 0 ? "configured" : "not_configured"}
                  detail={
                    whatsappConfigs > 0
                      ? `${whatsappConfigs} account(s) configured`
                      : "No WhatsApp accounts configured"
                  }
                />
                <StatusRow
                  label="Email Service"
                  status={emailConfigs > 0 ? "configured" : "not_configured"}
                  detail={
                    emailConfigs > 0
                      ? `${emailConfigs} account(s) configured`
                      : "No email configuration found"
                  }
                />
                <StatusRow
                  label="Subscription Plans"
                  status={totalPlans > 0 ? "configured" : "not_configured"}
                  detail={
                    totalPlans > 0
                      ? `${activePlans} active / ${totalPlans} total`
                      : "No plans configured"
                  }
                />
                <StatusRow
                  label="Audit Logging"
                  status={totalAuditEvents > 0 ? "operational" : "no_data"}
                  detail={
                    totalAuditEvents > 0
                      ? `${totalAuditEvents.toLocaleString()} events recorded`
                      : "No audit events yet"
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Notifications
              </CardTitle>
              <CardDescription>
                Per-account notification preferences are stored per customer; the platform-wide
                two-person new-lead email alerts are configured in the Lead Alerts card below.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Platform-wide two-person lead alerts */}
          <SuperAdminLeadNotificationSettings />

          {/* Security */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Security
              </CardTitle>
              <CardDescription>
                Authentication and access control information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatusRow
                  label="RLS Policies"
                  status="operational"
                  detail="Row Level Security enabled on all tables"
                />
                <StatusRow
                  label="Super Admin Access"
                  status="operational"
                  detail="Gated via is_super_admin() function"
                />
                <StatusRow
                  label="Account Isolation"
                  status="operational"
                  detail="Enforced via is_account_member() RLS"
                />
                <StatusRow
                  label="API Keys"
                  status="configured"
                  detail="Stored in api_keys table with RLS"
                />
              </div>
              <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4">
                <div className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Sensitive credentials (Supabase service role key, Meta access
                    tokens, webhook secrets, payment provider keys) are stored
                    server-side and never exposed through this interface.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Super Admin Members Management */}
          <SuperAdminMembersCard />

          {/* Account Management */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Account Management
              </CardTitle>
              <CardDescription>
                Quick access to account-related management.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <ManageLink
                  href="/super-admin/businesses"
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Manage Businesses"
                  detail={`${totalAccounts} total`}
                />
                <ManageLink
                  href="/super-admin/users"
                  icon={<Users className="h-4 w-4" />}
                  label="Manage Users"
                  detail={`${totalUsers} total`}
                />
                <ManageLink
                  href="/super-admin/subscriptions"
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Manage Subscriptions"
                  detail={`${activeSubscriptions} active`}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-medium ${
          highlight ? "text-amber-600" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function StatusRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: "operational" | "configured" | "not_configured" | "no_data";
  detail?: string;
}) {
  const statusConfig = {
    operational: {
      color: "bg-emerald-500",
      text: "Operational",
      textColor: "text-emerald-600",
    },
    configured: {
      color: "bg-blue-500",
      text: "Configured",
      textColor: "text-blue-600",
    },
    not_configured: {
      color: "bg-amber-500",
      text: "Not Configured",
      textColor: "text-amber-600",
    },
    no_data: {
      color: "bg-muted-foreground",
      text: "No Data",
      textColor: "text-muted-foreground",
    },
  };

  const cfg = statusConfig[status];

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${cfg.color}`} />
          <span className={`text-xs font-medium ${cfg.textColor}`}>
            {cfg.text}
          </span>
        </span>
      </div>
      {detail && (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

function ManageLink({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </a>
  );
}
