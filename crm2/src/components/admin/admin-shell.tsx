"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import {
  Activity,
  BarChart3,
  BellRing,
  Building2,
  CreditCard,
  DollarSign,
  FileStack,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Radio,
  ScrollText,
  Settings,
  Smartphone,
  Target,
  TrendingUp,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Navigation model for both admin consoles.
 *
 * Exported so `admin-shell.nav.test.ts` can assert every href maps to a
 * real page. Four items (Wallets, Pricing Rules, Automation Mgmt, System
 * Health) previously used `${basePath}/…`, which 404'd for the whole
 * /admin tree because those pages only exist under /super-admin.
 */
export function buildNavSections(basePath: string): NavSection[] {
  const sections: NavSection[] = [
    {
      title: "Platform",
      items: [
        { href: basePath, label: "Dashboard", icon: LayoutDashboard },
        { href: `${basePath}/businesses`, label: "Businesses", icon: Building2 },
        { href: `${basePath}/users`, label: "Users", icon: Users },
      ],
    },
    {
      title: "Commercial",
      items: [
        { href: `${basePath}/plans`, label: "Plans", icon: FileStack },
        { href: `${basePath}/subscriptions`, label: "Subscriptions", icon: CreditCard },
        { href: `${basePath}/payments`, label: "Payments", icon: DollarSign },
        { href: `${basePath}/usage`, label: "Usage", icon: BarChart3 },
      ],
    },
    {
      title: "Monitoring",
      items: [
        { href: `${basePath}/whatsapp`, label: "WhatsApp Health", icon: Smartphone },
        { href: `${basePath}/campaigns`, label: "Campaign Monitoring", icon: Radio },
        { href: `${basePath}/automations`, label: "Automation Monitoring", icon: Zap },
        { href: `${basePath}/flows`, label: "Flow Monitoring", icon: Workflow },
        { href: `${basePath}/analytics`, label: "Analytics", icon: TrendingUp },
        { href: `${basePath}/health`, label: "Platform Health", icon: Activity },
      ],
    },
    {
      title: "Administration",
      items: [
        { href: `${basePath}/audit`, label: "Audit Logs", icon: ScrollText },
        // The four items below only exist as pages under
        // /super-admin. Rendering them as `${basePath}/…` produced a
        // guaranteed 404 for anyone signed into the /admin tree, so
        // they are listed with their real, absolute path instead.
        { href: "/super-admin/wallets", label: "Wallets", icon: DollarSign },
        {
          href: "/super-admin/pricing-rules",
          label: "Pricing Rules",
          icon: DollarSign,
        },
        {
          href: "/super-admin/automation-management",
          label: "Automation Mgmt",
          icon: Zap,
        },
        {
          href: "/super-admin/system-health",
          label: "System Health",
          icon: Activity,
        },
        { href: `${basePath}/support`, label: "Support", icon: LifeBuoy },
        { href: `${basePath}/settings`, label: "Settings", icon: Settings },
      ],
    },
  ];

  // Platform-wide lead monitoring + two-person alert log. Only mounted
  // under the /super-admin tree (the pages are not part of /admin).
  if (basePath === "/super-admin") {
    sections.splice(1, 0, {
      title: "Leads & Employees",
      items: [
        { href: `${basePath}/employees`, label: "Employee Monitoring", icon: Users },
        { href: `${basePath}/leads`, label: "Lead Monitoring", icon: Target },
        { href: `${basePath}/leads/alerts`, label: "Lead Alerts", icon: BellRing },
      ],
    });
  }

  return sections;
}

function isActive(pathname: string, href: string, basePath: string) {
  if (href === basePath) return pathname === basePath;
  return pathname.startsWith(href);
}

interface AdminShellProps {
  children: React.ReactNode;
  /** Route prefix for this admin area. Defaults to "/admin". */
  basePath?: string;
  /** Where to send the user after signing out. Defaults to "/login". */
  logoutRedirect?: string;
  /** Whether to show the "Back to CRM" link in the header. Defaults to true. */
  showBackToCrm?: boolean;
}

function AdminShellInner({ children, basePath, logoutRedirect, showBackToCrm }: AdminShellProps & { basePath: string; logoutRedirect: string }) {
  const { user, loading, profile, signOut, isSuperAdmin } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const navSections = buildNavSections(basePath);

  // For super-admin routes, only show nav if user is a super admin.
  // The layout already gates access server-side; this is UX-only.
  const visibleSections = basePath === "/super-admin" && !isSuperAdmin
    ? []
    : navSections;

  const handleSignOut = useCallback(async () => {
    await signOut();
    window.location.href = logoutRedirect;
  }, [signOut, logoutRedirect]);

  const onSidebarCloseRef = useRef(closeSidebar);
  useEffect(() => {
    onSidebarCloseRef.current = closeSidebar;
  });
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      onSidebarCloseRef.current();
    }
    prevPathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sidebarOpen, closeSidebar]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <button
        type="button"
        aria-label="Close menu"
        onClick={closeSidebar}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          sidebarOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-border bg-card",
          "transition-transform duration-200 ease-out will-change-transform",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none",
        )}
        aria-label="Admin"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <Link href={basePath} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                Super Admin
              </span>
              <span className="text-xs text-muted-foreground">
                Platform Management
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={closeSidebar}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {visibleSections.map((section, i) => (
            <div key={section.title}>
              {i > 0 && <div className="my-3 border-t border-border" />}
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href, basePath);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none data-popup-open:bg-muted/60">
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile?.full_name ?? "Admin"}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    "A"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {profile?.full_name ?? "Admin"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile?.email ?? ""}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="min-w-56 bg-popover text-popover-foreground ring-border"
            >
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
                Super Admin
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Platform Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showBackToCrm && (
              <Link
                href="/dashboard"
                className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
              >
                Back to CRM
              </Link>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/70 focus:bg-muted/70 focus:outline-none data-popup-open:bg-muted/70"
                aria-label="Account menu"
              >
                <Avatar className="size-8">
                  {profile?.avatar_url ? (
                    <AvatarImage
                      src={profile.avatar_url}
                      alt={profile?.full_name ?? "Admin"}
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                    {profile?.full_name?.charAt(0)?.toUpperCase() ??
                      profile?.email?.charAt(0)?.toUpperCase() ??
                      "A"}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium text-foreground sm:inline">
                  {profile?.full_name ?? "Admin"}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="min-w-56 bg-popover text-popover-foreground ring-border"
              >
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {profile?.full_name ?? "Admin"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {profile?.email ?? ""}
                  </p>
                </div>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  render={
                    <Link
                      href={`${basePath}/settings`}
                      className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                    />
                  }
                >
                  <Settings className="size-4" />
                  Admin Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                >
                  <LogOut className="size-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function AdminShell({ children, basePath = "/admin", logoutRedirect = "/login", showBackToCrm = true }: AdminShellProps) {
  return (
    <AuthProvider>
      <AdminShellInner basePath={basePath} logoutRedirect={logoutRedirect} showBackToCrm={showBackToCrm}>
        {children}
      </AdminShellInner>
    </AuthProvider>
  );
}
