"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import {
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Users,
  X,
  Zap,
  Bell,
  Radio,
  ArrowLeft,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/team", label: "Team Members", icon: Users },
  { href: "/admin/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/admin/broadcasts", label: "Broadcasts", icon: Radio },
  { href: "/admin/automations", label: "Automations", icon: Zap },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}

function OrgAdminShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, profile, account, accountRole, signOut } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    window.location.href = "/login";
  }, [signOut]);

  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    const changed = prevPathnameRef.current !== pathname;
    prevPathnameRef.current = pathname;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (changed) closeSidebar();
  }, [pathname, closeSidebar]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSidebar(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [sidebarOpen, closeSidebar]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={closeSidebar}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-border bg-card",
          "transition-transform duration-200 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none",
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <Image src="/images/logo.png" alt="Logo" width={32} height={32} className="rounded-lg object-contain" />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground">{account?.name ?? "Admin"}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Organisation Admin</span>
            </div>
          </Link>
          <button type="button" onClick={closeSidebar} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-3 border-t border-border" />

          {/* Back to CRM */}
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to CRM
          </Link>

          <div className="my-3 border-t border-border" />
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Manage</p>
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(pathname, "/settings") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            Account Settings
          </Link>
        </nav>

        {/* User */}
        <div className="shrink-0 border-t border-border p-3">
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {accountRole === "owner" ? "👑 Owner" : "🛡️ Admin"}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted/60 focus:outline-none">
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? ""} />}
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ?? profile?.email?.charAt(0)?.toUpperCase() ?? "A"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{profile?.full_name ?? "Admin"}</p>
                <p className="truncate text-xs text-muted-foreground">{profile?.email ?? ""}</p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" sideOffset={6} className="min-w-56">
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-foreground sm:text-lg">
                <Building2 className="mr-1.5 inline h-4 w-4 text-muted-foreground" />
                {account?.name ?? "Organisation Admin"}
              </h1>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/70 focus:outline-none">
              <Avatar className="size-8">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? ""} />}
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ?? "A"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium text-foreground sm:inline">{profile?.full_name ?? "Admin"}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function OrgAdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OrgAdminShellInner>{children}</OrgAdminShellInner>
    </AuthProvider>
  );
}
