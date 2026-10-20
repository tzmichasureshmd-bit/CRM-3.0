"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
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
  Check,
  X,
  AlertTriangle,
  TrendingUp,
  Clock,
  Sparkles,
  Layers,
  MessageSquare,
  DollarSign,
  Shield,
  Sliders,
  Loader2,
  ArrowRight,
} from "lucide-react";
import type {
  AIAgent,
  AgentDepartment,
  AgentRun,
  AgentMetrics,
} from "@/types/crm3";
import { TOOLS_METADATA } from "@/lib/agents/engine";
import { toast } from "sonner";
import { getStoredUser } from "@/lib/api-client";
import {
  WORKFLOW_TEMPLATES,
  evaluateCompatibility,
  buildTemplateSteps,
  DEFAULT_CAPABILITIES,
  type WorkflowTemplate,
  type TemplateCompatibility,
  type TemplateCapabilities,
} from "@/lib/ai/automation-templates";
import { AgentShowcase } from "@/components/automations/AgentShowcase";
import { TemplateGallery } from "@/components/automations/TemplateGallery";
import { TemplatePreview } from "@/components/automations/TemplatePreview";
import { PermissionsPanel } from "@/components/automations/PermissionsPanel";
import { AutomationBuilder } from "@/components/automations/Builder";
import type { AgentLite, Automation } from "@/components/automations/types";

/* ── Department Styles & Icons ──────────────────────────────── */
const DEPARTMENTS: {
  id: AgentDepartment | "all";
  label: string;
  color: string;
  bg: string;
  icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;
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

function hbtn(variant: "primary" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 15px",
    borderRadius: 11,
    fontSize: 13,
    fontWeight: 650,
    cursor: "pointer",
    transition: "all 150ms ease",
    userSelect: "none",
  };
  if (variant === "primary") {
    return {
      ...base,
      background: "linear-gradient(135deg, #4f6df5, #8b5cf6)",
      color: "white",
      boxShadow: "0 6px 18px rgba(79,109,245,0.28)",
      border: "none",
    };
  }
  return {
    ...base,
    background: "rgba(255,255,255,0.65)",
    border: "1px solid rgba(130,145,190,0.28)",
    color: "var(--crm-text-secondary)",
  };
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
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  bg: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="crm-glass"
      style={{
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 16,
        border: highlight ? "1.5px solid rgba(245,158,11,0.5)" : undefined,
        background: highlight ? "rgba(245,158,11,0.06)" : undefined,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: bg || `${color}18`,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 780, color: "var(--crm-text)", lineHeight: 1.1 }}>
            {value}
          </div>
          {highlight && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: "#f59e0b",
                background: "rgba(245,158,11,0.14)",
                padding: "2px 6px",
                borderRadius: 6,
                textTransform: "uppercase",
              }}
            >
              Action
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--crm-text-muted)", fontWeight: 600, marginTop: 2 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 10, color: "var(--crm-text-muted)", opacity: 0.75, marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
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

  // Capabilities & tools for templates compatibility
  const [tools, setTools] = useState<string[]>([]);
  const [toolsCount, setToolsCount] = useState<number>(0);
  const [capabilities, setCapabilities] = useState<TemplateCapabilities>(DEFAULT_CAPABILITIES);

  // Templates & builder state
  const [preview, setPreview] = useState<WorkflowTemplate | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [editingAutomation, setEditingAutomation] = useState<{ automation: Automation } | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  // Modals state
  const [selectedAgentForRun, setSelectedAgentForRun] = useState<AIAgent | null>(null);
  const [selectedAgentForConfig, setSelectedAgentForConfig] = useState<AIAgent | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  // Fetch agents and runs
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const user = getStoredUser();
      const accountParam = user?.account_id ? `?account_id=${encodeURIComponent(user.account_id)}` : "";
      const headers: Record<string, string> = user?.account_id ? { "x-account-id": user.account_id } : {};

      const [agentsRes, runsRes] = await Promise.all([
        fetch(`/api/agents${accountParam}`, { headers }),
        fetch(`/api/agents/runs${accountParam}`, { headers }),
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
      toast.error("Error loading agent data.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch capabilities & tools for workflow template compatibility
  const loadCapabilities = useCallback(async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        fetch("/api/v3/agents/tools"),
        fetch("/api/v3/automations/templates"),
      ]);
      if (tRes.ok) {
        const d = (await tRes.json()) as { tools?: { name?: string }[] };
        const names = (d.tools ?? []).map((x) => x.name).filter((n): n is string => !!n);
        setTools(names);
        setToolsCount(names.length);
      }
      if (cRes.ok) {
        const d = (await cRes.json()) as { capabilities?: TemplateCapabilities };
        if (d.capabilities) setCapabilities(d.capabilities);
      }
    } catch {
      /* Optional context for templates */
    }
  }, []);

  useEffect(() => {
    void loadData();
    void loadCapabilities();
  }, [loadData, loadCapabilities]);

  // Convert agents to AgentLite array for AgentShowcase & TemplateGallery compatibility
  const fleetAgents = useMemo<AgentLite[]>(() => {
    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      description: a.description || null,
      status: a.status || "idle",
      enabled: !!a.enabled,
      allowed_tools: a.allowed_tools || [],
      requires_approval: !!a.requires_approval,
      max_actions_per_run: a.max_actions_per_run || 10,
      execution_count: a.execution_count || 0,
      success_count: a.success_count || 0,
      failure_count: a.failure_count || 0,
      last_run_at: a.last_run_at || null,
    }));
  }, [agents]);

  const compatFor = useCallback(
    (t: WorkflowTemplate): TemplateCompatibility =>
      evaluateCompatibility(t, { agents: fleetAgents, tools, capabilities }),
    [fleetAgents, tools, capabilities]
  );

  // Install workflow template from AI Agents page
  async function installTemplate(t: WorkflowTemplate) {
    const compat = compatFor(t);
    if (compat.status === "blocked") {
      toast.error(compat.blockingReasons.join(" ") || "This template is not compatible with your account yet.");
      return;
    }
    setInstalling(t.id);
    try {
      const steps = buildTemplateSteps(t, compat.agent);
      const res = await fetch("/api/v3/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          description: t.description,
          trigger_type: t.triggerType,
          trigger_config: t.triggerConfig,
          ai_enabled: t.aiEnabled,
          steps,
          activate: false,
        }),
      });
      const data = (await res.json()) as { automation?: Automation; error?: string };
      if (!res.ok || !data.automation) throw new Error(data.error ?? "Failed to create draft");
      setPreview(null);
      toast.success(`Draft automation "${t.name}" created! View in Automations.`);
      setEditingAutomation({ automation: data.automation });
      setShowBuilder(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to install template");
    } finally {
      setInstalling(null);
    }
  }

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
      const user = getStoredUser();
      const res = await fetch(`/api/agents/${agent.id}/toggle`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(user?.account_id ? { "x-account-id": user.account_id } : {}),
        },
        body: JSON.stringify({ enabled: nextState }),
      });

      if (!res.ok) throw new Error("Toggle request failed");

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
      const user = getStoredUser();
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user?.account_id ? { "x-account-id": user.account_id } : {}),
        },
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
      const user = getStoredUser();
      const res = await fetch(`/api/agents/runs/${runId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user?.account_id ? { "x-account-id": user.account_id } : {}),
        },
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
      const user = getStoredUser();
      const res = await fetch(`/api/agents/runs/${runId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user?.account_id ? { "x-account-id": user.account_id } : {}),
        },
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
    <div style={{ padding: "24px 28px", maxWidth: 1240, margin: "0 auto" }}>
      {/* ── TOP HEADER: AI Department Agents ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: "linear-gradient(135deg, #4f6df5, #8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 22px rgba(79,109,245,0.35)",
              flexShrink: 0,
            }}
          >
            <Bot size={24} color="white" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 780,
                  color: "var(--crm-text)",
                  letterSpacing: "-0.01em",
                }}
              >
                AI Department Agents
              </h1>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#fff",
                  background: "var(--crm-primary)",
                  padding: "2px 8px",
                  borderRadius: 6,
                  letterSpacing: "0.04em",
                }}
              >
                CRM 3.0
              </span>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--crm-text-muted)" }}>
              Autonomous CRM intelligence, department specialists, and controlled action workflows
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            style={hbtn("ghost")}
            title="Refresh agents and executions"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setIsCreateOpen(true)} style={hbtn("primary")}>
            <Plus size={15} /> New Custom Agent
          </button>
        </div>
      </div>

      {/* ── METRIC SUMMARY BAR (5 Cards) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
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
          sub={`${Math.max(0, metrics.total_agents - metrics.enabled_agents)} paused`}
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

      {/* ── TABS NAVIGATION BAR ── */}
      <div
        className="crm-glass"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderRadius: 14,
          marginBottom: 18,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setActiveTab("directory")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 700,
              background: activeTab === "directory" ? "rgba(79,109,245,0.14)" : "transparent",
              color: activeTab === "directory" ? "var(--crm-primary)" : "var(--crm-text-secondary)",
              border: activeTab === "directory" ? "1px solid rgba(79,109,245,0.25)" : "1px solid transparent",
              cursor: "pointer",
            }}
          >
            <Bot size={15} />
            Agent Directory ({agents.length})
          </button>

          <button
            onClick={() => setActiveTab("history")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 700,
              background: activeTab === "history" ? "rgba(79,109,245,0.14)" : "transparent",
              color: activeTab === "history" ? "var(--crm-primary)" : "var(--crm-text-secondary)",
              border: activeTab === "history" ? "1px solid rgba(79,109,245,0.25)" : "1px solid transparent",
              cursor: "pointer",
            }}
          >
            <History size={15} />
            Execution History ({runs.length})
            {metrics.pending_approvals > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#fff",
                  background: "#f59e0b",
                  padding: "1px 6px",
                  borderRadius: 6,
                }}
              >
                {metrics.pending_approvals}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("tools")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 700,
              background: activeTab === "tools" ? "rgba(79,109,245,0.14)" : "transparent",
              color: activeTab === "tools" ? "var(--crm-primary)" : "var(--crm-text-secondary)",
              border: activeTab === "tools" ? "1px solid rgba(79,109,245,0.25)" : "1px solid transparent",
              cursor: "pointer",
            }}
          >
            <Sliders size={15} />
            Tools & Permissions
          </button>
        </div>

        {activeTab === "directory" && (
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
            <Search
              size={14}
              color="var(--crm-text-muted)"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              type="text"
              placeholder="Search agents or tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 34px",
                borderRadius: 10,
                border: "1px solid rgba(130,145,190,0.25)",
                background: "rgba(255,255,255,0.6)",
                fontSize: 12.5,
                color: "var(--crm-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </div>

      {/* ── TAB 1: AGENT DIRECTORY ── */}
      {activeTab === "directory" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Department Filter Pills */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin" }}>
            {DEPARTMENTS.map((dept) => {
              const active = selectedDept === dept.id;
              const count = deptCounts[dept.id] || 0;
              const Icon = dept.icon;
              return (
                <button
                  key={dept.id}
                  onClick={() => setSelectedDept(dept.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "7px 13px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: active ? 750 : 600,
                    background: active ? dept.bg : "rgba(255,255,255,0.55)",
                    border: active ? `1.5px solid ${dept.color}` : "1px solid rgba(130,145,190,0.22)",
                    color: active ? dept.color : "var(--crm-text-secondary)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: "all 150ms ease",
                  }}
                >
                  <Icon size={14} color={dept.color} />
                  <span>{dept.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 750,
                      padding: "1px 6px",
                      borderRadius: 6,
                      background: active ? dept.color : "rgba(130,145,190,0.16)",
                      color: active ? "#fff" : "var(--crm-text-muted)",
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
            <div
              className="crm-glass"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: "54px 20px",
                textAlign: "center",
                borderRadius: 16,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 16,
                  background: "rgba(79,109,245,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Bot size={26} color="var(--crm-primary)" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 750, color: "var(--crm-text)" }}>
                  No AI Agents Found
                </div>
                <div style={{ fontSize: 13, color: "var(--crm-text-muted)", marginTop: 4, maxWidth: 380 }}>
                  No agents match your department or search filter. Create a new custom agent or reset filters.
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedDept("all");
                  setSearchQuery("");
                }}
                style={hbtn("ghost")}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 16,
              }}
            >
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
                    className="crm-glass"
                    style={{
                      borderRadius: 16,
                      padding: "18px 20px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      borderTop: `3px solid ${deptMeta.color}`,
                    }}
                  >
                    {/* Header Row */}
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 12,
                        }}
                      >
                        {/* Department Badge */}
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 10px",
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 750,
                            background: deptMeta.bg,
                            color: deptMeta.color,
                          }}
                        >
                          <DeptIcon size={12} color={deptMeta.color} />
                          <span>{deptMeta.label}</span>
                        </div>

                        {/* Enable/Disable Toggle */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: agent.enabled ? "var(--crm-text)" : "var(--crm-text-muted)",
                            }}
                          >
                            {agent.enabled ? "Active" : "Paused"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => void handleToggleAgent(agent, e)}
                            style={{
                              width: 36,
                              height: 20,
                              borderRadius: 10,
                              padding: 2,
                              background: agent.enabled ? "#10b981" : "rgba(130,145,190,0.35)",
                              border: "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              transition: "background 150ms ease",
                            }}
                            title={agent.enabled ? "Click to disable agent" : "Click to enable agent"}
                          >
                            <span
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: "50%",
                                background: "#fff",
                                transform: agent.enabled ? "translateX(16px)" : "translateX(0px)",
                                transition: "transform 150ms ease",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                              }}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Name & Badges */}
                      <div style={{ marginBottom: 10 }}>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: 15,
                            fontWeight: 780,
                            color: "var(--crm-text)",
                            lineHeight: 1.3,
                          }}
                        >
                          {agent.name}
                        </h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "monospace",
                              padding: "2px 7px",
                              borderRadius: 6,
                              background: "rgba(130,145,190,0.12)",
                              color: "var(--crm-text-secondary)",
                              fontWeight: 600,
                            }}
                          >
                            {agent.type}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 7px",
                              borderRadius: 6,
                              background: "rgba(79,109,245,0.12)",
                              color: "var(--crm-primary)",
                              fontWeight: 650,
                            }}
                          >
                            {agent.model || "gpt-4o-mini"}
                          </span>
                          {agent.requires_approval ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 6,
                                background: "rgba(245,158,11,0.12)",
                                color: "#f59e0b",
                              }}
                              title="Sensitive modifications require manual human approval"
                            >
                              <ShieldAlert size={11} /> Approval Gate
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 6,
                                background: "rgba(16,185,129,0.12)",
                                color: "#10b981",
                              }}
                              title="Runs autonomously within authorized tools"
                            >
                              <Zap size={11} /> Autonomous
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <p
                        style={{
                          fontSize: 12.5,
                          color: "var(--crm-text-muted)",
                          lineHeight: 1.45,
                          marginBottom: 14,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {agent.description || "Specialized autonomous agent tailored for CRM record workflows."}
                      </p>

                      {/* Authorized Tools */}
                      <div style={{ marginBottom: 16 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: "var(--crm-text-muted)",
                            marginBottom: 6,
                          }}
                        >
                          Authorized Tools ({agent.allowed_tools?.length || 0})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {(agent.allowed_tools || []).slice(0, 4).map((tool) => (
                            <span
                              key={tool}
                              style={{
                                fontSize: 10.5,
                                fontFamily: "monospace",
                                padding: "3px 8px",
                                borderRadius: 6,
                                background: "rgba(255,255,255,0.65)",
                                border: "1px solid rgba(130,145,190,0.24)",
                                color: "var(--crm-text)",
                              }}
                            >
                              {tool}
                            </span>
                          ))}
                          {(agent.allowed_tools || []).length > 4 && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: "3px 6px",
                                borderRadius: 6,
                                background: "rgba(130,145,190,0.15)",
                                color: "var(--crm-text-muted)",
                              }}
                            >
                              +{(agent.allowed_tools || []).length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Footer / Stats & Actions */}
                    <div
                      style={{
                        borderTop: "1px solid var(--crm-border-soft)",
                        paddingTop: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: 11.5,
                          color: "var(--crm-text-muted)",
                          marginBottom: 12,
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <Activity size={13} />
                          {agent.execution_count || 0} runs
                        </span>
                        <span>
                          {agent.last_run_at
                            ? `Last: ${new Date(agent.last_run_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                            : "Never run"}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setSelectedAgentForRun(agent)}
                          disabled={!agent.enabled || isRunning}
                          style={{
                            ...hbtn("primary"),
                            flex: 1,
                            justifyContent: "center",
                            opacity: !agent.enabled ? 0.45 : isRunning ? 0.8 : 1,
                            cursor: !agent.enabled ? "not-allowed" : "pointer",
                          }}
                        >
                          <Play size={13} className={isRunning ? "animate-spin" : ""} />
                          {isRunning ? "Running..." : "Run Agent"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedAgentForConfig(agent)}
                          style={{
                            ...hbtn("ghost"),
                            padding: "9px 11px",
                          }}
                          title="Configure agent prompt & permissions"
                        >
                          <Settings2 size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab("history")}
                          style={{
                            ...hbtn("ghost"),
                            padding: "9px 11px",
                          }}
                          title="View Execution History"
                        >
                          <History size={15} />
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
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: "var(--crm-text)" }}>
                Execution Audit Trail & Approvals
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--crm-text-muted)" }}>
                Real-time log of tool calls, inputs, outputs, tokens used, and human approval gates
              </p>
            </div>
            <button
              onClick={() => void loadData()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 650,
                color: "var(--crm-primary)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={13} /> Refresh Logs
            </button>
          </div>

          {runs.length === 0 ? (
            <div
              className="crm-glass"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: "54px 20px",
                textAlign: "center",
                borderRadius: 16,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 16,
                  background: "rgba(139,92,246,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <History size={26} color="#8b5cf6" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 750, color: "var(--crm-text)" }}>
                  No Executions Recorded Yet
                </div>
                <div style={{ fontSize: 13, color: "var(--crm-text-muted)", marginTop: 4, maxWidth: 380 }}>
                  Trigger an agent from the directory to see real tool execution steps, timestamps, and results.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {runs.map((run) => {
                const isPending = run.status === "awaiting_approval";
                const isCompleted = run.status === "completed";
                const isProcessing = runningAction === run.id;

                return (
                  <div
                    key={run.id}
                    className="crm-glass"
                    style={{
                      borderRadius: 16,
                      padding: "16px 20px",
                      borderLeft: isPending
                        ? "4px solid #f59e0b"
                        : isCompleted
                        ? "4px solid #10b981"
                        : "4px solid #f46b72",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {/* Header Row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: isPending
                              ? "rgba(245,158,11,0.15)"
                              : isCompleted
                              ? "rgba(16,185,129,0.15)"
                              : "rgba(244,107,114,0.15)",
                          }}
                        >
                          {isPending ? (
                            <ShieldAlert size={16} color="#f59e0b" />
                          ) : isCompleted ? (
                            <CheckCircle2 size={16} color="#10b981" />
                          ) : (
                            <XCircle size={16} color="#f46b72" />
                          )}
                        </div>

                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 750, color: "var(--crm-text)" }}>
                              {run.agent_name || "AI Agent"}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                textTransform: "uppercase",
                                padding: "2px 7px",
                                borderRadius: 6,
                                background: isPending
                                  ? "rgba(245,158,11,0.15)"
                                  : isCompleted
                                  ? "rgba(16,185,129,0.15)"
                                  : "rgba(244,107,114,0.15)",
                                color: isPending ? "#f59e0b" : isCompleted ? "#10b981" : "#f46b72",
                              }}
                            >
                              {run.status.replace("_", " ")}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--crm-text-muted)", marginTop: 2 }}>
                            Triggered by {run.triggered_by} • {new Date(run.started_at).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5, color: "var(--crm-text-muted)" }}>
                        {run.duration_ms && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Clock size={13} /> {run.duration_ms}ms
                          </span>
                        )}
                        {run.tokens_used > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Sparkles size={13} /> {run.tokens_used} tokens
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions Taken */}
                    {run.actions_taken && run.actions_taken.length > 0 && (
                      <div
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: "rgba(0,0,0,0.03)",
                          border: "1px solid var(--crm-border-soft)",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--crm-text)", marginBottom: 6 }}>
                          Actions Logged ({run.actions_taken.length}):
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {run.actions_taken.map((act, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "5px 10px",
                                borderRadius: 8,
                                background: "rgba(255,255,255,0.6)",
                                fontSize: 11.5,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--crm-primary)" }}>
                                  {act.tool}
                                </span>
                                {act.requires_approval && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>
                                    [Sensitive Action]
                                  </span>
                                )}
                              </div>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 650,
                                  color:
                                    act.status === "success"
                                      ? "#10b981"
                                      : act.status === "pending_approval"
                                      ? "#f59e0b"
                                      : "#f46b72",
                                }}
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
                      <div
                        style={{
                          fontSize: 12,
                          lineHeight: 1.5,
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: "rgba(255,255,255,0.5)",
                          border: "1px solid var(--crm-border-soft)",
                          color: "var(--crm-text)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {run.result_summary}
                      </div>
                    )}

                    {/* Error Message */}
                    {run.error_message && (
                      <div
                        style={{
                          fontSize: 12,
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: "rgba(244,107,114,0.08)",
                          border: "1px solid rgba(244,107,114,0.25)",
                          color: "#f46b72",
                        }}
                      >
                        {run.error_message}
                      </div>
                    )}

                    {/* Approval Action Bar */}
                    {isPending && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: 10,
                          borderTop: "1px solid rgba(245,158,11,0.25)",
                          flexWrap: "wrap",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#f59e0b", fontWeight: 650 }}>
                          <AlertTriangle size={15} />
                          <span>This execution requires your explicit authorization before modifying CRM data.</span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => void handleRejectRun(run.id)}
                            disabled={isProcessing}
                            style={{
                              ...hbtn("ghost"),
                              color: "#f46b72",
                              borderColor: "rgba(244,107,114,0.3)",
                            }}
                          >
                            <X size={14} /> Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleApproveRun(run.id)}
                            disabled={isProcessing}
                            style={{
                              ...hbtn("primary"),
                              background: "linear-gradient(135deg, #10b981, #059669)",
                            }}
                          >
                            <Check size={14} /> {isProcessing ? "Executing..." : "Approve & Execute"}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: "var(--crm-text)" }}>
              Authorized Tools & Governance Matrix
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--crm-text-muted)" }}>
              Agents only invoke explicitly permitted tools with account-level isolation and optional human approval gates
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: 12,
            }}
          >
            {Object.values(TOOLS_METADATA).map((tool) => (
              <div
                key={tool.name}
                className="crm-glass"
                style={{
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12.5, fontWeight: 750, color: "var(--crm-primary)" }}>
                      {tool.name}
                    </span>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        padding: "2px 7px",
                        borderRadius: 6,
                        background:
                          tool.category === "crm_read"
                            ? "rgba(6,182,212,0.12)"
                            : "rgba(139,92,246,0.12)",
                        color: tool.category === "crm_read" ? "#06b6d4" : "#8b5cf6",
                      }}
                    >
                      {tool.category.replace("_", " ")}
                    </span>
                    {tool.approval === "requires_approval" ? (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          padding: "2px 7px",
                          borderRadius: 6,
                          background: "rgba(245,158,11,0.12)",
                          color: "#f59e0b",
                        }}
                      >
                        Requires Approval
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          padding: "2px 7px",
                          borderRadius: 6,
                          background: "rgba(16,185,129,0.12)",
                          color: "#10b981",
                        }}
                      >
                        Auto-Execute
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--crm-text-muted)", lineHeight: 1.4 }}>
                    {tool.description}
                  </p>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingTop: 6, borderTop: "1px solid var(--crm-border-soft)" }}>
                  {tool.departmentHint.map((dept) => (
                    <span
                      key={dept}
                      style={{
                        fontSize: 10,
                        fontWeight: 650,
                        padding: "2px 6px",
                        borderRadius: 5,
                        background: "rgba(130,145,190,0.12)",
                        color: "var(--crm-text-secondary)",
                      }}
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

      {/* ── SECTION: AI AGENT FLEET (Moved directly below complete AI Department Agents) ── */}
      <div id="fleet" style={{ marginTop: 32 }}>
        <AgentShowcase agents={fleetAgents} />
      </div>

      {/* ── SECTION: AI WORKFLOW TEMPLATES & PERMISSIONS (Moved directly below) ── */}
      <div id="templates" style={{ marginTop: 24 }} className="crm-auto-split">
        <div>
          <TemplateGallery
            templates={WORKFLOW_TEMPLATES}
            compatFor={compatFor}
            installing={installing}
            onPreview={setPreview}
            onUse={installTemplate}
          />
        </div>
        <PermissionsPanel
          agents={fleetAgents}
          toolsAvailable={toolsCount > 0 ? toolsCount : Object.keys(TOOLS_METADATA).length}
        />
      </div>

      {/* ── MODAL: Template Preview ── */}
      {preview && (
        <TemplatePreview
          template={preview}
          compatibility={compatFor(preview)}
          installing={installing === preview.id}
          onClose={() => setPreview(null)}
          onUse={() => void installTemplate(preview)}
        />
      )}

      {/* ── MODAL: Automation Builder (for customizing installed templates) ── */}
      {showBuilder && (
        <AutomationBuilder
          initial={editingAutomation}
          onClose={() => {
            setShowBuilder(false);
            setEditingAutomation(null);
          }}
          onSaved={() => {
            setShowBuilder(false);
            setEditingAutomation(null);
            void loadData();
          }}
        />
      )}

      {/* ── MODAL: Run Agent Modal ── */}
      {selectedAgentForRun && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedAgentForRun(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246,248,255,0.92))",
              backdropFilter: "blur(28px) saturate(160%)",
              WebkitBackdropFilter: "blur(28px) saturate(160%)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 24px 70px rgba(40,50,90,0.22)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--crm-border-soft)",
                paddingBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: "rgba(79,109,245,0.14)",
                    color: "var(--crm-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Play size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: "var(--crm-text)" }}>
                    Execute {selectedAgentForRun.name}
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--crm-text-muted)" }}>
                    Department: {getDeptMeta(selectedAgentForRun.department).label}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgentForRun(null)}
                style={{ background: "none", border: "none", color: "var(--crm-text-muted)", cursor: "pointer", padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12.5 }}>
              <p style={{ margin: 0, color: "var(--crm-text-muted)", lineHeight: 1.4 }}>
                This agent will inspect authorized CRM data and carry out its designated task.
              </p>

              {selectedAgentForRun.requires_approval && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "rgba(245,158,11,0.10)",
                    border: "1px solid rgba(245,158,11,0.25)",
                    color: "#b45309",
                    fontSize: 12,
                    lineHeight: 1.4,
                  }}
                >
                  <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                  <span>
                    Approval Gate Enabled: Any sensitive data modification will be queued in Execution History for manual approval.
                  </span>
                </div>
              )}

              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--crm-text)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Context / Instructions (Optional):
                </label>
                <textarea
                  id="run-custom-prompt"
                  placeholder="e.g. Focus on hot leads in the Mumbai region or prioritize deals closing this month..."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(130,145,190,0.30)",
                    background: "rgba(255,255,255,0.85)",
                    fontSize: 12.5,
                    color: "var(--crm-text)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 8,
                paddingTop: 14,
                borderTop: "1px solid var(--crm-border-soft)",
              }}
            >
              <button type="button" onClick={() => setSelectedAgentForRun(null)} style={hbtn("ghost")}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const inputEl = document.getElementById("run-custom-prompt") as HTMLTextAreaElement;
                  const prompt = inputEl?.value?.trim();
                  void handleExecuteAgent(selectedAgentForRun, prompt ? { custom_task: prompt } : {});
                }}
                disabled={runningAction === selectedAgentForRun.id}
                style={{
                  ...hbtn("primary"),
                  opacity: runningAction === selectedAgentForRun.id ? 0.75 : 1,
                  cursor: runningAction === selectedAgentForRun.id ? "not-allowed" : "pointer",
                }}
              >
                {runningAction === selectedAgentForRun.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
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
            void loadData();
          }}
        />
      )}

      {/* ── MODAL: Create New Custom Agent Modal ── */}
      {isCreateOpen && (
        <CreateAgentModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={(newAgent) => {
            setIsCreateOpen(false);
            if (newAgent && newAgent.id) {
              setAgents((prev) => [newAgent, ...prev.filter((a) => a.id !== newAgent.id)]);
            }
            void loadData();
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
  const [saving, setSaving] = useState(false);

  const toggleTool = (toolName: string) => {
    setAllowedTools((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = getStoredUser();
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(user?.account_id ? { "x-account-id": user.account_id } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          instructions: instructions.trim(),
          allowed_tools: allowedTools,
          requires_approval: requiresApproval,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-2xl space-y-4"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246,248,255,0.92))",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 24px 70px rgba(40,50,90,0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--crm-border-soft)",
            paddingBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Settings2 size={20} color="var(--crm-primary)" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: "var(--crm-text)" }}>
              Configure {agent.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--crm-text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 12.5 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--crm-text)", display: "block", marginBottom: 6 }}>
              Agent Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 13px",
                borderRadius: 12,
                border: "1px solid rgba(130,145,190,0.30)",
                background: "rgba(255,255,255,0.85)",
                fontSize: 13,
                color: "var(--crm-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--crm-text)", display: "block", marginBottom: 6 }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 13px",
                borderRadius: 12,
                border: "1px solid rgba(130,145,190,0.30)",
                background: "rgba(255,255,255,0.85)",
                fontSize: 13,
                color: "var(--crm-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--crm-text)", display: "block", marginBottom: 6 }}>
              System Prompt & Instructions
            </label>
            <textarea
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(130,145,190,0.30)",
                background: "rgba(255,255,255,0.85)",
                fontSize: 12,
                fontFamily: "monospace",
                color: "var(--crm-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Tools Checkboxes */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--crm-text)", display: "block", marginBottom: 6 }}>
              Authorized Tools ({allowedTools.length} selected)
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 8,
                maxHeight: 180,
                overflowY: "auto",
                padding: 10,
                borderRadius: 12,
                background: "rgba(0,0,0,0.03)",
                border: "1px solid rgba(130,145,190,0.22)",
              }}
            >
              {Object.values(TOOLS_METADATA).map((t) => {
                const selected = allowedTools.includes(t.name);
                return (
                  <label
                    key={t.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 9px",
                      borderRadius: 8,
                      background: selected ? "rgba(79,109,245,0.12)" : "rgba(255,255,255,0.6)",
                      border: selected ? "1px solid rgba(79,109,245,0.3)" : "1px solid transparent",
                      color: selected ? "var(--crm-primary)" : "var(--crm-text)",
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "monospace",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleTool(t.name)}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Approval Gate */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(79,109,245,0.06)",
              border: "1px solid rgba(79,109,245,0.18)",
            }}
          >
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--crm-text)" }}>
                Require Human Approval for Sensitive Actions
              </div>
              <div style={{ fontSize: 11, color: "var(--crm-text-muted)", marginTop: 2 }}>
                When enabled, write actions (deal stage updates, lead status) will pause for review.
              </div>
            </div>
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            paddingTop: 14,
            borderTop: "1px solid var(--crm-border-soft)",
          }}
        >
          <button type="button" onClick={onClose} style={hbtn("ghost")}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={hbtn("primary")}>
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal: Create New Agent (Requirement 3: Clean, slightly more opaque white/translucent surface) ── */
function CreateAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (newAgent?: AIAgent) => void;
}) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<AgentDepartment>("sales");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Agent name is required");
      toast.error("Agent name is required");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const user = getStoredUser();

      // Recommended tools per department
      const tools = Object.values(TOOLS_METADATA)
        .filter((t) => t.departmentHint.includes(department))
        .map((t) => t.name);

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user?.account_id ? { "x-account-id": user.account_id } : {}),
        },
        body: JSON.stringify({
          account_id: user?.account_id,
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create agent");
      }

      const created = data.data || data;
      toast.success(`Agent "${name.trim()}" created successfully!`);
      onCreated(created);
    } catch (err: any) {
      console.error("Create agent error:", err);
      const msg = err.message || "Could not create agent";
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246,248,255,0.92))",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 24px 70px rgba(40,50,90,0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--crm-border-soft)",
            paddingBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "rgba(79,109,245,0.14)",
                color: "var(--crm-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bot size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: "var(--crm-text)" }}>
                Create Custom AI Agent
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--crm-text-muted)" }}>
                Add a specialized agent for your team's workflow
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--crm-text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 13px",
              borderRadius: 10,
              background: "rgba(244,107,114,0.08)",
              border: "1px solid rgba(244,107,114,0.25)",
              color: "#f46b72",
              fontSize: 12.5,
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 12.5 }}>
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--crm-text)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Agent Name *
            </label>
            <input
              type="text"
              placeholder="e.g. VIP Client Nurturing Agent"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(130,145,190,0.30)",
                background: "rgba(255,255,255,0.85)",
                fontSize: 13,
                color: "var(--crm-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--crm-text)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as AgentDepartment)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(130,145,190,0.30)",
                background: "rgba(255,255,255,0.85)",
                fontSize: 13,
                color: "var(--crm-text)",
                outline: "none",
                cursor: "pointer",
                boxSizing: "border-box",
              }}
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
            <label
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--crm-text)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Short Description
            </label>
            <input
              type="text"
              placeholder="e.g. Monitors high-intent leads and alerts VIP sales reps"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(130,145,190,0.30)",
                background: "rgba(255,255,255,0.85)",
                fontSize: 13,
                color: "var(--crm-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--crm-text)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Custom Instructions
            </label>
            <textarea
              rows={3}
              placeholder="Specific guidelines for this agent..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(130,145,190,0.30)",
                background: "rgba(255,255,255,0.85)",
                fontSize: 12.5,
                color: "var(--crm-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(79,109,245,0.06)",
              border: "1px solid rgba(79,109,245,0.18)",
            }}
          >
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 750, color: "var(--crm-text)" }}>
                Approval Gate
              </div>
              <div style={{ fontSize: 11, color: "var(--crm-text-muted)", marginTop: 2 }}>
                Require human confirmation before CRM modifications
              </div>
            </div>
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            paddingTop: 14,
            borderTop: "1px solid var(--crm-border-soft)",
          }}
        >
          <button type="button" onClick={onClose} style={hbtn("ghost")}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            style={{
              ...hbtn("primary"),
              opacity: creating ? 0.75 : 1,
              cursor: creating ? "not-allowed" : "pointer",
            }}
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {creating ? "Creating Agent..." : "Create Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
