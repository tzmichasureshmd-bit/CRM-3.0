"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  Check,
  ArrowRight,
  Loader2,
  RefreshCw,
  AlertTriangle,
  BarChart3,
  Zap,
  Users,
  MessageSquare,
  Send,
  Bot,
  Receipt,
  Phone,
} from "lucide-react";
import type {
  SubscriptionPlan,
  BusinessSubscription,
  ResourceUsage,
  Payment,
} from "@/types";

interface PlanWithSubscription extends SubscriptionPlan {
  _isCurrent?: boolean;
}

export default function BillingPage() {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [currentSub, setCurrentSub] = useState<BusinessSubscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const [plans, setPlans] = useState<PlanWithSubscription[]>([]);
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  const [usageHistory, setUsageHistory] = useState<ResourceUsage[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanWithSubscription | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch active plans
      const { data: plansData, error: plansError } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (plansError) throw plansError;

      // Fetch current subscription. Zero rows (no active/trialing/past_due
      // subscription) is a valid "workspace without a plan" state — never a
      // 406 — so use maybeSingle() and let the UI render the free/no-plan
      // view instead of treating a missing subscription as an error.
      const { data: subData } = await supabase
        .from("business_subscriptions")
        .select("*, subscription_plans(*)")
        .eq("account_id", accountId)
        .in("status", ["active", "trialing", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fetch usage — the current month drives the live meters below,
      // and we also keep up to 6 past months for the history table
      // (mirrors the platform-side usage view Super Admin sees).
      const now = new Date();
      const monthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const { data: usageRows } = await supabase
        .from("resource_usage")
        .select("*")
        .eq("account_id", accountId)
        .gte("period_start", monthsAgo.toISOString())
        .order("period_start", { ascending: false })
        .limit(6);
      const usageData = usageRows?.[0] ?? null;

      // Payment history — non-fatal: an RLS hiccup here must not blank
      // the whole billing page, plans and usage still render.
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20);

      setPlans(plansData || []);
      setCurrentSub(subData as BusinessSubscription | null);
      setCurrentPlan(subData?.subscription_plans as SubscriptionPlan | null);
      setUsage(usageData as ResourceUsage | null);
      setUsageHistory((usageRows ?? []) as ResourceUsage[]);
      setPayments((paymentsData ?? []) as Payment[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load billing information";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [accountId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatPrice = (cents: number, currency: string) =>
    formatCurrency(cents / 100, currency);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const getStatusBadgeClasses = (status: string) => {
    switch (status) {
      case "active":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "trialing":
        return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "past_due":
        return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
      default:
        return "border-border bg-muted text-muted-foreground";
    }
  };

  const getPaymentStatusClasses = (status: Payment["status"]) => {
    switch (status) {
      case "succeeded":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      case "processing":
      case "pending":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "failed":
        return "bg-destructive/10 text-destructive";
      case "refunded":
      case "partially_refunded":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "Active";
      case "trialing":
        return "Trial";
      case "past_due":
        return "Past Due";
      case "canceled":
        return "Canceled";
      case "expired":
        return "Expired";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Plans & Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View your current plan, usage, and the available plans. Plans are
          informational only — to change your plan, contact our consultant.
        </p>
      </div>

      {/* Consultant contact — the only action available on this page */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-base font-semibold text-foreground">
                Please Contact Our Consultant
              </p>
              <p className="text-sm text-muted-foreground">
                To arrange a plan change, upgrade, or billing question, call
                our billing team directly.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <a
              href="tel:+919346947043"
              aria-label="Call consultant at 9346947043"
              className="inline-flex"
            >
              <Button>
                <Phone className="mr-2 h-4 w-4" />
                Call Consultant
              </Button>
            </a>
            <span className="text-sm font-medium text-foreground">
              9346947043
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Current Plan — prominent hero card */}
      <Card className="border-border bg-card overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        <CardHeader className="relative">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          {currentPlan ? (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-foreground">
                    {currentPlan.name}
                  </h2>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusBadgeClasses(currentSub?.status || "")}`}>
                    {getStatusLabel(currentSub?.status || "")}
                  </span>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {formatPrice(
                    billingPeriod === "yearly"
                      ? currentPlan.price_yearly_cents
                      : currentPlan.price_monthly_cents,
                    currentPlan.currency
                  )}{" "}
                  <span className="text-sm font-normal text-muted-foreground">/ {billingPeriod}</span>
                </p>
                {currentSub?.current_period_end && (
                  <p className="text-sm text-muted-foreground">
                    Renews on {formatDate(currentSub.current_period_end)}
                  </p>
                )}
              </div>
              <Button variant="outline" onClick={() => setSelectedPlan(plans.find(p => p.id === currentPlan.id) || null)}>
                Contact Consultant
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <CreditCard className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <p className="mt-4 text-base font-medium text-foreground">No active plan</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a plan to start using WhatsApp CRM.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage */}
      {usage && currentPlan && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Usage
            </CardTitle>
          </CardHeader>          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <UsageItem
                icon={<Users className="h-4 w-4" />}
                label="Contacts"
                used={usage.contacts_created}
                limit={currentPlan.max_contacts}
              />
              <UsageItem
                icon={<MessageSquare className="h-4 w-4" />}
                label="Messages Sent"
                used={usage.messages_sent}
                limit={currentPlan.max_monthly_messages}
              />
              <UsageItem
                icon={<Send className="h-4 w-4" />}
                label="Broadcasts"
                used={usage.broadcasts_created}
                limit={currentPlan.max_broadcasts_per_month}
              />
              <UsageItem
                icon={<Zap className="h-4 w-4" />}
                label="Automations"
                used={usage.automations_executed}
                limit={currentPlan.max_automations}
              />
              <UsageItem
                icon={<Bot className="h-4 w-4" />}
                label="AI Requests"
                used={usage.ai_requests}
                limit={currentPlan.max_ai_requests_per_month}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage History — month-over-month view of the same counters
          the current-period meters show, so growth and seasonality
          are visible without contacting support. */}
      {usageHistory.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Usage History
            </CardTitle>
            <CardDescription>
              Monthly activity for the last {usageHistory.length}{' '}
              {usageHistory.length === 1 ? 'month' : 'months'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Month</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">Received</th>
                    <th className="px-4 py-3">New Contacts</th>
                    <th className="px-4 py-3">Broadcasts</th>
                    <th className="px-4 py-3">Automations</th>
                    <th className="px-4 py-3">AI Requests</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usageHistory.map((row) => {
                    const label = new Date(row.period_start).toLocaleDateString(
                      'en-IN',
                      { month: 'short', year: 'numeric' },
                    );
                    return (
                      <tr key={row.id} className="transition-colors hover:bg-muted/50">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {label}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {row.messages_sent.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {row.messages_received.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {row.contacts_created.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {row.broadcasts_created.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {row.automations_executed.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {row.ai_requests.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      {payments.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-primary" />
              Payment History
            </CardTitle>
            <CardDescription>Your most recent transactions.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-muted/50">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDate(p.created_at)}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {p.description ?? "Subscription payment"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                        {formatPrice(p.amount_cents, p.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${getPaymentStatusClasses(p.status)}`}
                        >
                          {p.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing Period Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={billingPeriod === "monthly" ? "default" : "outline"}
          size="sm"
          onClick={() => setBillingPeriod("monthly")}
        >
          Monthly
        </Button>
        <Button
          variant={billingPeriod === "yearly" ? "default" : "outline"}
          size="sm"
          onClick={() => setBillingPeriod("yearly")}
        >
          Yearly
        </Button>
      </div>

      {/* Available Plans */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Available Plans
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan?.id === plan.id;
            const price = billingPeriod === "yearly"
              ? plan.price_yearly_cents
              : plan.price_monthly_cents;

            return (
              <Card
                key={plan.id}
                className={`border-border bg-card ${isCurrent ? "ring-2 ring-primary" : ""}`}
              >
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>
                    {formatPrice(price, plan.currency)} / {billingPeriod}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground mb-4">
                    {/* emerald-500 on white is ~2.2:1. These ticks are the
                     *  only visual signal for "included in this plan", so
                     *  they carry meaning rather than decorating. */}
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      {plan.max_contacts.toLocaleString()} contacts
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      {plan.max_team_members} team members
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      {plan.max_whatsapp_numbers} WhatsApp number
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      {plan.max_monthly_messages.toLocaleString()} messages/month
                    </li>
                  </ul>
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setSelectedPlan(plan)}
                    >
                      Contact Consultant
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Plan Selection Dialog — informational only. There is no self-service
          checkout anywhere in this app: plan changes are arranged by our
          billing team, so every CTA routes the user to a consultant rather
          than opening a fake payment flow. */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md border-border bg-card">
            <CardHeader>
              <CardTitle>
                {currentPlan
                  ? `Change to ${selectedPlan.name}`
                  : `${selectedPlan.name} plan`}
              </CardTitle>
              <CardDescription>
                {formatPrice(
                  billingPeriod === "yearly"
                    ? selectedPlan.price_yearly_cents
                    : selectedPlan.price_monthly_cents,
                  selectedPlan.currency
                )}{" "}
                / {billingPeriod}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentPlan && (
                <div className="text-sm text-muted-foreground">
                  <p>Current plan: {currentPlan.name}</p>
                  <p>Requested plan: {selectedPlan.name}</p>
                </div>
              )}
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                Plans are informational only. Online checkout is not available
                in the CRM, so no payment is taken here. Contact our consultant
                to arrange this plan change.
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedPlan(null)}
                >
                  Go Back
                </Button>
                <a
                  href="tel:+919346947043"
                  className="flex-1 inline-flex"
                  aria-label="Call consultant at 9346947043"
                >
                  <Button className="w-full">
                    <Phone className="mr-2 h-4 w-4" />
                    Call Consultant
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function UsageItem({
  icon,
  label,
  used,
  limit,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number;
}) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isUnlimited = limit === -1 || limit === 999999;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="text-foreground">
          {used.toLocaleString()} / {isUnlimited ? "∞" : limit.toLocaleString()}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
