"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header }  from "@/components/layout/header";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const toggleTheme = useCallback(() => {
    setIsDark((v) => {
      const next = !v;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("crm3.theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("crm3.theme");
    if (saved === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  return (
    /* Full-screen container with ambient gradient fixed behind everything */
    <div
      className="flex h-[100dvh] overflow-hidden"
      style={{ background: "var(--crm-bg-gradient)", backgroundAttachment: "fixed" }}
    >
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
        onThemeToggle={toggleTheme}
        isDark={isDark}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-5 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
