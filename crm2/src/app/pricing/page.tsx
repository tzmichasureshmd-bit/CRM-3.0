import Link from "next/link";
import type { Metadata } from "next";
import type { SubscriptionPlan } from "@/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  BarChart3,
  Check,
  KeyRound,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Workflow,
  Zap,
} from "lucide-react";
import { loadPublicPlans } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, affordable WhatsApp CRM plans for growing businesses. Plans starting at ₹499/month.",
  robots: { index: true, follow: true },
};

function formatPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function limitLabel(value: number): string {
  if (value < 0) return "Unlimited";
  if (value === 0) return "Not included";
  return value.toLocaleString("en-IN");
}

const SECTION_LINKS = [
  { href: "#plans", label: "Plans" },
  { href: "#features", label: "Features" },
  { href: "#compare", label: "Comparison" },
  { href: "#addons", label: "Add-ons" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact Sales" },
];

const LIMIT_ROWS: { key: keyof SubscriptionPlan; label: string }[] = [
  { key: "max_contacts", label: "Contacts" },
  { key: "max_team_members", label: "Team members" },
  { key: "max_whatsapp_numbers", label: "WhatsApp numbers" },
  { key: "max_monthly_messages", label: "Messages / month" },
  { key: "max_broadcasts_per_month", label: "Broadcasts / month" },
  { key: "max_automations", label: "Automations" },
  { key: "max_flows", label: "Flows" },
  { key: "max_ai_requests_per_month", label: "AI requests / month" },
  { key: "max_api_requests_per_day", label: "API requests / day" },
  { key: "max_storage_mb", label: "Storage (MB)" },
];

const PERK_ROWS: { key: string; label: string }[] = [
  { key: "ai_assistant", label: "AI message drafting" },
  { key: "priority_support", label: "Priority support" },
  { key: "custom_branding", label: "Custom branding" },
  { key: "dedicated_account_manager", label: "Dedicated account manager" },
];

const CORE_FEATURES = [
  {
    icon: MessageSquare,
    title: "Unified inbox",
    description:
      "WhatsApp, Instagram, Facebook and Telegram conversations in one shared workspace.",
  },
  {
    icon: Users,
    title: "Contacts & follow-ups",
    description:
      "Tags, lead status, notes and follow-up reminders so no conversation goes cold.",
  },
  {
    icon: Megaphone,
    title: "Broadcasts",
    description:
      "Send approved template messages to segments, with delivery tracking and estimates.",
  },
  {
    icon: Workflow,
    title: "Automations & flows",
    description:
      "Trigger-based automations and a flow builder for onboarding and qualification.",
  },
  {
    icon: Sparkles,
    title: "AI assistance",
    description:
      "Draft replies, suggest follow-ups and answer questions from your own knowledge base.",
  },
  {
    icon: BarChart3,
    title: "Reports & exports",
    description:
      "Dashboard metrics, period comparisons and report exports to Excel or PDF.",
  },
  {
    icon: Wallet,
    title: "Prepaid wallet",
    description:
      "Top up once and pay per message, with cost estimates before you send.",
  },
  {
    icon: ShieldCheck,
    title: "Team access control",
    description:
      "Invite teammates, assign account roles and keep work scoped to your workspace.",
  },
  {
    icon: KeyRound,
    title: "Public API",
    description:
      "REST endpoints under /api/v1 with API keys for contacts, conversations and broadcasts.",
  },
];

const ADD_ONS = [
  {
    icon: Users,
    title: "More contacts, seats & numbers",
    description:
      "Need more contacts, team members or WhatsApp numbers than a plan allows? We will size one around your volume.",
    action: "Contact sales" as const,
  },
  {
    icon: Wallet,
    title: "Pay-as-you-go messaging",
    description:
      "Messages are sent from your prepaid wallet at per-destination rates — no fixed message bundle. The cost calculator shows rates and fees before you send.",
    action: "How billing works" as const,
    href: "#faq",
  },
  {
    icon: Zap,
    title: "Higher limits",
    description:
      "Bigger monthly message, API, AI or storage needs? Higher tiers and custom limits are available.",
    action: "Contact sales" as const,
  },
];

const FAQS = [
  {
    q: "Are WhatsApp and Meta messaging charges included?",
    a: "The plan price covers the CRM platform itself. Outgoing messages are sent from your prepaid wallet at per-destination rates, so you only pay for what you send — the cost calculator in Save Money shows the rate and fee for each destination before you send.",
  },
  {
    q: "What happens when I reach a plan limit?",
    a: "Every limit is listed in the comparison table above. If you are approaching a contact, message, seat or API ceiling, move up a plan from Plans & Billing and the new limits apply to your workspace.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Every new account is created with the Free plan on a 14-day trial, so you can explore the CRM before choosing a paid plan.",
  },
  {
    q: "Can I upgrade or downgrade my plan?",
    a: "Yes. Choose a plan on the Plans & Billing page in your dashboard and we will switch it for you. Online checkout is not live in the app yet, so no charge is made from the CRM itself.",
  },
  {
    q: "How do payments work?",
    a: "Billing changes and wallet top-ups are handled by our team today. Contact support with the plan you want and we will set up the billing and send payment details.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Yes — contact support to cancel. Your access continues until the end of the current billing period.",
  },
];

function PlanCard({ plan }: { plan: SubscriptionPlan }) {
  const isPopular = plan.slug === "business";
  const price = plan.price_monthly_cents;
  const yearlyPrice = plan.price_yearly_cents;
  const yearlySavings =
    price > 0 && yearlyPrice > 0
      ? Math.round(((price * 12 - yearlyPrice) / (price * 12)) * 100)
      : 0;

  const highlights = [
    { icon: Check, text: `${limitLabel(plan.max_contacts)} contacts` },
    {
      icon: Users,
      text: `${limitLabel(plan.max_team_members)} team ${
        plan.max_team_members === 1 ? "member" : "members"
      }`,
    },
    {
      icon: MessageSquare,
      text: `${limitLabel(plan.max_whatsapp_numbers)} WhatsApp ${
        plan.max_whatsapp_numbers === 1 ? "number" : "numbers"
      }`,
    },
    {
      icon: Megaphone,
      text: `${limitLabel(plan.max_monthly_messages)} messages / month`,
    },
    {
      icon: Workflow,
      text: `${limitLabel(plan.max_automations)} automations`,
    },
    {
      icon: Sparkles,
      text: `${limitLabel(plan.max_ai_requests_per_month)} AI requests / month`,
    },
  ];

  return (
    <Card
      className={`relative flex flex-col border-border bg-card ${
        isPopular ? "border-primary ring-2 ring-primary/20" : ""
      }`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground">
            Most Popular
          </Badge>
        </div>
      )}
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="mb-6 text-center">
          <div className="text-4xl font-bold text-foreground">
            {formatPrice(price, plan.currency)}
          </div>
          <div className="text-sm text-muted-foreground">/ month</div>
          {yearlyPrice > 0 && (
            <div className="mt-2 text-sm text-muted-foreground">
              or {formatPrice(yearlyPrice, plan.currency)}/year
              {yearlySavings > 0 && (
                <span className="ml-1 text-emerald-500">
                  (save {yearlySavings}%)
                </span>
              )}
            </div>
          )}
        </div>

        <ul className="mb-6 flex-1 space-y-3">
          {highlights.map((item) => (
            <li key={item.text} className="flex items-center gap-2 text-sm">
              <item.icon className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>

        <Link href="/signup" className="w-full">
          <Button
            className="w-full"
            variant={isPopular ? "default" : "outline"}
          >
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function LimitCell({ value }: { value: number }) {
  if (value < 0) {
    return <span className="font-medium text-foreground">Unlimited</span>;
  }
  if (value === 0) {
    return (
      <span className="text-muted-foreground" aria-label="Not included">
        —
      </span>
    );
  }
  return <span className="text-foreground">{value.toLocaleString("en-IN")}</span>;
}

function PerkCell({ included }: { included: boolean }) {
  if (included) {
    return (
      <span className="flex justify-center">
        <Check
          className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
          aria-label="Included"
        />
      </span>
    );
  }
  return (
    <span className="text-center text-muted-foreground" aria-label="Not included">
      —
    </span>
  );
}

export default async function PricingPage() {
  const plans = await loadPublicPlans();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageSquare className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              TZmicha
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Start Free</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 pb-12 pt-20 text-center sm:px-6">
        <Badge variant="secondary" className="mb-4">
          Pricing
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Simple, Transparent Pricing
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Choose the plan that fits your business. All plans include core CRM
          features. Upgrade or downgrade anytime.
        </p>
        <nav
          aria-label="Pricing sections"
          className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2"
        >
          {SECTION_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </section>

      {/* Plans */}
      <section
        id="plans"
        className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 sm:px-6"
      >
        <h2 className="mb-8 text-center text-2xl font-bold text-foreground">
          Plans
        </h2>
        {plans.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        ) : (
          <Card className="border-border bg-card">
            <CardContent className="pt-6 text-center text-muted-foreground">
              Plan details are being updated. Contact sales for current
              pricing.
              <div className="mt-4">
                <a href="mailto:support@tzmicha.com">
                  <Button variant="outline">Contact Sales</Button>
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Features */}
      <section
        id="features"
        className="scroll-mt-20 border-t border-border bg-muted/20 px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold text-foreground">
            Features
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            Everything below is included in every plan — the plan you pick
            controls how much of it you get.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CORE_FEATURES.map((feature) => (
              <Card key={feature.title} className="border-border bg-card">
                <CardHeader>
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <CardDescription className="text-sm">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section
        id="compare"
        className="scroll-mt-20 border-t border-border px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold text-foreground">
            Compare plans
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            Limits and perks for every active plan. Unlimited means the plan
            sets no cap; a dash means it is not included.
          </p>
          {plans.length > 0 ? (
            <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-medium text-muted-foreground"
                    >
                      Feature
                    </th>
                    {plans.map((plan) => (
                      <th
                        key={plan.id}
                        scope="col"
                        className="px-4 py-3 text-center font-semibold text-foreground"
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-muted/40">
                    <th
                      scope="row"
                      colSpan={plans.length + 1}
                      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Limits
                    </th>
                  </tr>
                  {LIMIT_ROWS.map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-border last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-3 text-left font-normal text-muted-foreground"
                      >
                        {row.label}
                      </th>
                      {plans.map((plan) => (
                        <td
                          key={plan.id}
                          className="px-4 py-3 text-center text-muted-foreground"
                        >
                          <LimitCell
                            value={Number(plan[row.key])}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40">
                    <th
                      scope="row"
                      colSpan={plans.length + 1}
                      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Plan perks
                    </th>
                  </tr>
                  {PERK_ROWS.map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-border last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-3 text-left font-normal text-muted-foreground"
                      >
                        {row.label}
                      </th>
                      {plans.map((plan) => (
                        <td key={plan.id} className="px-4 py-3 text-center">
                          <PerkCell
                            included={Boolean(
                              plan.features?.[row.key]
                            )}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-8 text-center text-muted-foreground">
              The comparison table is unavailable right now — contact sales for
              plan details.
            </p>
          )}
        </div>
      </section>

      {/* Add-ons */}
      <section
        id="addons"
        className="scroll-mt-20 border-t border-border bg-muted/20 px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold text-foreground">
            Add-ons
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            Anything a plan cannot cover can be added on top — tell us what you
            need.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {ADD_ONS.map((addon) => (
              <Card key={addon.title} className="flex flex-col border-border bg-card">
                <CardHeader>
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <addon.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{addon.title}</CardTitle>
                  <CardDescription className="text-sm">
                    {addon.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-0">
                  {addon.href ? (
                    <a
                      href={addon.href}
                      className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                    >
                      {addon.action}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </a>
                  ) : (
                    <a
                      href="mailto:support@tzmicha.com"
                      className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                    >
                      {addon.action}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="scroll-mt-20 border-t border-border px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-foreground">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQS.map((item) => (
              <Card key={item.q} className="border-border bg-card">
                <CardContent className="pt-6">
                  <h3 className="font-medium text-foreground">{item.q}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.a}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Sales */}
      <section
        id="contact"
        className="scroll-mt-20 border-t border-border bg-muted/20 px-4 py-16 sm:px-6"
      >
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-foreground">Contact sales</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Need a custom plan, higher volume, or billing arranged for you?
            Tell us about your business and we will recommend the right setup.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a href="mailto:support@tzmicha.com">
              <Button>
                support@tzmicha.com
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
            <Link href="/support">
              <Button variant="outline">Open a support ticket</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              TZmicha
            </span>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/refund" className="hover:text-foreground">
              Refund
            </Link>
            <Link href="/support" className="hover:text-foreground">
              Support
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 TZmicha. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
