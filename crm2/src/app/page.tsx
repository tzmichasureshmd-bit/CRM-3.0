import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Fragment } from "react";
import {
  MessageSquare,
  ArrowRight,
  Users,
  BarChart3,
  Megaphone,
  FileText,
  Shield,
  CreditCard,
  Zap,
  CheckCircle2,
  ChevronDown,
  Bot,
  GitBranch,
  Bell,
  Workflow,
  Images,
  Globe,
  Inbox,
  Radio,
  UserPlus,
  ArrowDown,
  Sparkles,
  ThumbsUp,
  Camera,
  LayoutDashboard,
  UserCheck,
  Repeat,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingMarquee } from "@/components/landing/landing-marquee";
import { LandingReveal } from "@/components/landing/landing-reveal";

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const heroFloatCards = [
  { icon: UserPlus, text: "New Facebook Lead", color: "text-blue-500", delay: "landing-float-card-delay-1" },
  { icon: MessageSquare, text: "New WhatsApp Message", color: "text-emerald-500", delay: "landing-float-card-delay-2" },
  { icon: CheckCircle2, text: "Lead Converted", color: "text-primary", delay: "landing-float-card-delay-3" },
  { icon: Bell, text: "Follow-up Due", color: "text-amber-500", delay: "landing-float-card-delay-4" },
];

const features = [
  { icon: Inbox, title: "Unified Inbox", description: "Manage customer conversations from WhatsApp, Facebook and Instagram in one place." },
  { icon: Users, title: "Lead Management", description: "Capture, organize and follow up with every lead from every channel." },
  { icon: Zap, title: "WhatsApp Automation", description: "Automate repetitive conversations, follow-ups and responses with AI." },
  { icon: Megaphone, title: "Campaigns", description: "Reach thousands of customers with targeted WhatsApp broadcast campaigns." },
  { icon: FileText, title: "Templates", description: "Create and manage reusable WhatsApp message templates for any scenario." },
  { icon: Bot, title: "AI Agents", description: "Deploy AI-powered agents to handle conversations and qualify leads 24/7." },
  { icon: GitBranch, title: "Sales Pipelines", description: "Visual Kanban pipelines to track every deal from first contact to close." },
  { icon: BarChart3, title: "Reports & Analytics", description: "Track response times, conversion rates and team performance in real time." },
  { icon: Workflow, title: "Flows & Automations", description: "Build no-code visual flows to automate your entire customer journey." },
  { icon: Radio, title: "Broadcasts", description: "Send personalized bulk messages with scheduling and delivery tracking." },
  { icon: Bell, title: "Notifications", description: "Never miss a message or follow-up with real-time smart notifications." },
  { icon: Shield, title: "Multi-Tenant Security", description: "Enterprise-grade security with role-based access and data isolation." },
];

const leadSources = [
  { name: "Facebook Leads", icon: Globe, count: "120", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { name: "Instagram Leads", icon: Images, count: "85", color: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  { name: "WhatsApp Leads", icon: MessageSquare, count: "240", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  { name: "Website Leads", icon: Globe, count: "42", color: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
];

type LeadFlowStep = {
  label: string;
  icon: LucideIcon;
  tint: string;
  ring: string;
  central?: boolean;
  final?: boolean;
};

const leadFlow: LeadFlowStep[] = [
  { label: "Facebook Lead", icon: ThumbsUp, tint: "bg-blue-500/10 text-blue-500", ring: "border-blue-500/20" },
  { label: "Instagram Lead", icon: Camera, tint: "bg-pink-500/10 text-pink-500", ring: "border-pink-500/20" },
  { label: "WhatsApp Conversation", icon: MessageSquare, tint: "bg-emerald-500/10 text-emerald-500", ring: "border-emerald-500/20" },
  { label: "CRM Central Hub", icon: LayoutDashboard, central: true, tint: "", ring: "" },
  { label: "Assigned Agent", icon: UserCheck, tint: "bg-amber-500/10 text-amber-500", ring: "border-amber-500/20" },
  { label: "Follow-up", icon: Repeat, tint: "bg-violet-500/10 text-violet-500", ring: "border-violet-500/20" },
  { label: "Converted Customer", icon: CheckCircle2, final: true, tint: "", ring: "" },
];

function flowCardClass(step: LeadFlowStep) {
  if (step.central) return "border-primary/40 bg-primary/10 shadow-md shadow-primary/5";
  if (step.final) return "border-emerald-500/40 bg-emerald-500/10 shadow-md shadow-emerald-500/5";
  return `border-border/60 bg-card/60 backdrop-blur-sm ${step.ring}`;
}

function flowIconClass(step: LeadFlowStep) {
  if (step.central) return "bg-primary text-primary-foreground shadow-sm shadow-primary/30";
  if (step.final) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  return step.tint;
}

function flowLabelClass(step: LeadFlowStep) {
  if (step.central) return "text-primary";
  if (step.final) return "text-emerald-600 dark:text-emerald-400";
  return "text-foreground";
}

const plans = [
  {
    name: "Starter",
    price: "\u20B9499",
    period: "/month",
    features: [
      "2 team members",
      "5,000 contacts",
      "1 WhatsApp number",
      "Shared inbox",
      "Contact management",
    ],
    popular: false,
  },
  {
    name: "Business",
    price: "\u20B9999",
    period: "/month",
    features: [
      "5 team members",
      "25,000 contacts",
      "1 WhatsApp number",
      "Everything in Starter",
      "Campaigns & templates",
      "Automation",
      "Analytics",
    ],
    popular: true,
  },
  {
    name: "Professional",
    price: "\u20B91,999",
    period: "/month",
    features: [
      "15 team members",
      "100,000 contacts",
      "3 WhatsApp numbers",
      "Everything in Business",
      "Advanced automation",
      "Priority support",
    ],
    popular: false,
  },
];

const faqs = [
  { question: "What is WhatsApp CRM?", answer: "A CRM that connects to your WhatsApp Business account, helping you manage conversations, contacts, campaigns, and team collaboration \u2014 all in one powerful platform." },
  { question: "Can I use my own WhatsApp Business number?", answer: "Yes. You connect your own WhatsApp Business API number through our secure embedded signup. Your data stays under your control." },
  { question: "How does the subscription work?", answer: "Choose a plan, pay monthly or yearly. Your plan determines your limits for contacts, team members, and features." },
  { question: "Can I upgrade my plan?", answer: "Yes. Upgrade anytime from your billing page. The price difference is prorated." },
  { question: "Can I cancel my subscription?", answer: "Yes. Cancel anytime from your billing page. Your access continues until the end of the billing period." },
  { question: "How many team members can I add?", answer: "Depends on your plan: Starter (2), Business (5), Professional (15). Upgrade anytime." },
  { question: "Are WhatsApp/Meta messaging charges included?", answer: "No. Our pricing is for the CRM platform only. WhatsApp/Meta messaging charges are separate and billed by Meta." },
  { question: "Is there a free trial?", answer: "Every new account starts with a free trial. No credit card required to start." },
];

const dashboardCallouts = [
  { label: "Total Leads", value: "2,847", icon: Users },
  { label: "New Conversations", value: "184", icon: MessageSquare },
  { label: "Conversion Rate", value: "24.8%", icon: BarChart3 },
  { label: "Open Deals", value: "53", icon: GitBranch },
  { label: "Follow-ups", value: "37", icon: Bell },
  { label: "Campaign Performance", value: "92%", icon: Megaphone },
];

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export const metadata: Metadata = {
  title: "WhatsApp CRM | Manage Leads, Conversations & Sales | TZMICHA IT SOLUTIONS",
  description:
    "Manage WhatsApp conversations, leads, campaigns, automation and customer relationships from one powerful CRM. Connect Facebook, Instagram and WhatsApp in a single platform.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* ====== NAVIGATION ====== */}
      <div className="relative">
        <LandingNav />

        {/* ====== HERO ====== */}
        <LandingHero />
      </div>

      {/* ====== TRUST STRIP ====== */}
      <section className="border-y border-border/40 bg-muted/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
          {["WhatsApp Business", "Multi-User", "Secure", "24/7 Access", "Meta Verified", "Self-Hostable"].map((item) => (
            <span key={item} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3 text-primary" />
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* ====== MARQUEE 1 ====== */}
      <section className="border-b border-border/40 py-4">
        <LandingMarquee
          items={["WHATSAPP CRM", "LEAD MANAGEMENT", "AUTOMATION", "AI", "CAMPAIGNS", "ANALYTICS", "GROWTH", "PIPELINES", "BROADCASTS", "TEMPLATES"]}
        />
      </section>

      {/* ====== PRODUCT SHOWCASE ====== */}
      <section id="product" className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <div className="mb-14 text-center">
              <Badge variant="secondary" className="mb-4 text-xs">
                <Sparkles className="mr-1.5 size-3" />
                Product
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Everything Your Team Needs To Grow
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                A complete WhatsApp CRM that centralizes conversations, leads, campaigns and automation
                so your team can focus on what matters: closing deals.
              </p>
            </div>
          </LandingReveal>

          <LandingReveal delay={100}>
            <div className="landing-perspective">
              <div className="relative mx-auto max-w-4xl">
                <div className="absolute -inset-6 rounded-3xl bg-primary/5 blur-3xl landing-glow" />
                <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/10 landing-3d-tilt">
                  <Image
                    src="/crm/crm2.jpeg"
                    alt="WhatsApp CRM Inbox and Lead Management"
                    width={1200}
                    height={750}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </div>
          </LandingReveal>

          {/* Feature cards around the showcase */}
          <LandingReveal delay={200}>
            <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Inbox, title: "Unified Inbox", desc: "All conversations in one place." },
                { icon: Users, title: "Lead Management", desc: "Capture and follow up with every lead." },
                { icon: Zap, title: "WhatsApp Automation", desc: "Automate repetitive follow-ups." },
                { icon: Megaphone, title: "Campaigns", desc: "Targeted messages at scale." },
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm landing-card-hover">
                  <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="h-4.5 w-4.5" />
                  </div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </LandingReveal>
        </div>
      </section>

      {/* ====== MARQUEE 2 (reverse) ====== */}
      <section className="border-y border-border/40 py-4">
        <LandingMarquee
          reverse
          items={["CONNECT", "ENGAGE", "AUTOMATE", "CONVERT", "GROW"]}
          speed="25s"
        />
      </section>

      {/* ====== ALL FEATURES ====== */}
      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <div className="mb-14 text-center">
              <Badge variant="secondary" className="mb-4 text-xs">
                <Zap className="mr-1.5 size-3" />
                Features
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Built for Modern Sales Teams
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Every tool your team needs to manage WhatsApp conversations, convert leads, and grow revenue.
              </p>
            </div>
          </LandingReveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {features.map((feature, i) => (
              <LandingReveal key={feature.title} delay={i * 50}>
                <div className="group h-full rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:bg-card landing-card-hover">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              </LandingReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ====== LEADS SECTION ====== */}
      <section id="leads" className="relative overflow-hidden border-y border-border/40 bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <div className="mb-14 text-center">
              <Badge variant="secondary" className="mb-4 text-xs">
                <UserPlus className="mr-1.5 size-3" />
                Lead Management
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Never Lose a Lead Again
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Capture leads from Facebook, Instagram, WhatsApp and your website.
                Every lead is automatically organized, assigned and followed up.
              </p>
            </div>
          </LandingReveal>

          {/* Lead source cards */}
          <LandingReveal delay={100}>
            <div className="mx-auto mb-16 grid max-w-3xl grid-cols-2 gap-4 lg:grid-cols-4">
              {leadSources.map((source) => (
                <div key={source.name} className={`rounded-xl border p-4 text-center landing-card-hover ${source.color}`}>
                  <source.icon className="mx-auto mb-2 h-6 w-6" />
                  <p className="text-2xl font-bold">{source.count}</p>
                  <p className="mt-1 text-xs font-medium opacity-80">{source.name}</p>
                </div>
              ))}
            </div>
          </LandingReveal>

          {/* Lead flow visualization */}
          <LandingReveal delay={200}>
            <div className="mx-auto max-w-5xl">
              {/* Desktop horizontal flow */}
              <div className="hidden items-stretch md:flex">
                {leadFlow.map((step, i) => (
                  <Fragment key={step.label}>
                    <div
                      className={`flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center transition-all duration-300 landing-card-hover ${flowCardClass(step)}`}
                    >
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${flowIconClass(step)}`}>
                        <step.icon className="h-4 w-4" />
                      </div>
                      <div className="text-center">
                        <p className={`text-[11px] font-semibold leading-tight ${flowLabelClass(step)}`}>{step.label}</p>
                        {step.central && (
                          <span className="mt-1 inline-block rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                            Hub
                          </span>
                        )}
                        {step.final && (
                          <span className="mt-1 inline-block rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            Goal
                          </span>
                        )}
                      </div>
                    </div>
                    {i < leadFlow.length - 1 && (
                      <div className="flex w-5 shrink-0 items-center justify-center">
                        <ArrowRight className="size-3.5 text-muted-foreground/60" />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>

              {/* Mobile vertical flow */}
              <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2 md:hidden">
                {leadFlow.map((step, i) => (
                  <Fragment key={step.label}>
                    <div className={`flex w-full items-center gap-3 rounded-xl border p-3 ${flowCardClass(step)}`}>
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${flowIconClass(step)}`}>
                        <step.icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${flowLabelClass(step)}`}>{step.label}</p>
                        {(step.central || step.final) && (
                          <span
                            className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                              step.central ? "bg-primary/15 text-primary" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {step.central ? "Central Hub" : "Goal"}
                          </span>
                        )}
                      </div>
                    </div>
                    {i < leadFlow.length - 1 && <ArrowDown className="size-4 text-muted-foreground/50" />}
                  </Fragment>
                ))}
              </div>
            </div>
          </LandingReveal>

          {/* Compact product visuals */}
          <LandingReveal delay={300}>
            <div className="mx-auto mt-16 grid max-w-5xl gap-5 lg:grid-cols-3">
              {/* Unified inbox mock */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm landing-card-hover">
                <div className="mb-5 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Inbox className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Unified Inbox</p>
                    <p className="text-xs text-muted-foreground">One place for every channel</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {[
                    { icon: Globe, tint: "bg-blue-500/10 text-blue-500" },
                    { icon: Images, tint: "bg-pink-500/10 text-pink-500" },
                    { icon: MessageSquare, tint: "bg-emerald-500/10 text-emerald-500" },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 p-2.5">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${c.tint}`}>
                        <c.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="h-2 flex-1 rounded-full bg-muted-foreground/15" />
                      <div className="h-2 w-10 rounded-full bg-muted-foreground/10" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent assignment mock */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm landing-card-hover">
                <div className="mb-5 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Agent Assignment</p>
                    <p className="text-xs text-muted-foreground">Every lead routed instantly</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 p-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="h-2 flex-1 rounded-full bg-muted-foreground/15" />
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                        <UserCheck className="size-3" />
                        Assigned
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conversion mock */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm landing-card-hover">
                <div className="mb-5 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Customer Conversion</p>
                    <p className="text-xs text-muted-foreground">From first message to closed deal</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {["Message", "Reply", "Qualify", "Close"].map((s, i) => (
                    <Fragment key={s}>
                      <div className="flex-1">
                        <div
                          className={`flex h-8 items-center justify-center rounded-lg border text-[10px] font-semibold ${
                            i === 3
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "border-border/50 bg-muted/20 text-muted-foreground"
                          }`}
                        >
                          {i === 3 && <CheckCircle2 className="mr-1 size-3" />}
                          {s}
                        </div>
                      </div>
                      {i < 3 && <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />}
                    </Fragment>
                  ))}
                </div>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-primary to-emerald-500" />
                </div>
              </div>
            </div>
          </LandingReveal>
        </div>
      </section>

      {/* ====== DASHBOARD ANALYTICS SECTION ====== */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <div className="mb-14 text-center">
              <Badge variant="secondary" className="mb-4 text-xs">
                <BarChart3 className="mr-1.5 size-3" />
                Analytics
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Your Entire Business At A Glance
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Real-time dashboards that give you complete visibility into leads, conversations, campaigns and team performance.
              </p>
            </div>
          </LandingReveal>

          {/* Dashboard callouts grid */}
          <LandingReveal delay={100}>
            <div className="mx-auto mb-12 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {dashboardCallouts.map((item) => (
                <div key={item.label} className="rounded-xl border border-border/60 bg-card/60 p-4 text-center backdrop-blur-sm landing-card-hover">
                  <item.icon className="mx-auto mb-2 h-5 w-5 text-primary" />
                  <p className="text-xl font-bold">{item.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </LandingReveal>

          <LandingReveal delay={200}>
            <div className="landing-perspective mx-auto max-w-5xl">
              <div className="relative">
                <div className="absolute -inset-6 rounded-3xl bg-primary/5 blur-3xl landing-glow" />
                <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/10 landing-3d-tilt">
                  <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                    <span className="ml-3 h-5 w-32 rounded-md bg-muted/70 sm:w-48" />
                    <span className="ml-auto hidden rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground sm:block">
                      TZMICHA &middot; Analytics
                    </span>
                  </div>
                  <Image
                    src="/crm/crm1.jpeg"
                    alt="WhatsApp CRM Dashboard Analytics"
                    width={1200}
                    height={750}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </div>
          </LandingReveal>
        </div>
      </section>

      {/* ====== HOW IT WORKS ====== */}
      <section className="border-y border-border/40 bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <div className="mb-14 text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Get Started in Minutes
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                Four simple steps to transform your WhatsApp business communication.
              </p>
            </div>
          </LandingReveal>

          <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { number: "01", title: "Create Account", desc: "Sign up in seconds. No credit card required." },
              { number: "02", title: "Connect WhatsApp", desc: "Link your WhatsApp Business number securely." },
              { number: "03", title: "Invite Your Team", desc: "Add teammates and assign roles." },
              { number: "04", title: "Start Growing", desc: "Manage conversations and close deals." },
            ].map((step, i) => (
              <LandingReveal key={step.number} delay={i * 80}>
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
                    {step.number}
                  </div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </LandingReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ====== PRICING ====== */}
      <section id="pricing" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LandingReveal>
            <div className="mb-14 text-center">
              <Badge variant="secondary" className="mb-4 text-xs">
                <CreditCard className="mr-1.5 size-3" />
                Pricing
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Simple, Transparent Pricing
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                No hidden fees. No per-message charges. Start free and scale as you grow.
              </p>
            </div>
          </LandingReveal>

          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
            {plans.map((plan, i) => (
              <LandingReveal key={plan.name} delay={i * 80}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl border p-6 transition-all duration-300 landing-card-hover ${
                    plan.popular
                      ? "border-primary/50 bg-card shadow-lg shadow-primary/5 ring-1 ring-primary/20"
                      : "border-border/60 bg-card/60"
                  }`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                      MOST POPULAR
                    </Badge>
                  )}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className="mt-6 block">
                    <Button
                      className="w-full landing-btn-lift"
                      variant={plan.popular ? "default" : "outline"}
                    >
                      Get Started
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </Link>
                </div>
              </LandingReveal>
            ))}
          </div>

          <LandingReveal delay={300}>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Need a custom plan?{" "}
              <a
                href="mailto:support@tzmicha.com"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Contact Sales
              </a>
            </p>
          </LandingReveal>
        </div>
      </section>

      {/* ====== FAQ ====== */}
      <section id="faq" className="border-y border-border/40 bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <LandingReveal>
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Frequently Asked Questions
              </h2>
              <p className="mt-3 text-muted-foreground">
                Everything you need to know about TZMICHA WhatsApp CRM
              </p>
            </div>
          </LandingReveal>

          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <LandingReveal key={faq.question} delay={i * 40}>
                <details className="group rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-sm font-medium">
                    {faq.question}
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                    {faq.answer}
                  </div>
                </details>
              </LandingReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ====== FINAL CTA ====== */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="absolute inset-0 landing-dots-bg opacity-40" />
        <div className="absolute left-1/2 top-1/2 -z-10 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl landing-glow" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <LandingReveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Ready to Turn Conversations Into Customers?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Start your free trial today. No credit card required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup">
                <Button size="lg" className="px-8 landing-btn-lift">
                  Start Free Trial
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <a href="mailto:support@tzmicha.com">
                <Button variant="outline" size="lg" className="px-8">
                  Talk to Sales
                </Button>
              </a>
            </div>
          </LandingReveal>
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer className="border-t border-white/10 bg-[#111]">
        <div className="mx-auto max-w-7xl px-4 pt-14 pb-0 sm:px-6 lg:px-8">
          {/* Link columns */}
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">Product</h4>
              <ul className="space-y-3 text-sm text-white/60">
                <li><a href="#features" className="transition-colors hover:text-white">Features</a></li>
                <li><a href="#pricing" className="transition-colors hover:text-white">Pricing</a></li>
                <li><a href="#product" className="transition-colors hover:text-white">Product</a></li>
                <li><a href="#leads" className="transition-colors hover:text-white">Lead Management</a></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">Company</h4>
              <ul className="space-y-3 text-sm text-white/60">
                <li><a href="mailto:support@tzmicha.com" className="transition-colors hover:text-white">Contact</a></li>
                <li><a href="mailto:support@tzmicha.com" className="transition-colors hover:text-white">Support</a></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">Legal</h4>
              <ul className="space-y-3 text-sm text-white/60">
                <li><Link href="/privacy" className="transition-colors hover:text-white">Privacy Policy</Link></li>
                <li><Link href="/terms" className="transition-colors hover:text-white">Terms of Service</Link></li>
                <li><Link href="/refund" className="transition-colors hover:text-white">Refund Policy</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">Resources</h4>
              <ul className="space-y-3 text-sm text-white/60">
                <li><Link href="/login" className="transition-colors hover:text-white">Login</Link></li>
                <li><Link href="/signup" className="transition-colors hover:text-white">Sign Up</Link></li>
                <li><Link href="/support" className="transition-colors hover:text-white">Help Center</Link></li>
              </ul>
            </div>
          </div>

          {/* Logo */}
          <div className="mt-16 flex justify-center">
            <Image src="/images/logo.png" alt="TZMICHA" width={120} height={40} className="opacity-80" />
          </div>

          {/* Big brand name — Google-style */}
          <div className="mt-4 select-none overflow-hidden">
            <p
              className="whitespace-nowrap text-center font-extrabold leading-none tracking-tighter text-white"
              style={{ fontSize: "clamp(2rem, 9vw, 7rem)" }}
            >
              TZMICHACRM 2.0
            </p>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/10 py-5 text-center text-xs text-white/30">
            &copy; 2026 TZMICHA IT SOLUTIONS. All rights reserved. &nbsp;|&nbsp; Not affiliated with Meta or WhatsApp.
          </div>
        </div>
      </footer>
    </div>
  );
}
