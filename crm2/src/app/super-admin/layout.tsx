import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { assertSuperAdminProfile } from "@/lib/auth/super-admin-policy";
import { AdminShell } from "@/components/admin/admin-shell";
import { UnauthorizedAccess } from "@/components/admin/unauthorized-access";

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
 * On every navigation into /super-admin/* (except /super-admin/login
 * which is handled below), this layout verifies:
 *   1. The user has an authenticated session.
 *   2. The user's profile has platform_role = "super_admin".
 *
 * If the user is unauthenticated, they are redirected to /super-admin/login.
 * If the user is authenticated but NOT a super_admin, they see an
 * authorization error page (not a redirect to login).
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated users visiting /super-admin/* get the login page
  // without the admin shell chrome.
  if (!user) {
    return <>{children}</>;
  }

  // Select platform_role (the real column, used by the is_super_admin()
  // SQL helper) plus email for the optional SUPER_ADMIN_EMAILS gate.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("platform_role, email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[SUPER ADMIN LAYOUT] Profile query error:", profileError.message);
    redirect("/super-admin/login");
  }

  // The same rule the login server action and the /admin tree apply —
  // see src/lib/auth/super-admin-policy.ts for why it is shared.
  const verdict = assertSuperAdminProfile(profile);

  if (!verdict.authorized) {
    if (verdict.code === "not-allowlisted") {
      console.error(
        `[SUPER ADMIN LAYOUT] ${user.email ?? user.id} has platform_role=super_admin but is not in SUPER_ADMIN_EMAILS`,
      );
    }
    // Authenticated but NOT authorized — show error page, don't redirect to login
    return <UnauthorizedAccess />;
  }

  return (
    <AdminShell basePath="/super-admin" logoutRedirect="/super-admin/login" showBackToCrm={false}>
      {children}
    </AdminShell>
  );
}
