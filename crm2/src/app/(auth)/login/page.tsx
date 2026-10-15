"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  LoginAuthSwitch,
  LoginBrand,
  LoginCard,
  LoginCheckbox,
  LoginEmailInput,
  LoginError,
  LoginField,
  LoginFooter,
  LoginHeading,
  LoginPasswordInput,
  LoginShell,
  LoginSubmit,
} from "@/components/auth/login-shell";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
    } catch (err) {
      const isMisconfigured = err instanceof Error && err.message.includes("Supabase is not configured");
      setError(isMisconfigured ? "Supabase is not configured. Please contact the administrator." : "Unable to sign in. Please try again later.");
      setLoading(false);
      return;
    }
    const destination = inviteToken ? `/join/${encodeURIComponent(inviteToken)}` : "/dashboard";
    window.location.href = destination;
  };

  return (
    <LoginShell imageSrc="/images/3804820b-a1d6-4a83-923c-e509ff58a324.png">
      <LoginCard>
        <LoginBrand />

        <LoginHeading as="h1" title="Welcome back">
          Sign in to manage your conversations, leads, contacts and business
          communication.
        </LoginHeading>

        <form onSubmit={handleLogin} className="mt-1 flex flex-col gap-4">
          <LoginError>{error}</LoginError>

          <LoginField label="Email" htmlFor="email">
            <LoginEmailInput
              id="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </LoginField>

          <LoginField
            label="Password"
            htmlFor="password"
            action={
              <Link href="/forgot-password" className="login-link-accent">
                Forgot password?
              </Link>
            }
          >
            <LoginPasswordInput
              id="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              showLabel="Show password"
              hideLabel="Hide password"
            />
          </LoginField>

          <LoginCheckbox
            id="remember"
            checked={remember}
            onChange={setRemember}
          >
            Remember for 30 days
          </LoginCheckbox>

          <LoginSubmit loading={loading} loadingText={t("signingIn")}>
            Login
          </LoginSubmit>
        </form>

        <LoginAuthSwitch>
          Don&apos;t have an account?{" "}
          <Link
            href={
              inviteToken
                ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                : "/signup"
            }
            className="login-link-accent"
          >
            Sign up
          </Link>
        </LoginAuthSwitch>
      </LoginCard>

      <LoginFooter>
        &copy; {new Date().getFullYear()} TZmicha IT Solutions &middot; WhatsApp
        CRM
      </LoginFooter>
    </LoginShell>
  );
}
