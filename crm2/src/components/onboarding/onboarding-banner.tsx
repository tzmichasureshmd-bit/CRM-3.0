"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Users,
  MessageSquare,
  Upload,
  Layers,
  Zap,
  CreditCard,
  ChevronRight,
  X,
  CheckCircle2,
} from "lucide-react";
import {
  IllustrationTeam,
  IllustrationWhatsApp,
  IllustrationContacts,
  IllustrationTemplate,
  IllustrationAutomation,
  IllustrationPlan,
  IllustrationConnect,
  IllustrationTrack,
  IllustrationDeliver,
} from "./step-illustrations";

const ONBOARDING_DISMISSED_KEY = "onboarding_dismissed_v2";

interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  illustration: React.ReactNode;
  href: string;
  completed: boolean;
  cta: string;
  preview: {
    heading: string;
    body: string;
    ctaLabel: string;
  };
}

function getGreeting(name: string) {
  const h = new Date().getHours();
  const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return { time, name };
}

export function OnboardingBanner() {
  const { accountId, user, profile } = useAuth();
  const supabase = createClient();
  const [dismissed, setDismissed] = useState(false);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const checkOnboarding = useCallback(async () => {
    if (!accountId || !user) return;
    try {
      if (localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true") {
        setDismissed(true);
        setLoading(false);
        return;
      }

      const [
        { data: sub },
        { data: whatsapp },
        { count: contactCount },
        { count: memberCount },
        { count: templateCount },
        { count: automationCount },
      ] = await Promise.all([
        supabase.from("business_subscriptions").select("status").eq("account_id", accountId).in("status", ["active", "trialing"]).limit(1).maybeSingle(),
        supabase.from("whatsapp_config").select("id").eq("account_id", accountId).limit(1),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("account_id", accountId),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("account_id", accountId),
        supabase.from("message_templates").select("id", { count: "exact", head: true }).eq("account_id", accountId),
        supabase.from("automations").select("id", { count: "exact", head: true }).eq("account_id", accountId),
      ]);

      const hasPlan = !!sub;
      const hasWhatsApp = !!whatsapp && whatsapp.length > 0;
      const hasContacts = (contactCount ?? 0) > 0;
      const hasTeam = (memberCount ?? 0) > 1;
      const hasTemplate = (templateCount ?? 0) > 0;
      const hasAutomation = (automationCount ?? 0) > 0;

      if (hasPlan && hasWhatsApp && hasContacts && hasTeam && hasTemplate && hasAutomation) {
        setDismissed(true);
        setLoading(false);
        return;
      }

      const built: SetupStep[] = [
        {
          id: "team",
          title: "Invite your team",
          description: "Add teammates to collaborate on conversations.",
          icon: <Users className="h-4 w-4" />,
          illustration: <IllustrationTeam />,
          href: "/settings?tab=members",
          completed: hasTeam,
          cta: "Invite users",
          preview: {
            heading: "Invite your team",
            body: "Stay connected and collaborate with your team members to share sales updates from one platform.",
            ctaLabel: "Invite users",
          },
        },
        {
          id: "whatsapp",
          title: "Connect WhatsApp",
          description: "Link your WhatsApp Business account to start messaging.",
          icon: <MessageSquare className="h-4 w-4" />,
          illustration: <IllustrationWhatsApp />,
          href: "/settings?tab=whatsapp",
          completed: hasWhatsApp,
          cta: "Connect now",
          preview: {
            heading: "Connect WhatsApp Business",
            body: "Link your official WhatsApp Business number to send and receive messages directly from your CRM.",
            ctaLabel: "Connect now",
          },
        },
        {
          id: "contacts",
          title: "Import contacts",
          description: "Add your existing customers and leads.",
          icon: <Upload className="h-4 w-4" />,
          illustration: <IllustrationContacts />,
          href: "/contacts",
          completed: hasContacts,
          cta: "Import contacts",
          preview: {
            heading: "Import your contacts",
            body: "Bring in your existing customer list via CSV or add contacts manually to get started quickly.",
            ctaLabel: "Go to Contacts",
          },
        },
        {
          id: "template",
          title: "Create a template",
          description: "Build reusable message templates for outreach.",
          icon: <Layers className="h-4 w-4" />,
          illustration: <IllustrationTemplate />,
          href: "/templates",
          completed: hasTemplate,
          cta: "Create template",
          preview: {
            heading: "Create message templates",
            body: "Design reusable WhatsApp-approved templates for broadcasts, follow-ups, and automated replies.",
            ctaLabel: "Create template",
          },
        },
        {
          id: "automation",
          title: "Set up automation",
          description: "Automate responses and workflows to save time.",
          icon: <Zap className="h-4 w-4" />,
          illustration: <IllustrationAutomation />,
          href: "/automations",
          completed: hasAutomation,
          cta: "Set up automation",
          preview: {
            heading: "Automate your workflows",
            body: "Trigger actions on inbound messages, keywords, or schedules — no code required.",
            ctaLabel: "Open Automations",
          },
        },
        {
          id: "plan",
          title: "Choose your plan",
          description: "Select a plan that fits your business needs.",
          icon: <CreditCard className="h-4 w-4" />,
          illustration: <IllustrationPlan />,
          href: "/billing",
          completed: hasPlan,
          cta: "View plans",
          preview: {
            heading: "Choose your plan",
            body: "Unlock the full power of your CRM — pick a plan that scales with your team and message volume.",
            ctaLabel: "View plans",
          },
        },
      ];

      setSteps(built);
      const first = built.find((s) => !s.completed);
      if (first) setActiveId(first.id);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [accountId, user, supabase]);

  useEffect(() => { checkOnboarding(); }, [checkOnboarding]);

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
    setDismissed(true);
  };

  if (loading || dismissed || steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.completed).length;
  if (completedCount === steps.length) return null;

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const { time } = getGreeting(firstName);
  const active = steps.find((s) => s.id === activeId) ?? steps.find((s) => !s.completed) ?? steps[0];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      {/* dismiss */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr]">
        {/* ── Left: greeting card ── */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-t-2xl bg-gradient-to-br from-teal-400/20 via-cyan-300/10 to-sky-400/10 p-6 lg:rounded-l-2xl lg:rounded-tr-none">
          <div>
            <p className="text-2xl font-bold text-foreground">
              {time},<br />
              <span className="text-primary">{firstName} 👋</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              We&apos;re happy to bring you aboard the world&apos;s favourite CRM!
            </p>
            <p className="mt-3 text-sm font-semibold text-foreground">Let&apos;s get started!</p>
          </div>

          {/* Connect / Track / Deliver illustrations */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { label: "Connect", node: <IllustrationConnect /> },
              { label: "Track",   node: <IllustrationTrack /> },
              { label: "Deliver", node: <IllustrationDeliver /> },
            ].map(({ label, node }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="h-16 w-full text-primary">{node}</div>
                <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          {/* progress pill */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{completedCount} of {steps.length} steps complete</span>
              <span>{Math.round((completedCount / steps.length) * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.round((completedCount / steps.length) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Right: setup panel ── */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] lg:grid-cols-[1.2fr_1fr]">
          {/* Step list */}
          <div className="border-t border-border p-4 lg:border-l lg:border-t-0">
            <p className="mb-3 text-sm font-semibold text-foreground">Set up your CRM</p>
            <p className="mb-4 text-xs text-muted-foreground">Make your CRM smarter and more interactive</p>
            <ul className="space-y-1.5">
              {steps.map((step) => (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(step.id)}
                    className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                      activeId === step.id
                        ? "border-primary/40 bg-primary/5"
                        : step.completed
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-border hover:border-primary/20 hover:bg-muted/40"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                        step.completed
                          ? "bg-emerald-500/10 text-emerald-500"
                          : activeId === step.id
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {step.completed ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
                    </span>
                    <span className={`flex-1 text-sm font-medium ${step.completed ? "text-emerald-500 line-through decoration-emerald-500/40" : "text-foreground"}`}>
                      {step.title}
                    </span>
                    {!step.completed && (
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${activeId === step.id ? "rotate-90 text-primary" : ""}`} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Preview panel */}
          <div className="flex flex-col items-center justify-center gap-3 border-t border-border p-5 text-center sm:border-l lg:border-t-0">
            <div className="h-24 w-32 text-primary">
              {active.illustration}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{active.preview.heading}</p>
              <p className="mt-1 text-xs text-muted-foreground">{active.preview.body}</p>
            </div>
            {!active.completed && (
              <Link
                href={active.href}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {active.preview.ctaLabel}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
