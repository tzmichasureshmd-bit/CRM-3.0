import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "./dashboard-shell";

// Server layout whose only job is to declare "do not index" metadata
// for the authed app. robots.ts already disallows these paths at the
// crawler-level and proxy redirects unauthenticated visitors, so
// this is belt-and-suspenders — but SEO-critical if a URL ever leaks
// via a link shared externally.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

// Every page under (dashboard) is a client-rendered view of
// account-scoped Supabase data, so this layout is the one place that
// can gate them all on the server.
//
// It used to rely on the client-side `router.push("/login")` inside
// <DashboardShell> plus a hardcoded prefix list in src/proxy.ts.
// That is not a security boundary: the redirect happens *after* the
// HTML and the initial RLS-scoped queries have already been sent, and
// the proxy list silently fell behind the route tree (reports,
// campaigns, media-library, tickets, reports, … were never listed at
// all). Verifying the session here means an unauthenticated request is
// refused before a single byte of app markup is produced.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy normally catches this first. The check is repeated here
  // so the app is still protected if the matcher config changes, if the
  // proxy is bypassed by a future refactor, or if it runs with a
  // stale/cleared session cookie.
  if (!user) {
    redirect("/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
