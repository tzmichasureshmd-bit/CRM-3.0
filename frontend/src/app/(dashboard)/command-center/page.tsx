"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, Users, Clock, BarChart3, Flame,
  MessageSquare, Target, Brain, Zap, Megaphone,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { RevenueChart }        from "@/components/dashboard/revenue-chart";
import { AIInsightCard }       from "@/components/dashboard/ai-insight-card";
import { LeadSourcesCard }     from "@/components/dashboard/lead-sources-card";
import { AttentionCards }      from "@/components/dashboard/attention-cards";
import { RecentConversations } from "@/components/dashboard/recent-conversations";
import { PipelineOverview }    from "@/components/dashboard/pipeline-overview";
import { AICopilotPanel }      from "@/components/dashboard/ai-copilot-panel";

/* ── Demo data (replace with real API calls) ─────────────── */
const KPIS = [
  { label: "Revenue",          value: "₹8,24,000",  trend: "+12%", up: true,  icon: TrendingUp,   color: "#4F6EF7", bg: "rgba(79,110,247,0.12)"  },
  { label: "Pipeline",         value: "₹24,80,000", trend: "+8%",  up: true,  icon: BarChart3,    color: "#06B6D4", bg: "rgba(6,182,212,0.12)"   },
  { label: "Hot Leads",        value: "52",          trend: "+22%", up: true,  icon: Users,        color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  { label: "Pending Follow-ups",value: "18",         trend: "-5%",  up: false, icon: Clock,        color: "#F97316", bg: "rgba(249,115,22,0.12)"  },
  { label: "Conversion Rate",  value: "24.6%",       trend: "+3.2%",up: true,  icon: Target,       color: "#8B5CF6", bg: "rgba(139,92,246,0.12)"  },
];

const ATTENTION = [
  { icon: Flame,          label: "Hot Leads",          count: 5,  sub: "Waiting for response",  href: "/leads",                   color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
  { icon: Clock,          label: "Follow-ups",          count: 3,  sub: "Overdue follow-ups",    href: "/automations/followups",   color: "#F97316", bg: "rgba(249,115,22,0.12)"  },
  { icon: MessageSquare,  label: "Conversations",       count: 12, sub: "Important messages",    href: "/inbox",                   color: "#4F6EF7", bg: "rgba(79,110,247,0.12)"  },
  { icon: TrendingUp,     label: "Opportunities",       count: 4,  sub: "Likely to convert",     href: "/pipelines",               color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  { icon: Brain,          label: "AI Recommendations",  count: 3,  sub: "Actions suggested",     href: "/copilot",                 color: "#8B5CF6", bg: "rgba(139,92,246,0.12)"  },
  { icon: Megaphone,      label: "Campaigns",           count: 2,  sub: "Need attention",        href: "/campaigns",               color: "#EC4899", bg: "rgba(236,72,153,0.12)"  },
];

/* ── KPI Card ─────────────────────────────────────────────── */
function KPICard({ kpi, i }: { kpi: typeof KPIS[0]; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.35 } }}
      className="glass glass-hover rounded-2xl p-5 cursor-default"
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: kpi.bg }}
        >
          <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
        </div>
        <span
          className={`flex items-center gap-0.5 text-xs font-semibold ${kpi.up ? "trend-up" : "trend-down"}`}
        >
          {kpi.up
            ? <ArrowUpRight className="h-3.5 w-3.5" />
            : <ArrowDownRight className="h-3.5 w-3.5" />}
          {kpi.trend}
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--crm-foreground)" }}>
        {kpi.value}
      </p>
      <p className="mt-0.5 text-xs font-medium" style={{ color: "var(--crm-muted-fg)" }}>
        {kpi.label}
      </p>
    </motion.div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function CommandCenterPage() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours();
  const greeting = h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  const dateStr  = now.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const timeStr  = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5">

      {/* ── Greeting ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
          >
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--crm-foreground)" }}>
              {greeting}, John 👋
            </h1>
            <p className="text-sm" style={{ color: "var(--crm-muted-fg)" }}>
              Here&apos;s what needs your attention today.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium" style={{ color: "var(--crm-muted-fg)" }}>{dateStr}</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--crm-foreground)" }}>{timeStr}</p>
        </div>
      </motion.div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {KPIS.map((kpi, i) => <KPICard key={kpi.label} kpi={kpi} i={i} />)}
      </div>

      {/* ── Revenue + AI Insights + Lead Sources ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3"><RevenueChart /></div>
        <div className="lg:col-span-1"><AIInsightCard /></div>
        <div className="lg:col-span-1"><LeadSourcesCard /></div>
      </div>

      {/* ── Attention ── */}
      <div>
        <h2 className="mb-4 text-lg font-bold" style={{ color: "var(--crm-foreground)" }}>
          What Needs Your Attention?
        </h2>
        <AttentionCards items={ATTENTION} />
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RecentConversations />
        <PipelineOverview />
        <AICopilotPanel />
      </div>

    </div>
  );
}
