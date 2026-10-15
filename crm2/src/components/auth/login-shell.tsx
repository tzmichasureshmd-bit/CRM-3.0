"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  TriangleAlert,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";

const LOGIN_IMAGE_SRC = "/images/remove_background.jpg";

/* ------------------------------------------------------------------
 * Cinematic shell: CRM4 image covers the entire viewport as one
 * background, a subtle neutral overlay sits on top for legibility,
 * and the glass login card floats centered above it. The image is
 * the page — there is no split-screen, side panel or separate
 * login column.
 * ------------------------------------------------------------------ */
export function LoginShell({ children, imageSrc }: { children: React.ReactNode; imageSrc?: string }) {
  const src = imageSrc ?? LOGIN_IMAGE_SRC;
  return (
    <main className="login-shell">
      <div className="login-bg" aria-hidden="true">
        <Image
          className="login-bg__img"
          src={src}
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <div className="login-bg__overlay" />
      </div>
      <div className="login-shell__content">{children}</div>
    </main>
  );
}

/* ------------------------------------------------------------------
 * Frosted glass card.
 * ------------------------------------------------------------------ */
export function LoginCard({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "login-glass login-card-enter w-full px-5 py-5 sm:px-5 sm:py-6",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------
 * Brand header — existing Tzmicha mark (primary chat-square tile as
 * used by the favicon / sidebar / landing nav) + wordmark.
 * ------------------------------------------------------------------ */
export function LoginBrand() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="login-brand-mark">
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="login-brand-eyebrow">TZmicha IT Solutions</p>
      <p className="login-brand-name">WhatsApp CRM</p>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Panel heading inside the card.
 *
 * `as` exists because these cards are the only content on their page:
 * the primary flows (login / sign-up / forgot / reset) need the page's
 * <h1>, while the admin and Super Admin cards already ship as <h2> and
 * must not silently change level. Default keeps the previous markup.
 * ------------------------------------------------------------------ */
export function LoginHeading({
  as: Tag = "h2",
  title,
  children,
}: {
  as?: "h1" | "h2";
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <Tag className="login-heading-title">{title}</Tag>
      {children && <p className="login-heading-text">{children}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Label row (optionally with an inline action like "Forgot password?").
 * ------------------------------------------------------------------ */
export function LoginField({
  label,
  htmlFor,
  action,
  children,
}: {
  label: string;
  htmlFor: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="login-field-row">
        <label className="login-label" htmlFor={htmlFor}>
          {label}
        </label>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Email field with leading icon.
 * ------------------------------------------------------------------ */
export function LoginEmailInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="login-field">
      <Mail className="login-input-icon" aria-hidden="true" />
      <input
        type="email"
        autoComplete="email"
        spellCheck={false}
        className={cn("login-input login-input--icon", className)}
        {...props}
      />
    </div>
  );
}

/* ------------------------------------------------------------------
 * Generic text field with a leading icon (e.g. Full name on sign-up).
 * autoComplete is not forced so each caller can pass the correct hint.
 * ------------------------------------------------------------------ */
export function LoginTextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="login-field">
      <User className="login-input-icon" aria-hidden="true" />
      <input
        className={cn("login-input login-input--icon", className)}
        {...props}
      />
    </div>
  );
}

/* ------------------------------------------------------------------
 * Small helper text under a field, e.g. the password minimum length.
 * ------------------------------------------------------------------ */
export function LoginHint({ children }: { children: React.ReactNode }) {
  return <p className="login-hint">{children}</p>;
}

/* ------------------------------------------------------------------
 * "Don't have an account? Sign up" style switcher, centred under the
 * form so the card has a consistent bottom edge on every auth page.
 * ------------------------------------------------------------------ */
export function LoginAuthSwitch({
  children,
}: {
  children: React.ReactNode;
}) {
  return <p className="login-switch-row">{children}</p>;
}

/* ------------------------------------------------------------------
 * Password field with leading icon + accessible show/hide toggle.
 * ------------------------------------------------------------------ */
export function LoginPasswordInput({
  className,
  showLabel,
  hideLabel,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="login-field">
      <Lock className="login-input-icon" aria-hidden="true" />
      <input
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        className={cn(
          "login-input login-input--icon login-input--icon-end",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        className="login-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Inline status banner. role="alert" so errors are announced to
 * screen readers; the other tones use role="status" (polite) so a
 * success message does not interrupt a screen-reader user mid-sentence.
 * ------------------------------------------------------------------ */
type NoticeTone = "error" | "warning" | "success";

const NOTICE_ICONS: Record<NoticeTone, React.ComponentType<{ className?: string }>> = {
  error: CircleAlert,
  warning: TriangleAlert,
  success: CheckCircle2,
};

export function LoginNotice({
  tone = "error",
  className,
  children,
}: {
  tone?: NoticeTone;
  className?: string;
  children: React.ReactNode;
}) {
  if (!children) return null;
  const Icon = NOTICE_ICONS[tone];
  return (
    <div
      className={cn("login-notice", `login-notice--${tone}`, "login-error-enter", className)}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Inline error banner. Thin wrapper over LoginNotice so the existing
 * call sites keep working unchanged.
 * ------------------------------------------------------------------ */
export function LoginError({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LoginNotice tone="error">
      {children}
    </LoginNotice>
  );
}

/* ------------------------------------------------------------------
 * Centred status panel body — used by the "check your email" and
 * "invalid link" states where there is no form, just an outcome.
 * Vertical rhythm comes from .login-heading-title / -text, which are
 * unlayered and would beat any Tailwind margin utility here.
 * ------------------------------------------------------------------ */
export function LoginStatusPanel({
  tone = "success",
  title,
  children,
}: {
  tone?: NoticeTone;
  title: string;
  children?: React.ReactNode;
}) {
  const Icon = NOTICE_ICONS[tone];
  return (
    <div className="flex flex-col items-center text-center">
      <div className={cn("login-status-icon", `login-status-icon--${tone}`)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="login-heading-title">{title}</h2>
      {children && <p className="login-heading-text">{children}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Spinner-only status body — the brief "checking your link" state
 * while getSession() resolves.
 * ------------------------------------------------------------------ */
export function LoginPending({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <Loader2
        className="h-5 w-5 animate-spin text-white/70 motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p className="login-heading-text">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------
 * "Remember for 30 days" style checkbox row. The checkbox is a real
 * <input type="checkbox"> so keyboard and screen-reader behaviour are
 * native; only the visual is restyled.
 * ------------------------------------------------------------------ */
export function LoginCheckbox({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="login-checkbox" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="login-checkbox__input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="login-checkbox__box" aria-hidden="true">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
      <span className="login-checkbox__label">{children}</span>
    </label>
  );
}

/* ------------------------------------------------------------------
 * Primary CTA — spinner while submitting, disabled to block duplicates.
 * ------------------------------------------------------------------ */
export function LoginSubmit({
  loading,
  loadingText,
  children,
}: {
  loading: boolean;
  loadingText: string;
  children: React.ReactNode;
}) {
  return (
    <button type="submit" className="login-submit" disabled={loading}>
      {loading ? (
        <>
          <Loader2
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {loadingText}
        </>
      ) : (
        <>{children}</>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------
 * Secondary full-width link-button.
 * ------------------------------------------------------------------ */
export function LoginSecondary({
  href,
  icon,
  className,
  children,
}: {
  href: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn("login-secondary", className)}>
      {icon}
      {children}
    </Link>
  );
}

export function LoginDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-divider">
      <span>{children}</span>
    </div>
  );
}

export function LoginFooter({ children }: { children: React.ReactNode }) {
  return <p className="login-muted text-center">{children}</p>;
}