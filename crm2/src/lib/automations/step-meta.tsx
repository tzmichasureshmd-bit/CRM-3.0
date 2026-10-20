// ------------------------------------------------------------
// Step catalogue — the single source of truth for every step type.
//
// Previously the builder file carried its own `STEP_META` (icon +
// label + border colour) and its own `ADDABLE_STEPS` array, and the
// add-step menu rendered a flat, undifferentiated list of thirteen
// bare names. Nothing anywhere answered the question a new user
// actually has: "what does this thing do?"
//
// This module is that answer, in one place, so the canvas card, the
// add-step menu, the config panel and the list-page preview can never
// drift apart:
//
//   category  → which group the add-step menu files it under
//   icon      → the glyph shown in the chip
//   hue       → the per-type colour that makes the canvas scannable
//   labelKey  → `Automations.builder.steps.<type>` (existing keys)
//   blurbKey  → `Automations.builder.blurbs.<type>` (one plain sentence)
//
// Colours follow the same system the Flow editor already uses
// (components/flows/shared.tsx): raw oklch hues that complement — but
// never replace — the live --primary accent, with the `text` variant
// blended toward --foreground so a label holds contrast in BOTH light
// and dark mode. Using one system for both builders is deliberate: a
// user who has learned "amber means a fork" in Flows reads the
// Automations canvas the same way.
// ------------------------------------------------------------

import {
  Briefcase,
  CircleSlash,
  FileText,
  GitBranch,
  Hourglass,
  List,
  MessageSquare,
  MousePointerClick,
  PencilLine,
  Tag,
  TagIcon,
  UserCheck,
  Webhook,
  Zap,
} from "lucide-react";

import type { AutomationStepType } from "@/types";

/**
 * Buckets the add-step menu groups types under. The three groups
 * mirror how a non-technical user thinks about a workflow:
 *
 *   messaging → "talk to the customer on WhatsApp"
 *   crm       → "update my CRM data"
 *   flow      → "control what happens next"
 *
 * Order here is the order they render in the menu.
 */
export type StepCategory = "messaging" | "crm" | "flow";

export const STEP_CATEGORIES: { id: StepCategory; labelKey: string }[] = [
  { id: "messaging", labelKey: "categories.messaging" },
  { id: "crm", labelKey: "categories.crm" },
  { id: "flow", labelKey: "categories.flow" },
];

interface StepMetaEntry {
  icon: typeof Zap;
  category: StepCategory;
  /** Per-type hue. See the colour-system note above. */
  hue: { l: number; c: number; h: number };
}

export const STEP_META: Record<AutomationStepType, StepMetaEntry> = {
  send_message: {
    icon: MessageSquare,
    category: "messaging",
    hue: { l: 0.6, c: 0.18, h: 293 }, // violet — the workhorse
  },
  send_buttons: {
    icon: MousePointerClick,
    category: "messaging",
    hue: { l: 0.62, c: 0.16, h: 254 }, // cobalt
  },
  send_list: {
    icon: List,
    category: "messaging",
    hue: { l: 0.62, c: 0.15, h: 277 }, // indigo
  },
  send_template: {
    icon: FileText,
    category: "messaging",
    hue: { l: 0.65, c: 0.12, h: 210 }, // sky
  },
  add_tag: { icon: Tag, category: "crm", hue: { l: 0.65, c: 0.15, h: 350 } },
  remove_tag: {
    icon: TagIcon,
    category: "crm",
    hue: { l: 0.63, c: 0.14, h: 330 },
  },
  assign_conversation: {
    icon: UserCheck,
    category: "crm",
    hue: { l: 0.65, c: 0.17, h: 25 },
  },
  update_contact_field: {
    icon: PencilLine,
    category: "crm",
    hue: { l: 0.65, c: 0.15, h: 185 },
  },
  create_deal: {
    icon: Briefcase,
    category: "crm",
    hue: { l: 0.65, c: 0.15, h: 158 },
  },
  wait: { icon: Hourglass, category: "flow", hue: { l: 0.6, c: 0.04, h: 250 } },
  condition: { icon: GitBranch, category: "flow", hue: { l: 0.72, c: 0.16, h: 75 } },
  send_webhook: {
    icon: Webhook,
    category: "flow",
    hue: { l: 0.65, c: 0.13, h: 200 },
  },
  close_conversation: {
    icon: CircleSlash,
    category: "flow",
    hue: { l: 0.6, c: 0.08, h: 20 },
  },
};

/** Every step type the user can insert, in menu order per category. */
export const ADDABLE_STEPS = Object.keys(STEP_META) as AutomationStepType[];

/**
 * Bucket `types` by category, preserving both the category order and
 * the within-category order of the input. Empty groups are dropped so
 * a filtered search never renders a dangling "AI — nothing here"
 * header.
 */
export function groupStepsByCategory(
  types: AutomationStepType[]
): { id: StepCategory; labelKey: string; types: AutomationStepType[] }[] {
  return STEP_CATEGORIES.map(({ id, labelKey }) => ({
    id,
    labelKey,
    types: types.filter((t) => STEP_META[t].category === id),
  })).filter((g) => g.types.length > 0);
}

export interface StepColors {
  /** Full-strength hue — icon glyph, selection ring, port fill. */
  solid: string;
  /** ~14% tint — icon chip background, soft fills. */
  soft: string;
  /** ~45% tint — hover border, focus ring. */
  ring: string;
  /** Readable in BOTH modes (blended toward --foreground). */
  text: string;
}

export function stepColors(type: AutomationStepType): StepColors {
  const h = STEP_META[type].hue;
  const solid = `oklch(${h.l} ${h.c} ${h.h})`;
  return {
    solid,
    soft: `oklch(${h.l} ${h.c} ${h.h} / 0.14)`,
    ring: `oklch(${h.l} ${h.c} ${h.h} / 0.5)`,
    // Blend the hue toward the live --foreground token: in dark mode
    // --foreground is near-white (label lightens to read on the dark
    // card), in light mode it's near-black (label darkens to read on
    // the white card). A fixed-light value only ever worked on dark.
    text: `color-mix(in oklch, ${solid}, var(--foreground) 38%)`,
  };
}

/** The trigger node's own colour — WhatsApp green, so "start" is
 *  unmistakable on sight. Kept beside the step palette so the two
 *  can be retuned together. */
export const TRIGGER_COLORS: StepColors = {
  solid: "oklch(0.65 0.16 155)",
  soft: "oklch(0.65 0.16 155 / 0.14)",
  ring: "oklch(0.65 0.16 155 / 0.5)",
  text: "color-mix(in oklch, oklch(0.65 0.16 155), var(--foreground) 38%)",
};

/**
 * Short uppercase eyebrow shown above a step's name, so the canvas
 * answers "what KIND of step is this" without reading the name.
 * Conditions and waits are called out separately because they change
 * the SHAPE of the flow, not just what it does.
 */
export type StepEyebrow = "action" | "logic" | "wait";

export function stepEyebrow(type: AutomationStepType): StepEyebrow {
  if (type === "condition") return "logic";
  if (type === "wait") return "wait";
  return "action";
}
