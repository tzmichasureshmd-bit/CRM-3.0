import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { THEME_IDS } from "@/lib/themes";

const CSS = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

/** Strip block comments so selector text inside them can't confuse us. */
const CSS_NO_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Body of the rule whose selector list contains `selector`.
 *
 * Two things this has to get right:
 *  - The selector may be preceded by siblings on their own lines; the
 *    dark mode block is `:root,\nhtml[data-mode="dark"] {`.
 *  - `html[data-mode="dark"]` ALSO appears inside the functional value
 *    of `@custom-variant dark (&:is(.dark *, html[data-mode="dark"] *))`.
 *    A bare indexOf() lands there, and the next `{` is `@theme inline {`,
 *    which silently yields the wrong token set. So require the
 *    selector to be followed by `,` or `{` — i.e. a real selector
 *    position, not an argument.
 */
function ruleBody(selector: string): string | null {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[,{]",
  );
  const m = re.exec(CSS_NO_COMMENTS);
  if (!m) return null;
  const open = CSS_NO_COMMENTS.indexOf("{", m.index);
  // These token blocks nest no braces, so the first `}` ends the rule.
  const close = CSS_NO_COMMENTS.indexOf("}", open);
  return CSS_NO_COMMENTS.slice(open + 1, close);
}

function accentBlock(id: string): string | null {
  return ruleBody(`html[data-theme="${id}"]`);
}

/** Custom properties declared inside a block. */
function declared(block: string): Set<string> {
  return new Set(
    [...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );
}

const modeDark = ruleBody('html[data-mode="dark"]') ?? "";
const modeLight = ruleBody('html[data-mode="light"]') ?? "";

describe("accent theme token completeness", () => {
  it("defines a block for every theme in the catalog", () => {
    const missing = THEME_IDS.filter((id) => accentBlock(id) === null);
    expect(missing, "themes.ts lists these but globals.css has no block").toEqual(
      [],
    );
  });

  // Regression: `violet` was the only block of 12 without `--chart-2`,
  // so on that accent in dark mode the WhatsApp chart series inherited
  // the neutral-gray mode value and became invisible.
  it("every accent block declares the same token set", () => {
    const sets = new Map<string, Set<string>>();
    for (const id of THEME_IDS) sets.set(id, declared(accentBlock(id)!));

    // violet is the documented copy-source for new themes, so use it as
    // the reference shape.
    const reference = sets.get("violet")!;

    for (const [id, tokens] of sets) {
      const missing = [...reference].filter((t) => !tokens.has(t));
      const extra = [...tokens].filter((t) => !reference.has(t));
      expect(
        { id, missing, extra },
        `Accent "${id}" has a different token set from "violet"`,
      ).toEqual({ id, missing: [], extra: [] });
    }
  });

  it("chart-2 is defined for every theme", () => {
    for (const id of THEME_IDS) {
      expect(declared(accentBlock(id)!), id).toContain("--chart-2");
    }
  });
});

describe("mode token symmetry", () => {
  // The three shadow tokens are light-only by design and are consumed by
  // `html[data-mode="light"] .ds-card`, so they are excluded here.
  const LIGHT_ONLY = new Set([
    "--shadow-card",
    "--shadow-card-hover",
    "--shadow-dropdown",
  ]);

  it("no dark-only token is missing from light", () => {
    const dark = declared(modeDark);
    const light = declared(modeLight);
    const missing = [...dark].filter((t) => !light.has(t) && !LIGHT_ONLY.has(t));
    expect(missing, "defined in dark but not in light").toEqual([]);
  });

  it("no light-only token is missing from dark", () => {
    const dark = declared(modeDark);
    const light = declared(modeLight);
    const missing = [...light].filter(
      (t) => !dark.has(t) && !LIGHT_ONLY.has(t),
    );
    expect(missing, "defined in light but not in dark").toEqual([]);
  });

  // These are the only deliberate light/dark asymmetries. They are
  // consumed exclusively by `html[data-mode="light"] .ds-card*`, and
  // `@theme inline` gives them var() fallbacks, so dark never needs
  // them. Listing them explicitly keeps the symmetry test honest
  // instead of quietly widening.
  it("light-only tokens stay limited to the card shadows", () => {
    const dark = declared(modeDark);
    const light = declared(modeLight);
    const lightOnly = [...light].filter((t) => !dark.has(t));
    expect([...LIGHT_ONLY].sort()).toEqual(lightOnly.sort());
  });
});

describe("dark variant is wired to data-mode", () => {
  // Without this, every `dark:` utility in the app is dead code because
  // the app toggles `data-mode` and never adds a `.dark` class.
  it("declares a custom dark variant matching html[data-mode=\"dark\"]", () => {
    expect(CSS).toMatch(
      /@custom-variant\s+dark\s*\([^)]*data-mode="dark"/,
    );
  });

  it("has no data-mode=\"auto\" block (auto is resolved before paint)", () => {
    // `auto` must never reach the DOM attribute: the boot script and
    // use-theme both resolve it to light/dark via matchMedia, because
    // there is no CSS for [data-mode="auto"] and :root is dark.
    expect(CSS).not.toMatch(/data-mode="auto"/);
  });
});
