"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft } from "lucide-react";
import {
  LoginBrand,
  LoginCard,
  LoginEmailInput,
  LoginError,
  LoginField,
  LoginFooter,
  LoginHeading,
  LoginNotice,
  LoginSecondary,
  LoginShell,
  LoginStatusPanel,
  LoginSubmit,
} from "@/components/auth/login-shell";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordPageInner />
    </Suspense>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ForgotPasswordPageInner() {
  const searchParams = useSearchParams();
  const staleLink = searchParams.get("error") === "invalid_reset_link";

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (!EMAIL_PATTERN.test(email.trim())) { setError("Please enter a valid email address."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) { setError(error.message); return; }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell imageSrc="/images/3804820b-a1d6-4a83-923c-e509ff58a324.png">
      <LoginCard>
        <LoginBrand />

        {success ? (
          <>
            <LoginStatusPanel tone="success" title="Check your email">
              If an account exists for this email, you&apos;ll receive reset
              instructions shortly. Check your inbox and spam folder.
            </LoginStatusPanel>

            <LoginSecondary href="/login" className="mt-6">
              Back to sign in
            </LoginSecondary>
          </>
        ) : (
          <>
            <LoginHeading as="h1" title="Reset password">
              Enter your email and we&apos;ll send you a secure reset link.
            </LoginHeading>

            <form onSubmit={handleReset} className="mt-1 flex flex-col gap-4">
              {staleLink && (
                <LoginNotice tone="warning">
                  That reset link is invalid or has already been used. Request a
                  new one below.
                </LoginNotice>
              )}

              <LoginError>{error}</LoginError>

              <LoginField label="Email address" htmlFor="email">
                <LoginEmailInput
                  id="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </LoginField>

              <LoginSubmit loading={loading} loadingText="Sending...">
                Send Reset Link
              </LoginSubmit>
            </form>

            <LoginSecondary
              href="/login"
              icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
              className="mt-5"
            >
              Back to sign in
            </LoginSecondary>
          </>
        )}
      </LoginCard>

      <LoginFooter>
        &copy; {new Date().getFullYear()} TZmicha IT Solutions &middot; WhatsApp
        CRM
      </LoginFooter>
    </LoginShell>
  );
}
