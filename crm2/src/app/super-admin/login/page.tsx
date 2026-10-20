"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient, checkSupabaseConnection } from "@/lib/supabase/client";
import { verifySuperAdminRole } from "./actions";
import {
  LoginBrand,
  LoginCard,
  LoginEmailInput,
  LoginError,
  LoginField,
  LoginFooter,
  LoginHeading,
  LoginPasswordInput,
  LoginShell,
  LoginSubmit,
} from "@/components/auth/login-shell";

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        setError(
          "Super Admin authentication is temporarily unavailable. The Supabase configuration is missing. Please contact the administrator.",
        );
        return;
      }

      const health = await checkSupabaseConnection();
      if (!health.ok) {
        if (health.reason === "paused_project") {
          setError(
            "The Supabase project is paused or unavailable. The project administrator must log in to the Supabase dashboard (supabase.com) and resume the project before login can proceed.",
          );
        } else if (health.reason === "network_error") {
          setError(
            "Unable to reach the Supabase authentication server. Please verify the NEXT_PUBLIC_SUPABASE_URL environment variable is correct and try again.",
          );
        } else {
          setError(
            "Super Admin authentication is temporarily unavailable. Please contact the administrator.",
          );
        }
        return;
      }

      const supabase = createClient();

      let authData;
      try {
        const result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        authData = result.data;
        if (result.error) {
          const msg = result.error.message;
          if (
            msg.includes("Invalid login credentials") ||
            msg.includes("invalid_grant") ||
            msg.includes(" Email not confirmed")
          ) {
            setError("Invalid email or password. Please try again.");
          } else {
            console.error("[SUPER ADMIN] signInWithPassword error:", msg);
            setError(
              "Unable to sign in. Please verify your credentials and try again.",
            );
          }
          return;
        }
      } catch (fetchErr) {
        console.error("[SUPER ADMIN] signInWithPassword threw:", fetchErr);
        const fetchMsg =
          fetchErr instanceof Error ? fetchErr.message : String(fetchErr);

        if (fetchMsg.includes("Failed to fetch") || fetchMsg.includes("NetworkError")) {
          setError(
            "Unable to connect to the authentication server. Please verify the deployment environment variables are correctly configured and try again.",
          );
        } else {
          setError(
            "Unable to sign in. Please try again.",
          );
        }
        return;
      }

      if (!authData?.user) {
        setError("Sign in succeeded but no user was returned. Please try again.");
        return;
      }

      console.log("[SUPER ADMIN] Auth successful, verifying role for user:", authData.user.id);

      const result = await verifySuperAdminRole();

      if (!result.authorized) {
        await supabase.auth.signOut();
        setError(result.reason ?? "You do not have Super Admin access.");
        return;
      }

      window.location.href = "/super-admin";
    } catch (err) {
      console.error("[SUPER ADMIN LOGIN] Unexpected error:", err);
      setError(
        "Super Admin authentication is temporarily unavailable. Please try again later.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell>
      <LoginCard>
        <LoginBrand />

        <LoginHeading title="Super Admin Access">
          Sign in with your Super Admin credentials.
        </LoginHeading>

        <form onSubmit={handleLogin} className="mt-2 flex flex-col gap-4">
          <LoginError>{error}</LoginError>

          <LoginField label="Email" htmlFor="email">
            <LoginEmailInput
              id="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </LoginField>

          <LoginField label="Password" htmlFor="password">
            <LoginPasswordInput
              id="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              showLabel="Show password"
              hideLabel="Hide password"
            />
          </LoginField>

          <LoginSubmit loading={loading} loadingText="Signing in...">
            Sign In as Super Admin
          </LoginSubmit>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="login-link">
            &larr; Back to Customer Login
          </Link>
        </div>
      </LoginCard>

      <LoginFooter>
        &copy; {new Date().getFullYear()} TZmicha IT Solutions &middot; WhatsApp
        CRM
      </LoginFooter>
    </LoginShell>
  );
}