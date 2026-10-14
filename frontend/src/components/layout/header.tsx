"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, MessageSquare, Settings, Brain, Grid3X3, Command } from "lucide-react";

interface HeaderProps {
  onOpenSidebar: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [searchOpen]);

  return (
    <>
      <header
        className="flex h-16 shrink-0 items-center gap-4 px-6"
        style={{
          background: "var(--crm-header-bg)",
          borderBottom: "1px solid var(--crm-glass-border-soft)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* Mobile menu */}
        <button
          onClick={onOpenSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/20 lg:hidden"
          style={{ color: "var(--crm-muted-fg)" }}
        >
          <Grid3X3 className="h-4 w-4" />
        </button>

        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex flex-1 max-w-lg items-center gap-3 rounded-2xl px-4 py-2.5 text-sm transition-all hover:shadow-md"
          style={{
            background: "rgba(255,255,255,0.55)",
            border: "1px solid var(--crm-glass-border)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            color: "var(--crm-muted-fg)",
          }}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left text-sm">
            Search customers, leads, conversations...
          </span>
          <div
            className="flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-medium"
            style={{
              borderColor: "var(--crm-glass-border)",
              background: "rgba(255,255,255,0.7)",
              color: "var(--crm-muted-fg)",
            }}
          >
            <Command className="h-2.5 w-2.5" /> K
          </div>
        </button>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          {/* Messages */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-white/25"
            style={{ color: "var(--crm-muted-fg)" }}
          >
            <MessageSquare className="h-4 w-4" />
          </button>

          {/* Notifications */}
          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-white/25"
            style={{ color: "var(--crm-muted-fg)" }}
          >
            <Bell className="h-4 w-4" />
            <span
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2"
              style={{ background: "#EF4444", borderColor: "transparent" }}
            />
          </button>

          {/* Settings */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-white/25"
            style={{ color: "var(--crm-muted-fg)" }}
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* AI badge */}
          <div
            className="hidden items-center gap-1.5 rounded-xl px-3 py-1.5 sm:flex"
            style={{
              background: "rgba(79,110,247,0.10)",
              border: "1px solid rgba(79,110,247,0.22)",
            }}
          >
            <Brain className="h-3.5 w-3.5" style={{ color: "var(--brand-primary)" }} />
            <span className="text-[11px] font-semibold" style={{ color: "var(--brand-primary)" }}>
              AI Active
            </span>
            <span
              className="h-1.5 w-1.5 rounded-full ai-pulse"
              style={{ background: "var(--brand-primary)" }}
            />
          </div>

          {/* Avatar */}
          <div
            className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #4F6EF7, #7C3AED)" }}
          >
            J
            <span
              className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border-2"
              style={{ background: "#10B981", borderColor: "white" }}
            />
          </div>
        </div>
      </header>

      {/* Global Search Modal */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24"
            style={{ background: "rgba(0,0,0,0.28)", backdropFilter: "blur(6px)" }}
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-2xl overflow-hidden rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.88)",
                border: "1px solid var(--crm-glass-border)",
                backdropFilter: "blur(32px)",
                WebkitBackdropFilter: "blur(32px)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-center gap-3 px-5 py-4"
                style={{ borderBottom: "1px solid var(--crm-glass-border-soft)" }}
              >
                <Search className="h-4 w-4 shrink-0" style={{ color: "var(--crm-muted-fg)" }} />
                <input
                  ref={inputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search customers, leads, deals, conversations..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "var(--crm-foreground)" }}
                />
                <kbd
                  className="rounded-lg border px-2 py-1 text-[10px]"
                  style={{ borderColor: "var(--crm-glass-border)", color: "var(--crm-muted-fg)" }}
                >
                  ESC
                </kbd>
              </div>
              <div className="p-4">
                <p
                  className="mb-3 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--crm-muted-fg)" }}
                >
                  Quick Actions
                </p>
                <div className="space-y-1">
                  {[
                    { icon: Brain,    label: "Ask AI Copilot",  sub: "Natural language CRM queries", color: "#4F6EF7" },
                    { icon: Search,   label: "Find a Contact",  sub: "Search by name, phone, email", color: "#10B981" },
                    { icon: Settings, label: "Go to Settings",  sub: "Configure your CRM",           color: "#F59E0B" },
                  ].map((item) => (
                    <button
                      key={item.label}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:bg-black/5"
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: `${item.color}18` }}
                      >
                        <item.icon className="h-4 w-4" style={{ color: item.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--crm-foreground)" }}>
                          {item.label}
                        </p>
                        <p className="text-xs" style={{ color: "var(--crm-muted-fg)" }}>
                          {item.sub}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
