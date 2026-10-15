"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  LoginAuthSwitch,
  LoginBrand,
  LoginCard,
  LoginEmailInput,
  LoginError,
  LoginField,
  LoginFooter,
  LoginHeading,
  LoginPasswordInput,
  LoginShell,
  LoginStatusPanel,
  LoginSubmit,
  LoginTextInput,
} from "@/components/auth/login-shell";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    const emailRedirectTo = inviteToken
      ? `${window.location.origin}/join/${encodeURIComponent(inviteToken)}`
      : undefined;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, ...(emailRedirectTo ? { emailRedirectTo } : {}) },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setSuccess(true);
    setLoading(false);
  };

  const loginHref = inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login";

  if (success) {
    return (
      <LoginShell imageSrc="/images/1843ca78-a7d8-4f62-a658-2f7864fe570a.png">
        <LoginCard>
          <LoginBrand />

          <LoginStatusPanel tone="success" title="Check your email">
            We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click
            the link to verify your account.
          </LoginStatusPanel>

          <Link
            href={loginHref}
            className="login-submit mt-6 no-underline"
          >
            Back to sign in
          </Link>
        </LoginCard>

        <LoginFooter>
          &copy; {new Date().getFullYear()} TZmicha IT Solutions &middot; WhatsApp
          CRM
        </LoginFooter>
      </LoginShell>
    );
  }

  return (
    <LoginShell imageSrc="/images/1843ca78-a7d8-4f62-a658-2f7864fe570a.png">
      <LoginCard>
        <LoginBrand />

        <LoginHeading
          as="h1"
          title={inviteToken ? "Create account & join" : "Create account"}
        >
          {inviteToken
            ? "Verify your email, then accept the invitation."
            : "Get started with WhatsApp CRM TZmicha"}
        </LoginHeading>

        <form onSubmit={handleSignup} className="mt-1 flex flex-col gap-4">
          <LoginError>{error}</LoginError>

          <LoginField label="Full name" htmlFor="fullName">
            <LoginTextInput
              id="fullName"
              type="text"
              placeholder="Full name"
              autoComplete="name"
              spellCheck={false}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </LoginField>

          <LoginField label="Email" htmlFor="email">
            <LoginEmailInput
              id="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </LoginField>

          <LoginField label="Password" htmlFor="password">
            <LoginPasswordInput
              id="password"
              placeholder="Password (min 6 chars)"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              showLabel="Show password"
              hideLabel="Hide password"
            />
          </LoginField>

          <LoginField label="Confirm password" htmlFor="confirmPassword">
            <LoginPasswordInput
              id="confirmPassword"
              placeholder="Confirm password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              showLabel="Show confirm password"
              hideLabel="Hide confirm password"
            />
          </LoginField>

          <LoginSubmit loading={loading} loadingText="Creating account...">
            Create account
          </LoginSubmit>
        </form>

        <LoginAuthSwitch>
          Already have an account?{" "}
          <Link href={loginHref} className="login-link-accent">
            Sign in
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
