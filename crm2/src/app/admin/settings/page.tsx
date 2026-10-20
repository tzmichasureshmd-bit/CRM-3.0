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
  Shield,
  FileText,
  ScrollText,
  Activity,
  CreditCard,
  AlertTriangle,
  Package,
  Server,
  ArrowRight,
  Mail,
} from "lucide-react";
import { getAuthorizedSuperAdminEmails } from "@/lib/auth/super-admin-emails";

export const dynamic = "force-dynamic";

function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex < 2) return "***" + email.slice(atIndex);
  return email.slice(0, 2) + "***" + email.slice(atIndex);
}

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  const [{ count: accountCount }, { count: userCount }, adminEmails] =
    await Promise.all([
      supabase.from("accounts").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      Promise.resolve(getAuthorizedSuperAdminEmails()),
    ]);

  const quickLinks = [
    {
      label: "Manage Plans",
      href: "/admin/plans",
      icon: FileText,
      description: "Configure subscription plans and pricing",
    },
    {
      label: "View Audit Logs",
      href: "/admin/audit",
      icon: ScrollText,
      description: "Review platform activity and changes",
    },
    {
      label: "Platform Health",
      href: "/admin/health",
      icon: Activity,
      description: "Check system status and database stats",
    },
    {
      label: "Subscriptions",
      href: "/admin/subscriptions",
      icon: CreditCard,
      description: "Monitor all business subscriptions",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground">
          Platform configuration and administration.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                Platform Info
              </span>
            </CardTitle>
            <CardDescription>Current platform version and details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Version</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  0.8.0
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Framework</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  Next.js 16 + React 19
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Backend</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  Supabase
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Total Accounts</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {(accountCount ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Total Users</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {(userCount ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Authorized Admins
              </span>
            </CardTitle>
            <CardDescription>
              {adminEmails.length} super admin{adminEmails.length !== 1 ? "s" : ""} configured via environment
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adminEmails.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No super admin emails configured.
              </p>
            ) : (
              <div className="space-y-2">
                {adminEmails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center gap-2 rounded-lg border border-border p-3"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm text-foreground font-mono">
                      {maskEmail(email)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
          <CardDescription>
            Common admin tasks and configuration pages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <Link key={link.href + link.label} href={link.href}>
                <Card className="border-border bg-card transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <link.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {link.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {link.description}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Danger Zone
            </span>
          </CardTitle>
          <CardDescription>
            Irreversible and destructive actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border p-3 opacity-60">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Reset Platform Data
                </p>
                <p className="text-xs text-muted-foreground">
                  Clear all non-essential data from the platform
                </p>
              </div>
              <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Coming Soon
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3 opacity-60">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Clear Cache
                </p>
                <p className="text-xs text-muted-foreground">
                  Purge all cached data across the platform
                </p>
              </div>
              <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Coming Soon
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3 opacity-60">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Bulk Account Actions
                </p>
                <p className="text-xs text-muted-foreground">
                  Suspend, delete, or modify multiple accounts at once
                </p>
              </div>
              <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Coming Soon
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
