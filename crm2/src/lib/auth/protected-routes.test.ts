import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  PROTECTED_APP_PREFIXES,
  isAuthPage,
  isWhatsAppApiRequiringSession,
  protectedLoginFor,
} from "./protected-routes";

const APP_DIR = join(process.cwd(), "src", "app");
const DASHBOARD_DIR = join(APP_DIR, "(dashboard)");

/**
 * Turn `src/app/(dashboard)/automations/[id]/edit/page.tsx` into
 * `/automations/[id]/edit`.
 */
function routeOf(file: string): string {
  const rel = relative(DASHBOARD_DIR, file).split(sep).join("/");
  return "/" + rel.replace(/\/?page\.tsx$/, "");
}

/** Every `page.tsx` under `src/app/(dashboard)`, recursively. */
function discoverDashboardPages(dir = DASHBOARD_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...discoverDashboardPages(full));
    } else if (entry === "page.tsx") {
      out.push(routeOf(full));
    }
  }
  return out;
}

const covered = (route: string) =>
  PROTECTED_APP_PREFIXES.some(
    (p) => route === p || route.startsWith(`${p}/`),
  );

describe("protected route inventory", () => {
  // This is the test that would have caught the original bug: the
  // inline list in proxy.ts had 8 entries while the route group
  // had ~50 pages, and every page it missed was unprotected.
  it("covers every page in the (dashboard) route group", () => {
    const pages = discoverDashboardPages();
    expect(pages.length).toBeGreaterThan(20); // sanity: we really walked the dir

    const uncovered = pages.filter((p) => !covered(p));
    expect(
      uncovered,
      `Add these to PROTECTED_APP_PREFIXES in protected-routes.ts:\n  ${uncovered.join(
        "\n  ",
      )}`,
    ).toEqual([]);
  });

  it("does not list prefixes that match no real page", () => {
    const pages = new Set(discoverDashboardPages());
    const orphans = PROTECTED_APP_PREFIXES.filter((p) => !pages.has(p));
    expect(orphans, "Stale prefixes — remove them").toEqual([]);
  });
});

describe("protectedLoginFor", () => {
  it("sends each console to its own login page", () => {
    expect(protectedLoginFor("/dashboard")).toBe("/login");
    expect(protectedLoginFor("/reports")).toBe("/login");
    expect(protectedLoginFor("/super-admin/leads")).toBe(
      "/super-admin/login",
    );
    expect(protectedLoginFor("/admin/users")).toBe("/admin/login");
  });

  it("leaves the login pages themselves public", () => {
    expect(protectedLoginFor("/login")).toBeNull();
    expect(protectedLoginFor("/super-admin/login")).toBeNull();
    expect(protectedLoginFor("/admin/login")).toBeNull();
  });

  it("leaves public marketing and auth routes alone", () => {
    for (const p of [
      "/",
      "/pricing",
      "/privacy",
      "/terms",
      "/support",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/join/abc",
    ]) {
      expect(protectedLoginFor(p), p).toBeNull();
    }
  });

  it("matches whole segments, not raw string prefixes", () => {
    // The old `pathname.startsWith('/admin')` would have hijacked
    // these into an admin redirect.
    expect(protectedLoginFor("/administrator")).toBeNull();
    expect(protectedLoginFor("/inbox-archive")).toBeNull();
  });

  it("covers nested dashboard routes", () => {
    expect(protectedLoginFor("/automations/new")).toBe("/login");
    expect(protectedLoginFor("/broadcasts/abc")).toBe("/login");
    expect(protectedLoginFor("/super-admin/leads/alerts")).toBe(
      "/super-admin/login",
    );
  });
});

describe("isWhatsAppApiRequiringSession", () => {
  it("rejects session-bearing whatsapp endpoints", () => {
    expect(isWhatsAppApiRequiringSession("/api/whatsapp/send")).toBe(true);
    expect(isWhatsAppApiRequiringSession("/api/whatsapp/config")).toBe(true);
    expect(isWhatsAppApiRequiringSession("/api/whatsapp/templates/submit")).toBe(
      true,
    );
  });

  it("leaves the Meta webhook open", () => {
    expect(isWhatsAppApiRequiringSession("/api/whatsapp/webhook")).toBe(false);
  });

  // Regression: the previous `!pathname.includes('/webhook')` rule 401'd
  // the broadcast scheduler, so x-cron-secret was never evaluated.
  it("leaves the broadcast scheduler reachable for cron auth", () => {
    expect(
      isWhatsAppApiRequiringSession("/api/whatsapp/cron-broadcasts"),
    ).toBe(false);
  });

  it("ignores paths outside the whatsapp namespace", () => {
    expect(isWhatsAppApiRequiringSession("/api/whatsapp-webhook")).toBe(false);
    expect(isWhatsAppApiRequiringSession("/api/contacts")).toBe(false);
  });
});

describe("isAuthPage", () => {
  it("recognises both admin login pages", () => {
    expect(isAuthPage("/super-admin/login")).toBe(true);
    expect(isAuthPage("/admin/login")).toBe(true);
    expect(isAuthPage("/login")).toBe(false);
  });
});
