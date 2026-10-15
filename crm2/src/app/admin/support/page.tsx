import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { SupportDesk } from "./support-desk";

export const dynamic = "force-dynamic";

interface AdminSupportPageProps {
  basePath?: string;
}

/** Shared by /admin and /super-admin — links derive from `basePath`. */
export async function AdminSupportPage({
  basePath = "/admin",
}: AdminSupportPageProps = {}) {
  const supabase = await createClient();

  const [recentAccountsResult, pastDueResult, suspendedResult] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, slug, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("business_subscriptions")
        .select(
          `
          id,
          status,
          created_at,
          accounts ( id, name, slug )
        `
        )
        .eq("status", "past_due")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("accounts")
        .select("id, name, slug, status, created_at")
        .eq("status", "suspended")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Support</h2>
        <p className="text-muted-foreground">
          Triage, assign and resolve support tickets across every business.
        </p>
      </div>

      <SupportDesk basePath={basePath} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Accounts
              </span>
            </CardTitle>
            <CardDescription>Newest 5 registered businesses</CardDescription>
          </CardHeader>
          <CardContent>
            {!recentAccountsResult.data ||
            recentAccountsResult.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No accounts found.
              </p>
            ) : (
              <div className="space-y-3">
                {recentAccountsResult.data.map((account) => (
                  <Link
                    key={account.id}
                    href={`${basePath}/businesses/${account.id}`}
                    className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {account.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {account.slug ? `@${account.slug}` : "No slug"} &middot;{" "}
                        {new Date(account.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Past Due Subscriptions
              </span>
            </CardTitle>
            <CardDescription>
              Accounts with overdue payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!pastDueResult.data || pastDueResult.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No past due subscriptions. All clear!
              </p>
            ) : (
              <div className="space-y-3">
                {pastDueResult.data.map((sub) => {
                  const rawAccount = sub.accounts as
                    | Array<{ id: string; name: string | null; slug: string | null }>
                    | { id: string; name: string | null; slug: string | null }
                    | null;
                  const account = Array.isArray(rawAccount) ? rawAccount[0] ?? null : rawAccount;
                  return (
                    <Link
                      key={sub.id}
                      href={
                        account
                          ? `${basePath}/businesses/${account.id}`
                          : "#"
                      }
                      className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {account?.name ?? "Unknown Account"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {account?.slug
                            ? `@${account.slug}`
                            : "No slug"}{" "}
                          &middot; past since{" "}
                          {new Date(sub.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Suspended Accounts
            </span>
          </CardTitle>
          <CardDescription>
            Accounts currently suspended that may need review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!suspendedResult.data || suspendedResult.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No suspended accounts.
            </p>
          ) : (
            <div className="space-y-3">
              {suspendedResult.data.map((account) => (
                <Link
                  key={account.id}
                  href={`${basePath}/businesses/${account.id}`}
                  className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {account.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.slug ? `@${account.slug}` : "No slug"} &middot;{" "}
                      {new Date(account.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SupportPage() {
  return <AdminSupportPage basePath="/admin" />;
}
