import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { buildNavSections } from "./admin-shell";

const APP_DIR = join(process.cwd(), "src", "app");

/**
 * Does a `page.tsx` exist for a given URL path? `/super-admin/leads/alerts`
 * → `src/app/super-admin/leads/alerts/page.tsx`.
 */
function hasPage(route: string): boolean {
  return existsSync(join(APP_DIR, ...route.split("/").filter(Boolean), "page.tsx"));
}

const BASES = ["/admin", "/super-admin"] as const;

describe("admin shell navigation", () => {
  // The four items that used to be `${basePath}/…` under /admin are the
  // regression this guards: they 404'd for every /admin user.
  for (const base of BASES) {
    it(`every nav link under ${base} resolves to a real page`, () => {
      const sections = buildNavSections(base);
      const links = sections.flatMap((s) => s.items);

      expect(links.length).toBeGreaterThan(10);

      const dead = links.filter((i) => !hasPage(i.href));
      expect(
        dead,
        `Dead admin nav links for basePath="${base}":\n${dead
          .map((d) => `  ${d.label} → ${d.href}`)
          .join("\n")}`,
      ).toEqual([]);
    });
  }

  it("keeps the Leads section exclusive to the /super-admin tree", () => {
    const superLabels = buildNavSections("/super-admin")
      .flatMap((s) => s.items)
      .map((i) => i.label);
    const adminLabels = buildNavSections("/admin")
      .flatMap((s) => s.items)
      .map((i) => i.label);

    expect(superLabels).toContain("Lead Monitoring");
    expect(superLabels).toContain("Lead Alerts");
    expect(adminLabels).not.toContain("Lead Monitoring");
    expect(adminLabels).not.toContain("Lead Alerts");
  });

  it("has no duplicate hrefs within a tree", () => {
    for (const base of BASES) {
      const hrefs = buildNavSections(base)
        .flatMap((s) => s.items)
        .map((i) => i.href);
      expect(new Set(hrefs).size, `duplicates in ${base}: ${hrefs.join(", ")}`).toBe(
        hrefs.length,
      );
    }
  });
});
