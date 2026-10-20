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
  ArrowLeft,
  Building2,
  Users,
  MessageSquare,
  Mail,
  Phone,
  Globe,
  MapPin,
  Clock,
  Calendar,
  CreditCard,
  ScrollText,
  FileText,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { notFound } from "next/navigation";
import { SuspendAccountButton } from "./suspend-button";
import { Eye } from "lucide-react";

export const dynamic = "force-dynamic";

interface BusinessDetailPageProps {
  params: Promise<{ id: string }>;
  basePath?: string;
}

/**
 * Shared by /admin and /super-admin — internal links derive from
 * `basePath` so either tree stays self-contained.
 */
export async function AdminBusinessDetailPage({
  params,
  basePath = "/admin",
}: BusinessDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (accountError || !account) {
    notFound();
  }

  const [
    subscriptionResult,
    membersResult,
    contactsResult,
    conversationsResult,
    messagesResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("business_subscriptions")
      .select(
        `
        id, status, billing_period, trial_started_at, trial_ends_at,
        current_period_start, current_period_end, cancel_at_period_end,
        subscription_plans ( name, slug, price_monthly_cents, price_yearly_cents, currency )
        `
      )
      .eq("account_id", id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, email, account_role, avatar_url, created_at")
      .eq("account_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("account_id", id),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("account_id", id),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("account_id", id)
      .then(async () => {
        // messages doesn't have account_id directly; count via conversations
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in(
            "conversation_id",
            (
              await supabase
                .from("conversations")
                .select("id")
                .eq("account_id", id)
            ).data?.map((c) => c.id) ?? []
          );
        return { count: count ?? 0 };
      }),
    supabase
      .from("audit_log")
      .select("id, actor_email, action, resource_type, details, created_at")
      .eq("account_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const subscription = subscriptionResult.data;
  const members = membersResult.data ?? [];
  const contactCount = contactsResult.count ?? 0;
  const conversationCount = conversationsResult.count ?? 0;
  const messageCount = messagesResult.count ?? 0;
  const auditEntries = auditResult.data ?? [];

  const rawPlans = subscription
    ? (subscription as unknown as { subscription_plans?: unknown }).subscription_plans
    : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan: any = Array.isArray(rawPlans)
    ? (rawPlans[0] ?? null)
    : rawPlans && typeof rawPlans === "object"
      ? rawPlans
      : null;

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

  const roleColor: Record<string, string> = {
    owner: "bg-primary/10 text-primary",
    admin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    agent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    viewer: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`${basePath}/businesses`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground truncate">
              {account.name}
            </h2>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                statusColor[account.status ?? "active"] ?? statusColor.active
              }`}
            >
              {account.status ?? "active"}
            </span>
          </div>
          <p className="text-muted-foreground">
            {account.slug ? `@${account.slug}` : "No slug"} &middot; Business
            details and management
          </p>
        </div>
        <div className="flex items-center gap-2">
          {basePath === "/super-admin" && (
            <Link href={`${basePath}/businesses/${account.id}/view-as-admin`}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Eye className="h-4 w-4" />
                View as Admin
              </button>
            </Link>
          )}
          <SuspendAccountButton
            accountId={account.id}
            currentStatus={account.status ?? "active"}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Name
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {account.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Slug
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {account.slug ? `@${account.slug}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Industry
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {account.industry ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Timezone
                </dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {account.timezone ?? "UTC"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Phone
                </dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {account.phone ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Website
                </dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  {account.website ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Address
                </dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{account.address ?? "—"}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Created
                </dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {new Date(account.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscription ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {plan?.name ?? "Unknown Plan"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        subStatusColor[subscription.status] ??
                        subStatusColor.active
                      }`}
                    >
                      {subscription.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {subscription.billing_period}
                    </span>
                  </div>
                </div>
                {plan?.price_monthly_cents != null && (
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Monthly Price
                    </dt>
                    <dd className="text-sm font-medium text-foreground">
                      {plan.currency === "INR" ? "₹" : "$"}{(plan.price_monthly_cents / 100).toLocaleString()}/mo
                    </dd>
                  </div>
                )}
                {subscription.trial_ends_at && (
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Trial Ends
                    </dt>
                    <dd className="text-sm text-foreground">
                      {new Date(subscription.trial_ends_at).toLocaleDateString()}
                    </dd>
                  </div>
                )}
                {subscription.current_period_end && (
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Current Period Ends
                    </dt>
                    <dd className="text-sm text-foreground">
                      {new Date(
                        subscription.current_period_end
                      ).toLocaleDateString()}
                    </dd>
                  </div>
                )}
                {subscription.cancel_at_period_end && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Cancels at period end
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active subscription.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {contactCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Contacts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {conversationCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Conversations</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {messageCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Messages</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Members ({members.length})
            </CardTitle>
            <CardDescription>Users belonging to this account</CardDescription>
          </CardHeader>
          <CardContent>
            {members.length > 0 ? (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {member.full_name?.charAt(0)?.toUpperCase() ?? "U"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {member.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.email}
                      </p>
                    </div>
                    {member.account_role && (
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          roleColor[member.account_role] ?? roleColor.viewer
                        }`}
                      >
                        <Shield className="mr-1 h-3 w-3" />
                        {member.account_role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No team members found.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              Recent Audit Entries
            </CardTitle>
            <CardDescription>Activity on this account</CardDescription>
          </CardHeader>
          <CardContent>
            {auditEntries.length > 0 ? (
              <div className="space-y-2">
                {auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">
                          {entry.actor_email ?? "System"}
                        </span>{" "}
                        {entry.action}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {entry.resource_type}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                    {entry.details && (
                      <pre className="mt-1.5 overflow-x-auto rounded bg-muted/50 p-2 text-xs text-muted-foreground">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No audit entries for this account.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AdminBusinessDetailPage params={params} basePath="/admin" />;
}
