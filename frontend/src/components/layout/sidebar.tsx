"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, ChevronDown, ChevronRight, X,
  Zap, MessageSquare, Users, TrendingUp, BarChart3,
  Flame, Target, Calendar, FileText, Megaphone,
  Bot, Activity, Settings, LayoutDashboard,
  Sun, Moon, Globe, Database, Layers,
} from "lucide-react";

const COLLAPSED_KEY = "crm3.sidebar.collapsed";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}
interface NavSection {
  group: string | null;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    group: null,
    items: [
      { href: "/command-center", label: "Command Center", icon: LayoutDashboard },
      { href: "/copilot",        label: "AI Copilot",     icon: Brain },
    ],
  },
  {
    group: "CUSTOMER",
    items: [
      { href: "/contacts",      label: "Customers",    icon: Users },
      { href: "/leads",         label: "Leads",        icon: Flame },
      { href: "/contacts/360",  label: "Customer 360", icon: Target },
      { href: "/journeys",      label: "Journeys",     icon: Activity },
    ],
  },
  {
    group: "SALES",
    items: [
      { href: "/pipelines",               label: "Pipeline",     icon: Layers },
      { href: "/pipelines/deals",         label: "Deals",        icon: TrendingUp },
      { href: "/automations/followups",   label: "Follow-ups",   icon: MessageSquare },
      { href: "/automations/appointments",label: "Appointments", icon: Calendar },
    ],
  },
  {
    group: "CONVERSATIONS",
    items: [
      { href: "/inbox",          label: "Conversations",  icon: MessageSquare },
      { href: "/content-studio", label: "Content Studio", icon: FileText },
      { href: "/campaigns",      label: "Campaigns",      icon: Megaphone },
    ],
  },
  {
    group: "AUTOMATION",
    items: [
      { href: "/automations", label: "Automations", icon: Zap },
      { href: "/ai-agents",   label: "AI Agents",   icon: Bot },
    ],
  },
  {
    group: "INTELLIGENCE",
    items: [
      { href: "/intelligence/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/reports",                label: "Reports",   icon: Database },
    ],
  },
  {
    group: "ADMIN",
    items: [
      { href: "/settings/integrations", label: "Integrations", icon: Globe },
      { href: "/settings/team",         label: "Team",         icon: Users },
      { href: "/settings",              label: "Settings",     icon: Settings },
    ],
  },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  onThemeToggle?: () => void;
  isDark?: boolean;
}

export function Sidebar({ open = false, onClose, onThemeToggle, isDark }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    CUSTOMER: true, SALES: true, CONVERSATIONS: true,
    AUTOMATION: false, INTELLIGENCE: false, ADMIN: false,
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => { localStorage.setItem(COLLAPSED_KEY, String(!v)); return !v; });
  }, []);

  const toggleGroup = useCallback((group: string) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  useEffect(() => { onClose?.(); }, [pathname]); // eslint-disable-line

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href.split("?")[0]));

  const sidebarWidth = collapsed ? "var(--crm-sidebar-collapsed)" : "var(--crm-sidebar-width)";

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <button
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(4px)" }}
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex h-full flex-col transition-all duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:translate-x-0",
        ].join(" ")}
        style={{
          width: sidebarWidth,
          background: "var(--crm-sidebar-bg)",
          borderRight: "1px solid var(--crm-sidebar-border)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
        }}
      >
        {/* ── Logo ── */}
        <div
          className="flex h-16 shrink-0 items-center px-4"
          style={{
            borderBottom: "1px solid var(--crm-glass-border-soft)",
            justifyContent: collapsed ? "center" : "space-between",
          }}
        >
          {!collapsed && (
            <Link href="/command-center" className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
              >
                <Brain className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold leading-none" style={{ color: "var(--crm-foreground)" }}>
                  TZMICHA
                </p>
                <p className="mt-0.5 text-[10px] font-bold tracking-widest" style={{ color: "var(--brand-primary)" }}>
                  CRM 3.0
                </p>
              </div>
            </Link>
          )}

          {collapsed && (
            <button onClick={toggleCollapsed} title="Expand sidebar">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
              >
                <Brain className="h-4 w-4 text-white" />
              </div>
            </button>
          )}

          {!collapsed && (
            <div className="flex items-center gap-1">
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/20 lg:hidden"
                style={{ color: "var(--crm-muted-fg)" }}
              >
                <X className="h-4 w-4" />
              </button>
              <button
                onClick={toggleCollapsed}
                className="hidden h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/20 lg:flex"
                style={{ color: "var(--crm-muted-fg)" }}
                title="Collapse sidebar"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            </div>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map((section, si) => (
            <div key={si} className={si > 0 ? "mt-1" : ""}>
              {/* Group label */}
              {section.group && !collapsed && (
                <button
                  onClick={() => toggleGroup(section.group!)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors hover:text-foreground"
                  style={{ color: "var(--crm-muted-fg)" }}
                >
                  <ChevronDown
                    className="h-3 w-3 transition-transform duration-200"
                    style={{ transform: openGroups[section.group] ? "rotate(0deg)" : "rotate(-90deg)" }}
                  />
                  {section.group}
                </button>
              )}

              <AnimatePresence initial={false}>
                {(!section.group || collapsed || openGroups[section.group!]) && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeInOut" }}
                    className="overflow-hidden space-y-0.5"
                  >
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            title={collapsed ? item.label : undefined}
                            className={[
                              "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                              collapsed ? "justify-center px-0 py-2.5" : "",
                              active ? "nav-active" : "hover:bg-white/20",
                            ].join(" ")}
                            style={
                              active
                                ? { color: "var(--brand-primary)" }
                                : { color: "var(--crm-muted-fg)" }
                            }
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && (
                              <span className="flex-1 truncate">{item.label}</span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>

              {/* Divider between sections */}
              {si < NAV.length - 1 && section.group && !collapsed && (
                <div
                  className="my-2 mx-2"
                  style={{ height: "1px", background: "var(--crm-glass-border-soft)" }}
                />
              )}
            </div>
          ))}
        </nav>

        {/* ── Footer ── */}
        <div
          className="shrink-0 p-3"
          style={{ borderTop: "1px solid var(--crm-glass-border-soft)" }}
        >
          {!collapsed ? (
            <>
              {/* User row */}
              <div
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer transition-colors hover:bg-white/20"
              >
                <div
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
                >
                  J
                  <span
                    className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2"
                    style={{ background: "#10B981", borderColor: "var(--crm-sidebar-bg)" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--crm-foreground)" }}>
                    John Doe
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--crm-muted-fg)" }}>Team Lead</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--crm-muted-fg)" }} />
              </div>

              {/* Theme toggle */}
              <div
                className="mt-2 flex items-center gap-1 rounded-xl p-1"
                style={{ background: "rgba(0,0,0,0.06)" }}
              >
                <button
                  onClick={onThemeToggle}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all"
                  style={
                    !isDark
                      ? { background: "rgba(255,255,255,0.85)", color: "var(--brand-primary)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
                      : { color: "var(--crm-muted-fg)" }
                  }
                >
                  <Sun className="h-3.5 w-3.5" /> Light
                </button>
                <button
                  onClick={onThemeToggle}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all"
                  style={
                    isDark
                      ? { background: "rgba(255,255,255,0.10)", color: "var(--crm-foreground)", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }
                      : { color: "var(--crm-muted-fg)" }
                  }
                >
                  <Moon className="h-3.5 w-3.5" /> Dark
                </button>
              </div>
            </>
          ) : (
            /* Collapsed: just avatar */
            <div className="flex justify-center">
              <div
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
              >
                J
                <span
                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2"
                  style={{ background: "#10B981", borderColor: "var(--crm-sidebar-bg)" }}
                />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
