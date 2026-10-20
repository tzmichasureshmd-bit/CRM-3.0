import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Search, Building2, ArrowRight, Users, MessageSquare } from "lucide-react";


export const dynamic = "force-dynamic";

interface AdminBusinessesPageProps {
  basePath?: string;
  searchParams?: Promise<{ q?: string; status?: string }>;
}

/** Shared by /admin and /super-admin — links derive from `basePath`. */
export async function AdminBusinessesPage({
  basePath = "/admin",
  searchParams,
}: AdminBusinessesPageProps = {}) {
  const supabase = await createClient();
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const statusFilter = params.status ?? "";

  let queryBuilder = supabase
    .from("accounts")
    .select(
      `
      id, name, slug, status, created_at, industry,
      business_subscriptions!left (
        status,
        subscription_plans ( name, slug )
      ),
      profiles!left ( id )
      `
    )
    .order("created_at", { ascending: false });

  if (query) {
    queryBuilder = queryBuilder.or(`name.ilike.%${query}%,slug.ilike.%${query}%`);
  }

  if (statusFilter && statusFilter !== "all") {
    queryBuilder = queryBuilder.eq("status", statusFilter);
  }

  const { data: accounts, error } = await queryBuilder;

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Businesses</h2>
          <p className="text-muted-foreground">Manage all business accounts.</p>
        </div>
        <Card className="border-border bg-card">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              Failed to load businesses: {error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allAccounts = accounts ?? [];

  // Build member count and contact count per account in parallel
  const accountIds = allAccounts.map((a) => a.id);
  const memberCounts: Record<string, number> = {};
  const contactCounts: Record<string, number> = {};

  if (accountIds.length > 0) {
    const [membersResult, contactsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("account_id")
        .in("account_id", accountIds),
      supabase
        .from("contacts")
        .select("account_id")
        .in("account_id", accountIds),
    ]);

    if (membersResult.data) {
      for (const row of membersResult.data) {
        if (row.account_id) {
          memberCounts[row.account_id] = (memberCounts[row.account_id] ?? 0) + 1;
        }
      }
    }
    if (contactsResult.data) {
      for (const row of contactsResult.data) {
        if (row.account_id) {
          contactCounts[row.account_id] =
            (contactCounts[row.account_id] ?? 0) + 1;
        }
      }
    }
  }

  const statusColor: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    suspended: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    deleted: "bg-destructive/10 text-destructive",
  };

  const subStatusColor: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    trialing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    past_due: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    canceled: "bg-muted text-muted-foreground",
    expired: "bg-destructive/10 text-destructive",
    paused: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Businesses</h2>
        <p className="text-muted-foreground">
          Manage all {allAccounts.length} business account{allAccounts.length !== 1 ? "s" : ""}.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="pt-4">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search by name or slug..."
                className="flex h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <select
              name="status"
              defaultValue={statusFilter}
              className="flex h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="deleted">Deleted</option>
            </select>
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {allAccounts.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              No businesses found
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {query || statusFilter !== ""
                ? "Try adjusting your search or filters."
                : "No business accounts have been created yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {allAccounts.map((account) => {
            const sub = Array.isArray(account.business_subscriptions)
              ? account.business_subscriptions[0]
              : account.business_subscriptions;
            const rawPlans = sub
              ? (sub as unknown as { subscription_plans?: unknown }).subscription_plans
              : null;
            const planName = Array.isArray(rawPlans)
              ? (rawPlans[0] as { name?: string } | undefined)?.name ?? null
              : rawPlans && typeof rawPlans === "object"
                ? (rawPlans as { name?: string }).name ?? null
                : null;
            const subStatus = sub?.status ?? null;
            const memberCount = memberCounts[account.id] ?? 0;
            const contactCount = contactCounts[account.id] ?? 0;

            return (
              <Link key={account.id} href={`${basePath}/businesses/${account.id}`}>
                <Card className="border-border bg-card transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {account.name}
                        </p>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            statusColor[account.status ?? "active"] ??
                            statusColor.active
                          }`}
                        >
                          {account.status ?? "active"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {account.slug && <span>@{account.slug}</span>}
                        {account.industry && <span>{account.industry}</span>}
                        <span>
                          Created{" "}
                          {new Date(account.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        {subStatus && (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              subStatusColor[subStatus] ?? subStatusColor.active
                            }`}
                          >
                            {planName ?? "Plan"} &middot; {subStatus}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {memberCount} member{memberCount !== 1 ? "s" : ""}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          {contactCount} contact{contactCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  return <AdminBusinessesPage basePath="/admin" searchParams={searchParams} />;
}
