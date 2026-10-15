"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LoginBrand,
  LoginCard,
  LoginError,
  LoginField,
  LoginFooter,
  LoginHeading,
  LoginHint,
  LoginPasswordInput,
  LoginPending,
  LoginSecondary,
  LoginShell,
  LoginStatusPanel,
  LoginSubmit,
} from "@/components/auth/login-shell";

/**
 * /reset-password — final step of the password recovery flow.
 *
 * The visitor arrives here from /auth/callback after Supabase's
 * single-use PKCE code was exchanged server-side for a recovery
 * session. This page never sees tokens; it only checks that a valid
 * session exists and then updates the password through
 * supabase.auth.updateUser(). Roles, account membership, and
 * permissions are untouched — this changes the auth password only.
 *
 * Password rules mirror the signup page exactly (match check, 6-char
 * minimum) so no security expectation is weakened or divergent.
 */
export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // 'checking' → brief getSession round-trip; 'ready' → recovery
  // session present, form usable; 'invalid' → no session (bad or
  // already-consumed link).
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">(
    "checking",
  );

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setStatus(data.user ? "ready" : "invalid");
    });
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError("Please fill in both password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Reset done — end the recovery session so "Back to Login"
      // actually lands on the sign-in form instead of being bounced
      // to the dashboard by the proxy's logged-in redirect.
      await supabase.auth.signOut();
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.",
      );
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
            <LoginStatusPanel tone="success" title="Password reset successfully">
              Your password has been reset successfully. You can now sign in
              with your new password.
            </LoginStatusPanel>

            <LoginSecondary href="/login" className="mt-6">
              Back to Login
            </LoginSecondary>
          </>
        ) : status === "checking" ? (
          <LoginPending>Verifying your reset link…</LoginPending>
        ) : status === "invalid" ? (
          <>
            <LoginStatusPanel tone="error" title="Invalid reset link">
              This password reset link is invalid or has already been used.
              Please request a new one.
            </LoginStatusPanel>

            <LoginSecondary href="/forgot-password" className="mt-6">
              Request new link
            </LoginSecondary>
          </>
        ) : (
          <>
            <LoginHeading as="h1" title="Set a new password">
              Choose a strong new password for your account.
            </LoginHeading>

            <form onSubmit={handleReset} className="mt-1 flex flex-col gap-4">
              <LoginError>{error}</LoginError>

              <LoginField label="New Password" htmlFor="newPassword">
                <LoginPasswordInput
                  id="newPassword"
                  placeholder="Must be at least 6 characters"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  showLabel="Show new password"
                  hideLabel="Hide new password"
                />
                <LoginHint>Must be at least 6 characters.</LoginHint>
              </LoginField>

              <LoginField label="Confirm New Password" htmlFor="confirmPassword">
                <LoginPasswordInput
                  id="confirmPassword"
                  placeholder="Confirm your new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  showLabel="Show confirmed password"
                  hideLabel="Hide confirmed password"
                />
              </LoginField>

              <LoginSubmit loading={loading} loadingText="Resetting…">
                Reset Password
              </LoginSubmit>
            </form>
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
