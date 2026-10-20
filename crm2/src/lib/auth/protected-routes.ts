// ============================================================
// Protected route inventory — single source of truth.
//
// This list used to live inline in `src/middleware.ts` (now
// `src/proxy.ts`) as a bare array of 8 string prefixes. The app grew
// ~50 more authenticated routes and the list never followed, so
// `/reports`, `/campaigns`, `/media-library`, `/tickets`,
// `/templates`, `/crm`, … were never checked at all. Those pages were
// only stopped by the client-side `router.push("/login")` in
// <DashboardShell>, which runs *after* the HTML has been sent — so the
// route shell (and any data the page fetched while rendering) was
// served to anonymous visitors.
//
// Two things keep this honest going forward:
//   1. `(dashboard)/layout.tsx` now verifies the session on the
//      SERVER, so every route in that group is gated regardless of
//      whether it appears in this list. The list is a UX
//      optimisation (redirect before render) + defence in depth,
//      not the only line of defence.
//   2. `src/lib/auth/protected-routes.test.ts` walks the real
//      `src/app/(dashboard)` directory and fails if any page route
//      is missing here. Adding a page without updating this file
//      breaks `npm test`.
//
// Keep the list sorted-ish and, above all, complete.
// ============================================================

/** Every page under `src/app/(dashboard)/**` — the authed CRM shell. */
export const PROTECTED_APP_PREFIXES = [
  "/agents",
  "/api",
  "/automations",
  "/billing",
  "/broadcasts",
  "/campaigns",
  "/contacts",
  "/crm",
  "/dashboard",
  "/flows",
  "/guide",
  "/inbox",
  "/integrations",
  "/media-library",
  "/notifications",
  "/pipelines",
  "/presets",
  "/reports",
  "/save-money",
  "/settings",
  "/social-media",
  "/templates",
  "/tickets",
] as const;

/**
 * Super-admin console prefixes. `/super-admin/login` is deliberately
 * absent — it must render its own form for anonymous visitors.
 */
export const PROTECTED_SUPER_ADMIN_PREFIXES = ["/super-admin"] as const;

/**
 * Legacy admin console prefixes, kept because `src/app/admin/**` is
 * still a live, buildable route tree. `/admin/login` must stay public.
 */
export const PROTECTED_ADMIN_PREFIXES = ["/admin"] as const;

/** Paths under a protected prefix that must stay reachable while logged out. */
export const AUTH_PAGE_EXCEPTIONS: readonly string[] = [
  "/super-admin/login",
  "/admin/login",
];

/**
 * `/api/whatsapp/**` is session-guarded, but three paths must stay
 * reachable by a machine that cannot hold a browser session:
 *   - `webhook`    — Meta's delivery endpoint (and its GET handshake)
 *   - `cron-*`     — the broadcast scheduler, authenticated by
 *                    `x-cron-secret` inside the handler
 *   - `test`/`verify` are NOT exempt: they read decrypted credentials
 *     and are user-facing buttons, so they need a real session.
 */
export const WHATSAPP_API_PUBLIC_SUFFIXES: readonly string[] = [
  "/webhook",
  "/cron-broadcasts",
];

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGE_EXCEPTIONS.some((p) => pathname === p);
}

/**
 * True when `pathname` belongs to a logged-in-only area and should be
 * bounced to the matching login page. Returns the target login path
 * (or `null` when the route is public).
 */
export function protectedLoginFor(pathname: string): string | null {
  if (isAuthPage(pathname)) return null;

  // `/api` is a real dashboard page (API-keys & docs) living in the
  // (dashboard) group, but `/api/*` underneath it is the route-handler
  // namespace. An unauthenticated call to an endpoint must get that
  // endpoint's own 401 JSON — never an HTML redirect to /login, which
  // `fetch()` callers would try to parse as a page.
  if (pathname.startsWith("/api/")) return null;

  // `startsWith` on "/admin" must not swallow "/administrator", so the
  // next character has to be a separator or end-of-string.
  const under = (prefixes: readonly string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (under(PROTECTED_SUPER_ADMIN_PREFIXES)) return "/super-admin/login";
  if (under(PROTECTED_ADMIN_PREFIXES)) return "/admin/login";
  if (under(PROTECTED_APP_PREFIXES)) return "/login";

  return null;
}

/**
 * True when a `/api/whatsapp/**` request should be rejected for
 * having no Supabase session.
 */
export function isWhatsAppApiRequiringSession(pathname: string): boolean {
  if (!pathname.startsWith("/api/whatsapp/")) return false;
  return !WHATSAPP_API_PUBLIC_SUFFIXES.some((s) => pathname.endsWith(s));
}
