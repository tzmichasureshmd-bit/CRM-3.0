import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileStack, Check, Minus } from "lucide-react";

interface PlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  max_contacts: number;
  max_team_members: number;
  max_whatsapp_numbers: number;
  max_monthly_messages: number;
  max_broadcasts_per_month: number;
  max_automations: number;
  max_flows: number;
  max_ai_requests_per_month: number;
  max_api_requests_per_day: number;
  max_storage_mb: number;
  features: Record<string, unknown>;
  sort_order: number;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

function formatPrice(cents: number, currency: string = "INR"): string {
  if (cents === 0) return "Free";
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency + " ";
  return `${symbol}${(cents / 100).toLocaleString()}`;
}

function formatLimit(n: number): string {
  if (n === -1) return "Unlimited";
  return n.toLocaleString();
}

export default async function AdminPlansPage() {
  const supabase = await createClient();

  const { data: plans, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("sort_order", { ascending: true });

  const featuresList = [
    { key: "max_contacts", label: "Contacts" },
    { key: "max_team_members", label: "Team Members" },
    { key: "max_whatsapp_numbers", label: "WhatsApp Numbers" },
    { key: "max_monthly_messages", label: "Monthly Messages" },
    { key: "max_broadcasts_per_month", label: "Broadcasts / Month" },
    { key: "max_automations", label: "Automations" },
    { key: "max_flows", label: "Flows" },
    { key: "max_ai_requests_per_month", label: "AI Requests / Month" },
    { key: "max_api_requests_per_day", label: "API Requests / Day" },
    { key: "max_storage_mb", label: "Storage (MB)" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Plans</h2>
        <p className="text-muted-foreground">
          Subscription plans available on the platform.
        </p>
      </div>

      {error ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm text-destructive">
              Failed to load plans. Please try again.
            </p>
          </CardContent>
        </Card>
      ) : !plans || plans.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <FileStack className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No subscription plans configured.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {(plans as unknown as PlanRow[]).map((plan) => (
            <Card
              key={plan.id}
              className="relative border-border bg-card"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-foreground">
                      {plan.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {plan.description || plan.slug}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {plan.is_default && (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        DEFAULT
                      </span>
                    )}
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                        plan.is_active
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {plan.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">
                    {formatPrice(plan.price_monthly_cents, plan.currency)}
                  </span>
                  {plan.price_monthly_cents > 0 && (
                    <span className="text-sm text-muted-foreground">
                      / month
                    </span>
                  )}
                </div>
                {plan.price_yearly_cents > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(plan.price_yearly_cents, plan.currency)} / year
                    {plan.price_monthly_cents > 0 && (
                      <>
                        {" "}
                        (
                        {Math.round(
                          (1 -
                            plan.price_yearly_cents /
                              (plan.price_monthly_cents * 12)) *
                            100
                        )}
                        % save)
                      </>
                    )}
                  </p>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Limits
                  </p>
                  <ul className="space-y-1.5">
                    {featuresList.map(({ key, label }) => {
                      const val = plan[key as keyof PlanRow] as number;
                      return (
                        <li
                          key={key}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            {label}
                          </span>
                          <span className="font-medium text-foreground">
                            {formatLimit(val)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {plan.features &&
                  Object.keys(plan.features).length > 0 && (
                    <div className="border-t border-border pt-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Features
                      </p>
                      <ul className="space-y-1">
                        {Object.entries(plan.features).map(
                          ([key, val]) => (
                            <li
                              key={key}
                              className="flex items-center gap-2 text-sm text-muted-foreground"
                            >
                              {val ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              ) : (
                                <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                              )}
                              <span
                                className={
                                  val ? "text-foreground" : ""
                                }
                              >
                                {key
                                  .replace(/_/g, " ")
                                  .replace(/\b\w/g, (c) =>
                                    c.toUpperCase()
                                  )}
                              </span>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}

                <div className="border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Sort order: {plan.sort_order}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
