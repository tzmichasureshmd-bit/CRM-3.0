"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";

const SIDEBAR_COLLAPSED_KEY = "wacrm.sidebar.collapsed";

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });

  const toggleCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    // `100dvh`, not `h-screen` (`100vh`).
    //
    // `100vh` is the LARGE viewport height: the height the window would
    // be with a mobile browser's URL bar retracted. On a phone that is
    // taller than what is actually on screen, and this shell is
    // `overflow-hidden`, so the extra height was simply cut off at the
    // bottom of the visual viewport. The inbox composer is the last
    // thing in that column, so it is exactly what disappeared — the
    // typing box looked "missing" on phones and tablets while being
    // perfect on desktop, where `100vh` and `100dvh` are identical.
    //
    // `dvh` tracks the real visible height as the toolbar shows and
    // hides. On desktop the two units are the same value, so this
    // changes nothing there.
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <PresenceHeartbeat />
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleCollapsed}
      />
      {/* `--app-header-h` is declared HERE, next to the `h-14` header it
          describes, so it has exactly one source of truth. Pages that
          have to fill the space under the header subtract it instead of
          re-hard-coding 3.5rem and silently drifting when the header
          changes. */}
      <div className="flex flex-1 flex-col overflow-hidden [--app-header-h:3.5rem]">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
