import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { assertSuperAdminProfile } from "@/lib/auth/super-admin-policy";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: "Super Admin",
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

/**
 * Server-side authorization gate for the Super Admin dashboard.
 *
 * The proxy ensures:
 *  - Unauthenticated users on /admin (except /admin/login) → /admin/login
 *  - Unauthenticated users on /admin/login → passed through to here
 *  - Authenticated users on /admin/login → /admin
 *
 * So the only unauthenticated users reaching this layout are on /admin/login.
 * We render children without the AdminShell for that page.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already routed unauthenticated users to /admin/login.
  // Render children directly (no shell, no auth gate) for the login page.
  if (!user) {
    return <>{children}</>;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role, email")
    .eq("user_id", user.id)
    .maybeSingle();

  // Identical rule to the /super-admin tree — see
  // src/lib/auth/super-admin-policy.ts. The two layouts used to
  // disagree (this one also required the SUPER_ADMIN_EMAILS
  // allowlist), which made the allowlist trivially bypassable by
  // switching to the other console.
  if (!assertSuperAdminProfile(profile).authorized) {
    redirect("/dashboard");
  }

  return <AdminShell>{children}</AdminShell>;
}
