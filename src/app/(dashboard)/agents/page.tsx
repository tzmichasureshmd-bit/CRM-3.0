"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Zap,
  Activity,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  Settings2,
  History,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Clock,
  Sparkles,
  Layers,
  Users,
  MessageSquare,
  DollarSign,
  Shield,
  FileText,
  Sliders,
  ExternalLink,
  Info,
} from "lucide-react";
import type {
  AIAgent,
  AgentDepartment,
  AgentRun,
  AgentMetrics,
  AgentRunAction,
} from "@/types/crm3";
import { TOOLS_METADATA } from "@/lib/agents/engine";
import { toast } from "sonner";

/* ── Department Styles & Icons ──────────────────────────────── */
const DEPARTMENTS: {
  id: AgentDepartment | "all";
  label: string;
  color: string;
  bg: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}[] = [
  { id: "all", label: "All Departments", color: "#4F6EF7", bg: "rgba(79,110,247,0.12)", icon: Layers },
  { id: "sales", label: "Sales", color: "#10B981", bg: "rgba(16,185,129,0.12)", icon: TrendingUp },
  { id: "customer_support", label: "Customer Support", color: "#06B6D4", bg: "rgba(6,182,212,0.12)", icon: MessageSquare },
  { id: "marketing", label: "Marketing", color: "#EC4899", bg: "rgba(236,72,153,0.12)", icon: Sparkles },
  { id: "finance", label: "Finance", color: "#F59E0B", bg: "rgba(245,158,11,0.12)", icon: DollarSign },
  { id: "admin", label: "Admin & Ops", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)", icon: Shield },
  { id: "custom", label: "Custom Agents", color: "#6366F1", bg: "rgba(99,102,241,0.12)", icon: Bot },
];

function getDeptMeta(dept?: string) {
  return (
    DEPARTMENTS.find((d) => d.id === dept) || {
      id: "custom",
      label: "Custom",
      color: "#6366F1",
      bg: "rgba(99,102,241,0.12)",
      icon: Bot,
    }
  );
}

/* ── KPI Metric Card ────────────────────────────────────────── */
function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  bg,
  highlight = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: any;
  color: string;
  bg: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`glass rounded-2xl p-4 transition-all duration-200 ${
        highlight ? "ring-2 ring-amber-500/50" : ""
      }`}
      style={{
        background: highlight ? "rgba(245,158,11,0.06)" : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: bg }}
        >
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        </div>
        {highlight && (
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-amber-500 bg-amber-500/10 animate-pulse">
            Action Needed
          </span>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--crm-foreground)" }}>
        {value}
      </p>
      <p className="text-xs font-medium" style={{ color: "var(--crm-muted-fg)" }}>
        {label}
      </p>
      {sub && <p className="mt-0.5 text-[10px] opacity-70" style={{ color: "var(--crm-muted-fg)" }}>{sub}</p>}
    </div>
  );
}

/* ── Main AI Agents Dashboard Page ─────────────────────────── */
export default function AIAgentsPage() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [metrics, setMetrics] = useState<AgentMetrics>({
    total_agents: 0,
    enabled_agents: 0,
    total_executions: 0,
    pending_approvals: 0,
    success_rate: 100,
  });

  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState<AgentDepartment | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"directory" | "history" | "tools">("directory");

  // Modals state
  const [selectedAgentForRun, setSelectedAgentForRun] = useState<AIAgent | null>(null);
  const [selectedAgentForConfig, setSelectedAgentForConfig] = useState<AIAgent | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  // Fetch agents and runs
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, runsRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/agents/runs"),
      ]);

      if (agentsRes.ok) {
        const agData = await agentsRes.json();
        setAgents(agData.data || []);
        if (agData.metrics) setMetrics(agData.metrics);
      }

      if (runsRes.ok) {
        const runData = await runsRes.json();
        setRuns(runData.data || []);
      }
    } catch (err) {
      console.error("Failed to load AI Agents data:", err);
      toast.error("Error loading agent data. Checking offline mode.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle enable/disable status
  const handleToggleAgent = async (agent: AIAgent, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !agent.enabled;
    const previousAgents = [...agents];

    // Optimistic UI update
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agent.id ? { ...a, enabled: nextState, status: nextState ? "idle" : "paused" } : a
      )
    );

    try {
      const res = await fetch(`/api/agents/${agent.id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextState }),
      });

      if (!res.ok) throw new Error("Toggle request failed");
      const resData = await res.json();

      toast.success(
        nextState
          ? `Agent "${agent.name}" enabled and active`
          : `Agent "${agent.name}" disabled`
      );

      // Re-sync metrics
      setMetrics((prev) => ({
        ...prev,
        enabled_agents: nextState ? prev.enabled_agents + 1 : Math.max(0, prev.enabled_agents - 1),
      }));
    } catch (err: any) {
      // Revert optimistic update
      setAgents(previousAgents);
      toast.error(`Could not toggle agent: ${err.message || "Network error"}`);
    }
  };

  // Run agent execution
  const handleExecuteAgent = async (agent: AIAgent, customContext: Record<string, any> = {}) => {
    setRunningAction(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: customContext }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to execute agent");
      }

      if (data.requires_approval) {
        toast.warning(
          `Agent run requires human approval for sensitive actions. Review in History tab.`,
          { duration: 5000 }
        );
      } else {
        toast.success(`Agent "${agent.name}" executed successfully!`, { duration: 4000 });
      }

      // Refresh data
      await loadData();
      setSelectedAgentForRun(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to execute agent");
    } finally {
      setRunningAction(null);
    }
  };

  // Approve a pending run
  const handleApproveRun = async (runId: string) => {
    setRunningAction(runId);
    try {
      const res = await fetch(`/api/agents/runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Approval failed");
      }

      toast.success("Run approved! Authorized sensitive actions were executed.");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Approval execution failed");
    } finally {
      setRunningAction(null);
    }
  };

  // Reject a pending run
  const handleRejectRun = async (runId: string) => {
    setRunningAction(runId);
    try {
      const res = await fetch(`/api/agents/runs/${runId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Rejection failed");
      }

      toast.info("Run was rejected. Actions were blocked.");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject run");
    } finally {
      setRunningAction(null);
    }
  };

  // Filtered agents list
  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const deptMatch =
        selectedDept === "all" ||
        agent.department === selectedDept ||
        (selectedDept === "custom" && (!agent.department || agent.department === "custom"));
      const queryMatch =
        !searchQuery.trim() ||
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (agent.allowed_tools || []).some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return deptMatch && queryMatch;
    });
  }, [agents, selectedDept, searchQuery]);

  // Count by department for filter pills
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { all: agents.length };
    agents.forEach((a) => {
      const d = a.department || "custom";
      counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
  }, [agents]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Top Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-md"
            style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
          >
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--crm-foreground)" }}>
                AI Department Agents
              </h1>
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white bg-blue-600">
                CRM 3.0
              </span>
            </div>
            <p className="text-xs sm:text-sm" style={{ color: "var(--crm-muted-fg)" }}>
              Autonomous CRM intelligence, department specialists, and controlled action workflows
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold glass glass-hover transition-all"
            style={{ color: "var(--crm-foreground)" }}
            title="Refresh Agents & Executions"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:opacity-95"
            style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
          >
            <Plus className="h-4 w-4" />
            New Custom Agent
          </button>
        </div>
      </div>

      {/* ── Metric Summary Bar (Reflecting Real Data) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Total Agents"
          value={metrics.total_agents}
          sub="Configured in account"
          icon={Bot}
          color="#4F6EF7"
          bg="rgba(79,110,247,0.12)"
        />
        <MetricCard
          label="Active & Enabled"
          value={metrics.enabled_agents}
          sub={`${metrics.total_agents - metrics.enabled_agents} paused`}
          icon={Zap}
          color="#10B981"
          bg="rgba(16,185,129,0.12)"
        />
        <MetricCard
          label="Total Executions"
          value={metrics.total_executions}
          sub="All logged runs"
          icon={Activity}
          color="#8B5CF6"
          bg="rgba(139,92,246,0.12)"
        />
        <MetricCard
          label="Pending Approvals"
          value={metrics.pending_approvals}
          sub={metrics.pending_approvals > 0 ? "Requires review" : "All cleared"}
          icon={ShieldAlert}
          color="#F59E0B"
          bg="rgba(245,158,11,0.12)"
          highlight={metrics.pending_approvals > 0}
        />
        <MetricCard
          label="Success Rate"
          value={`${metrics.success_rate}%`}
          sub="Execution reliability"
          icon={CheckCircle2}
          color="#06B6D4"
          bg="rgba(6,182,212,0.12)"
        />
      </div>

      {/* ── View Navigation Tabs (Directory vs History vs Tools) ── */}
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--crm-glass-border-soft)" }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("directory")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeTab === "directory"
                ? "bg-white/20 shadow-sm font-bold"
                : "hover:bg-white/10 opacity-70"
            }`}
            style={{
              color: activeTab === "directory" ? "var(--brand-primary)" : "var(--crm-foreground)",
              border: activeTab === "directory" ? "1px solid var(--crm-glass-border)" : "1px solid transparent",
            }}
          >
            <Bot className="h-4 w-4" />
            Agent Directory ({agents.length})
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeTab === "history"
                ? "bg-white/20 shadow-sm font-bold"
                : "hover:bg-white/10 opacity-70"
            }`}
            style={{
              color: activeTab === "history" ? "var(--brand-primary)" : "var(--crm-foreground)",
              border: activeTab === "history" ? "1px solid var(--crm-glass-border)" : "1px solid transparent",
            }}
          >
            <History className="h-4 w-4" />
            Execution History ({runs.length})
            {metrics.pending_approvals > 0 && (
              <span className="rounded-full px-1.5 py-0.2 text-[10px] font-bold bg-amber-500 text-white">
                {metrics.pending_approvals}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("tools")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeTab === "tools"
                ? "bg-white/20 shadow-sm font-bold"
                : "hover:bg-white/10 opacity-70"
            }`}
            style={{
              color: activeTab === "tools" ? "var(--brand-primary)" : "var(--crm-foreground)",
              border: activeTab === "tools" ? "1px solid var(--crm-glass-border)" : "1px solid transparent",
            }}
          >
            <Sliders className="h-4 w-4" />
            Tools & Permissions
          </button>
        </div>

        {activeTab === "directory" && (
          <div className="relative hidden sm:block w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search agents or tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none transition-all"
              style={{
                background: "var(--crm-glass-bg)",
                border: "1px solid var(--crm-glass-border)",
                color: "var(--crm-foreground)",
              }}
            />
          </div>
        )}
      </div>

      {/* ── TAB 1: AGENT DIRECTORY ── */}
      {activeTab === "directory" && (
        <div className="space-y-5">
          {/* Department Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {DEPARTMENTS.map((dept) => {
              const active = selectedDept === dept.id;
              const count = deptCounts[dept.id] || 0;
              const Icon = dept.icon;
              return (
                <button
                  key={dept.id}
                  onClick={() => setSelectedDept(dept.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all ${
                    active ? "shadow-sm font-semibold" : "opacity-75 hover:opacity-100"
                  }`}
                  style={{
                    background: active ? dept.bg : "var(--crm-glass-bg)",
                    border: active ? `1.5px solid ${dept.color}` : "1px solid var(--crm-glass-border-soft)",
                    color: active ? dept.color : "var(--crm-foreground)",
                  }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: dept.color }} />
                  {dept.label}
                  <span
                    className="rounded-full px-1.5 py-0.2 text-[10px]"
                    style={{
                      background: active ? dept.color : "rgba(0,0,0,0.08)",
                      color: active ? "#fff" : "var(--crm-muted-fg)",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Agents Grid */}
          {filteredAgents.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <h3 className="text-base font-semibold" style={{ color: "var(--crm-foreground)" }}>
                No AI Agents Found
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                No agents match the selected department or search filter. Create a new custom agent or reset filters.
              </p>
              <button
                onClick={() => {
                  setSelectedDept("all");
                  setSearchQuery("");
                }}
                className="mt-4 rounded-xl px-4 py-2 text-xs font-semibold text-blue-600 bg-blue-500/10 hover:bg-blue-500/20"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAgents.map((agent) => {
                const deptMeta = getDeptMeta(agent.department);
                const DeptIcon = deptMeta.icon;
                const isRunning = runningAction === agent.id;

                return (
                  <motion.div
                    key={agent.id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass glass-hover rounded-2xl p-5 flex flex-col justify-between transition-all"
                    style={{
                      borderTop: `3px solid ${deptMeta.color}`,
                    }}
                  >
                    {/* Header Row */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        {/* Department Badge */}
                        <div
                          className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{ background: deptMeta.bg, color: deptMeta.color }}
                        >
                          <DeptIcon className="h-3 w-3" />
                          <span>{deptMeta.label}</span>
                        </div>

                        {/* Functional Enable/Disable Toggle Switch */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium" style={{ color: agent.enabled ? "var(--crm-foreground)" : "var(--crm-muted-fg)" }}>
                            {agent.enabled ? "Enabled" : "Disabled"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleToggleAgent(agent, e)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                              agent.enabled ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"
                            }`}
                            aria-label={`Toggle ${agent.name}`}
                            title={agent.enabled ? "Click to disable agent" : "Click to enable agent"}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out mt-0.5 ${
                                agent.enabled ? "translate-x-4.5" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Name & Type */}
                      <div className="mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold leading-snug" style={{ color: "var(--crm-foreground)" }}>
                            {agent.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] font-mono rounded px-1.5 py-0.5 bg-black/5 dark:bg-white/10" style={{ color: "var(--crm-muted-fg)" }}>
                            {agent.type}
                          </span>
                          <span className="text-[10px] rounded px-1.5 py-0.5 bg-blue-500/10 text-blue-500 font-medium">
                            {agent.model || "gpt-4o-mini"}
                          </span>
                          {agent.requires_approval ? (
                            <span className="flex items-center gap-0.5 text-[10px] rounded px-1.5 py-0.5 bg-amber-500/10 text-amber-500 font-medium" title="Sensitive write actions require manual human approval">
                              <ShieldAlert className="h-2.5 w-2.5" /> Approval Gate
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-[10px] rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 font-medium" title="Runs autonomously within authorized tools">
                              <Zap className="h-2.5 w-2.5" /> Autonomous
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs line-clamp-2 mb-3 leading-relaxed" style={{ color: "var(--crm-muted-fg)" }}>
                        {agent.description || "Specialized autonomous agent tailored for CRM record workflows."}
                      </p>

                      {/* Allowed Tools Chips */}
                      <div className="mb-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 opacity-70" style={{ color: "var(--crm-muted-fg)" }}>
                          Authorized Tools ({agent.allowed_tools?.length || 0})
                        </p>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-hidden">
                          {(agent.allowed_tools || []).slice(0, 4).map((tool) => (
                            <span
                              key={tool}
                              className="rounded-md px-2 py-0.5 text-[10px] font-mono bg-white/20 dark:bg-white/5 border border-white/20"
                              style={{ color: "var(--crm-foreground)" }}
                            >
                              {tool}
                            </span>
                          ))}
                          {(agent.allowed_tools || []).length > 4 && (
                            <span className="rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground bg-black/5">
                              +{(agent.allowed_tools || []).length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Footer / Stats & Actions */}
                    <div className="border-t pt-3" style={{ borderColor: "var(--crm-glass-border-soft)" }}>
                      <div className="flex items-center justify-between text-[11px] mb-3" style={{ color: "var(--crm-muted-fg)" }}>
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {agent.execution_count || 0} runs
                        </span>
                        <span>
                          {agent.last_run_at
                            ? `Last: ${new Date(agent.last_run_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                            : "Never run"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedAgentForRun(agent)}
                          disabled={!agent.enabled || isRunning}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-white transition-all ${
                            !agent.enabled
                              ? "opacity-40 cursor-not-allowed bg-gray-400"
                              : "hover:opacity-90 active:scale-98"
                          }`}
                          style={{
                            background: agent.enabled
                              ? "linear-gradient(135deg, #4F6EF7, #7C3AED)"
                              : undefined,
                          }}
                        >
                          <Play className={`h-3.5 w-3.5 ${isRunning ? "animate-spin" : ""}`} />
                          {isRunning ? "Running..." : "Run Agent"}
                        </button>

                        <button
                          onClick={() => setSelectedAgentForConfig(agent)}
                          className="flex h-8 w-8 items-center justify-center rounded-xl glass glass-hover transition-colors"
                          style={{ color: "var(--crm-muted-fg)" }}
                          title="Configure Agent instructions & permissions"
                        >
                          <Settings2 className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => {
                            setActiveTab("history");
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-xl glass glass-hover transition-colors"
                          style={{ color: "var(--crm-muted-fg)" }}
                          title="View Execution History"
                        >
                          <History className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: EXECUTION HISTORY ── */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold" style={{ color: "var(--crm-foreground)" }}>
                Execution Audit Trail & Approvals
              </h2>
              <p className="text-xs" style={{ color: "var(--crm-muted-fg)" }}>
                Real-time log of tool calls, inputs, outputs, tokens used, and human approval gates
              </p>
            </div>
            <button
              onClick={() => loadData()}
              className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Refresh Logs
            </button>
          </div>

          {runs.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <h3 className="text-base font-semibold" style={{ color: "var(--crm-foreground)" }}>
                No Executions Recorded Yet
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Trigger an agent from the directory to see real tool execution steps, timestamps, and results.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => {
                const isPending = run.status === "awaiting_approval";
                const isCompleted = run.status === "completed";
                const isFailed = run.status === "failed";
                const isProcessing = runningAction === run.id;

                return (
                  <div
                    key={run.id}
                    className="glass rounded-2xl p-5 space-y-3 transition-all"
                    style={{
                      borderLeft: isPending
                        ? "4px solid #F59E0B"
                        : isCompleted
                        ? "4px solid #10B981"
                        : "4px solid #EF4444",
                    }}
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-xl"
                          style={{
                            background: isPending
                              ? "rgba(245,158,11,0.15)"
                              : isCompleted
                              ? "rgba(16,185,129,0.15)"
                              : "rgba(239,68,68,0.15)",
                          }}
                        >
                          {isPending ? (
                            <ShieldAlert className="h-4 w-4 text-amber-500" />
                          ) : isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-rose-500" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold" style={{ color: "var(--crm-foreground)" }}>
                              {run.agent_name || "AI Agent"}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                isPending
                                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse"
                                  : isCompleted
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {run.status.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-[11px]" style={{ color: "var(--crm-muted-fg)" }}>
                            Triggered by {run.triggered_by} • {new Date(run.started_at).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Performance & Token Tags */}
                      <div className="flex items-center gap-3 text-xs" style={{ color: "var(--crm-muted-fg)" }}>
                        {run.duration_ms && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {run.duration_ms}ms
                          </span>
                        )}
                        {run.tokens_used > 0 && (
                          <span className="flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            {run.tokens_used} tokens
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions Taken Breakdown */}
                    {run.actions_taken && run.actions_taken.length > 0 && (
                      <div className="rounded-xl p-3 bg-black/5 dark:bg-white/5 space-y-1.5">
                        <p className="text-[11px] font-semibold" style={{ color: "var(--crm-foreground)" }}>
                          Actions Logged ({run.actions_taken.length}):
                        </p>
                        <div className="space-y-1">
                          {run.actions_taken.map((act, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/40 dark:bg-white/5"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                                  {act.tool}
                                </span>
                                {act.requires_approval && (
                                  <span className="text-[10px] text-amber-500 font-medium">
                                    [Sensitive Action]
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-[10px] font-medium ${
                                  act.status === "success"
                                    ? "text-emerald-500"
                                    : act.status === "pending_approval"
                                    ? "text-amber-500 font-semibold"
                                    : "text-rose-500"
                                }`}
                              >
                                {act.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Result Summary */}
                    {run.result_summary && (
                      <div className="text-xs leading-relaxed p-3 rounded-xl bg-white/20 dark:bg-white/5 border border-white/10 whitespace-pre-wrap font-sans">
                        {run.result_summary}
                      </div>
                    )}

                    {/* Error Message if failed */}
                    {run.error_message && (
                      <div className="text-xs p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                        {run.error_message}
                      </div>
                    )}

                    {/* Approval Action Bar */}
                    {isPending && (
                      <div className="flex items-center justify-between pt-2 border-t border-amber-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle className="h-4 w-4" />
                          <span>This execution requires your explicit authorization before modifying CRM data.</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRejectRun(run.id)}
                            disabled={isProcessing}
                            className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 transition-all"
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => handleApproveRun(run.id)}
                            disabled={isProcessing}
                            className="flex items-center gap-1 rounded-xl px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {isProcessing ? "Executing..." : "Approve & Execute"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: TOOLS & SECURITY PERMISSIONS ── */}
      {activeTab === "tools" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--crm-foreground)" }}>
              Authorized Tools & Governance Matrix
            </h2>
            <p className="text-xs" style={{ color: "var(--crm-muted-fg)" }}>
              Agents only invoke explicitly permitted tools with account-level isolation and optional human approval gates
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(TOOLS_METADATA).map((tool) => (
              <div key={tool.name} className="glass rounded-2xl p-4 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                      {tool.name}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        tool.category === "crm_read"
                          ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                      }`}
                    >
                      {tool.category.replace("_", " ")}
                    </span>
                    {tool.approval === "requires_approval" ? (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-600">
                        Requires Approval
                      </span>
                    ) : (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/10 text-emerald-600">
                        Auto-Execute
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: "var(--crm-muted-fg)" }}>
                    {tool.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1 shrink-0">
                  {tool.departmentHint.map((dept) => (
                    <span
                      key={dept}
                      className="rounded-md px-1.5 py-0.5 text-[9px] font-medium bg-black/5 dark:bg-white/10"
                      style={{ color: "var(--crm-muted-fg)" }}
                    >
                      {dept}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL: Run Agent Modal ── */}
      {selectedAgentForRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-lg glass rounded-2xl p-6 shadow-2xl space-y-4"
            style={{ background: "var(--crm-glass-bg)" }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--crm-glass-border-soft)" }}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600">
                  <Play className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold" style={{ color: "var(--crm-foreground)" }}>
                    Execute {selectedAgentForRun.name}
                  </h3>
                  <p className="text-xs" style={{ color: "var(--crm-muted-fg)" }}>
                    Department: {getDeptMeta(selectedAgentForRun.department).label}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAgentForRun(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-black/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p style={{ color: "var(--crm-muted-fg)" }}>
                This agent will inspect authorized CRM data and carry out its designated task.
              </p>

              {selectedAgentForRun.requires_approval && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>
                    Approval Gate Enabled: Any sensitive data modification will be queued in Execution History for manual approval.
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold" style={{ color: "var(--crm-foreground)" }}>
                  Context / Instructions (Optional):
                </label>
                <textarea
                  id="run-custom-prompt"
                  placeholder="e.g. Focus on hot leads in the Mumbai region or prioritize deals closing this month..."
                  rows={3}
                  className="w-full rounded-xl p-3 text-xs outline-none"
                  style={{
                    background: "rgba(0,0,0,0.03)",
                    border: "1px solid var(--crm-glass-border)",
                    color: "var(--crm-foreground)",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--crm-glass-border-soft)" }}>
              <button
                onClick={() => setSelectedAgentForRun(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold glass glass-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const inputEl = document.getElementById("run-custom-prompt") as HTMLTextAreaElement;
                  const prompt = inputEl?.value?.trim();
                  handleExecuteAgent(selectedAgentForRun, prompt ? { custom_task: prompt } : {});
                }}
                disabled={runningAction === selectedAgentForRun.id}
                className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold text-white shadow-md"
                style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
              >
                <Play className={`h-3.5 w-3.5 ${runningAction === selectedAgentForRun.id ? "animate-spin" : ""}`} />
                {runningAction === selectedAgentForRun.id ? "Analyzing CRM Data..." : "Run Autonomous Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Configure Agent Modal ── */}
      {selectedAgentForConfig && (
        <ConfigAgentModal
          agent={selectedAgentForConfig}
          onClose={() => setSelectedAgentForConfig(null)}
          onSaved={() => {
            setSelectedAgentForConfig(null);
            loadData();
          }}
        />
      )}

      {/* ── MODAL: Create New Custom Agent Modal ── */}
      {isCreateOpen && (
        <CreateAgentModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

/* ── Modal: Configure Agent ─────────────────────────────────── */
function ConfigAgentModal({
  agent,
  onClose,
  onSaved,
}: {
  agent: AIAgent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description || "");
  const [instructions, setInstructions] = useState(agent.instructions || "");
  const [allowedTools, setAllowedTools] = useState<string[]>(agent.allowed_tools || []);
  const [requiresApproval, setRequiresApproval] = useState(agent.requires_approval);
  const [maxActions, setMaxActions] = useState(agent.max_actions_per_run || 10);
  const [saving, setSaving] = useState(false);

  const toggleTool = (toolName: string) => {
    setAllowedTools((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          instructions: instructions.trim(),
          allowed_tools: allowedTools,
          requires_approval: requiresApproval,
          max_actions_per_run: Number(maxActions) || 10,
        }),
      });

      if (!res.ok) throw new Error("Failed to save changes");
      toast.success("Agent configuration updated successfully");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Could not save configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto glass rounded-2xl p-6 shadow-2xl space-y-4"
        style={{ background: "var(--crm-glass-bg)" }}
      >
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--crm-glass-border-soft)" }}>
          <div className="flex items-center gap-2.5">
            <Settings2 className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-bold" style={{ color: "var(--crm-foreground)" }}>
              Configure {agent.name}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-black/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <label className="font-semibold block mb-1" style={{ color: "var(--crm-foreground)" }}>
              Agent Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--crm-glass-border)", color: "var(--crm-foreground)" }}
            />
          </div>

          <div>
            <label className="font-semibold block mb-1" style={{ color: "var(--crm-foreground)" }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--crm-glass-border)", color: "var(--crm-foreground)" }}
            />
          </div>

          <div>
            <label className="font-semibold block mb-1" style={{ color: "var(--crm-foreground)" }}>
              System Prompt & Instructions
            </label>
            <textarea
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full rounded-xl p-3 outline-none font-mono text-[11px]"
              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--crm-glass-border)", color: "var(--crm-foreground)" }}
            />
          </div>

          {/* Tools Checkboxes */}
          <div>
            <label className="font-semibold block mb-2" style={{ color: "var(--crm-foreground)" }}>
              Authorized Tools ({allowedTools.length} selected)
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-white/10">
              {Object.values(TOOLS_METADATA).map((t) => {
                const selected = allowedTools.includes(t.name);
                return (
                  <label
                    key={t.name}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                      selected ? "bg-blue-500/15 text-blue-600 font-semibold" : "hover:bg-white/10"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleTool(t.name)}
                      className="rounded accent-blue-600"
                    />
                    <span className="font-mono text-[11px] truncate">{t.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Approval Gate Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5">
            <div>
              <p className="font-semibold text-xs" style={{ color: "var(--crm-foreground)" }}>
                Require Human Approval for Sensitive Actions
              </p>
              <p className="text-[11px] opacity-70" style={{ color: "var(--crm-muted-fg)" }}>
                When enabled, write actions (deal stage updates, lead status) will pause for review.
              </p>
            </div>
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--crm-glass-border-soft)" }}>
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-semibold glass glass-hover">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl px-5 py-2 text-xs font-semibold text-white shadow-md bg-blue-600 hover:bg-blue-700"
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal: Create New Agent ────────────────────────────────── */
function CreateAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<AgentDepartment>("sales");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Agent name is required");
      return;
    }

    setCreating(true);
    try {
      // Default recommended tools per department
      const tools = Object.values(TOOLS_METADATA)
        .filter((t) => t.departmentHint.includes(department))
        .map((t) => t.name);

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          department,
          description: description.trim(),
          instructions:
            instructions.trim() ||
            `You are a dedicated ${department} intelligence agent for CRM 3.0. Analyze records and provide actionable business advice.`,
          allowed_tools: tools.length > 0 ? tools : ["get_contact", "search_contacts"],
          requires_approval: requiresApproval,
          enabled: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create agent");
      }

      toast.success(`Agent "${name}" created successfully!`);
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Could not create agent");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-lg glass rounded-2xl p-6 shadow-2xl space-y-4"
        style={{ background: "var(--crm-glass-bg)" }}
      >
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--crm-glass-border-soft)" }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: "var(--crm-foreground)" }}>
                Create Custom AI Agent
              </h3>
              <p className="text-xs" style={{ color: "var(--crm-muted-fg)" }}>
                Add a specialized agent for your team's workflow
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-black/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-semibold block mb-1" style={{ color: "var(--crm-foreground)" }}>
              Agent Name *
            </label>
            <input
              type="text"
              placeholder="e.g. VIP Client Nurturing Agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--crm-glass-border)", color: "var(--crm-foreground)" }}
            />
          </div>

          <div>
            <label className="font-semibold block mb-1" style={{ color: "var(--crm-foreground)" }}>
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as AgentDepartment)}
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--crm-glass-border)", color: "var(--crm-foreground)" }}
            >
              <option value="sales">Sales</option>
              <option value="customer_support">Customer Support</option>
              <option value="marketing">Marketing</option>
              <option value="finance">Finance</option>
              <option value="admin">Admin & Operations</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div>
            <label className="font-semibold block mb-1" style={{ color: "var(--crm-foreground)" }}>
              Short Description
            </label>
            <input
              type="text"
              placeholder="e.g. Monitors high-intent leads and alerts VIP sales reps"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl px-3 py-2 outline-none"
              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--crm-glass-border)", color: "var(--crm-foreground)" }}
            />
          </div>

          <div>
            <label className="font-semibold block mb-1" style={{ color: "var(--crm-foreground)" }}>
              Custom Instructions
            </label>
            <textarea
              rows={3}
              placeholder="Specific guidelines for this agent..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full rounded-xl p-3 outline-none"
              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--crm-glass-border)", color: "var(--crm-foreground)" }}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5">
            <div>
              <p className="font-semibold text-xs" style={{ color: "var(--crm-foreground)" }}>
                Approval Gate
              </p>
              <p className="text-[11px] opacity-70" style={{ color: "var(--crm-muted-fg)" }}>
                Require human confirmation before CRM modifications
              </p>
            </div>
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--crm-glass-border-soft)" }}>
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-semibold glass glass-hover">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-xl px-5 py-2 text-xs font-semibold text-white shadow-md"
            style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
          >
            {creating ? "Creating..." : "Create Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
