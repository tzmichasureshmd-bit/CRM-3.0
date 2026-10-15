import type { Deal, FollowUp, PipelineStage } from "@/types";
import type { LeadStatus } from "@/lib/crm/lead-status";

/**
 * CRM lead-management helpers — single source of truth for the /crm
 * dashboard's stage→progress mapping, lead-status sync with `contacts`,
 * "needs attention" classification, and the compact formatting used by
 * the lead cards.
 *
 * Design: the CRM tab is NOT a parallel pipeline. It renders the
 * existing `deals` / `pipeline_stages` data (see /pipelines), so no
 * stage list here would ever go stale — stages come straight from the
 * selected pipeline. Below "milestones" are just the well-known stage
 * names matched lazily so a stage like "New Lead" gets the familiar
 * 0% / 20% / 35% … progression while still honouring the user's actual
 * pipeline (rename a stage and the fixed mapping no longer applies —
 * position-based interpolation takes over).
 */

/** The canonical lead journey (used for progress + status sync). */
export type LeadProgression =
  | "new"
  | "contacted"
  | "engaged"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

/**
 * Configurable stage → progress %. This is THE knob to turn when the
 * business wants a different fit: a stage whose (case-insensitive, trimmed)
 * name matches a milestone below is shown at exactly these percentages.
 * Every other stage interpolates by position between the matching anchors,
 * and Won/Lost are always 100% / 0%.
 */
export const DEFAULT_STAGE_PROGRESS: Record<LeadProgression, number> = {
  new: 0,
  contacted: 20,
  engaged: 35,
  qualified: 50,
  proposal: 65,
  negotiation: 80,
  won: 100,
  lost: 0,
};

const MILESTONE_MATCHERS: Array<[LeadProgression, RegExp]> = [
  ["won", /^won|won$/],
  ["lost", /^lost|lost$/],
  ["new", /^new|new lead/],
  ["negotiation", /negotiat/],
  ["proposal", /proposal|propos/],
  ["qualified", /qualif/],
  ["engaged", /engage/],
  ["contacted", /contact/],
];

/** Map a DB stage to the milestone it represents, or null. */
export function stageMilestone(
  stage: Pick<PipelineStage, "name">,
): LeadProgression | null {
  const n = stage.name.trim().toLowerCase();
  if (!n) return null;
  for (const [milestone, re] of MILESTONE_MATCHERS) {
    if (re.test(n)) return milestone;
  }
  return null;
}

/**
 * Progress % for a stage within its pipeline. Won = 100, Lost = 0 and a
 * lookup in DEFAULT_STAGE_PROGRESS when the stage matches a known
 * milestone; everything else interpolates linearly by sorted position
 * across the active (non-Won/Lost) stages.
 */
export function stageProgress(
  stage: PipelineStage,
  sortedStages: PipelineStage[],
): number {
  const milestone = stageMilestone(stage);
  if (milestone === "won") return DEFAULT_STAGE_PROGRESS.won;
  if (milestone === "lost") return DEFAULT_STAGE_PROGRESS.lost;
  if (milestone && DEFAULT_STAGE_PROGRESS[milestone] !== undefined) {
    return DEFAULT_STAGE_PROGRESS[milestone];
  }

  const active = sortedStages.filter((s) => {
    const m = stageMilestone(s);
    return m !== "won" && m !== "lost";
  });
  const idx = active.findIndex((s) => s.id === stage.id);
  if (idx < 0 || active.length <= 1) return 0;
  return Math.round((idx / (active.length - 1)) * 100);
}

/**
 * `contacts.lead_status` the deal stage maps to (or null when the stage
 * carries no milestone to guess from). Shared vocabulary lives in
 * `@/lib/crm/lead-status`.
 */
export function leadStatusForMilestone(
  m: LeadProgression | null,
): LeadStatus | null {
  if (m === null) return null;
  switch (m) {
    case "new":
      return "new";
    case "contacted":
    case "engaged":
      return "contacted";
    case "qualified":
      return "qualified";
    case "proposal":
      return "proposal";
    case "negotiation":
      return "negotiation";
    case "won":
      return "won";
    case "lost":
      return "lost";
    default:
      return null;
  }
}

/** The milestone for a deal's current stage, or null. */
export function dealProgression(
  deal: Deal,
  sortedStages: PipelineStage[],
): LeadProgression | null {
  const stage = sortedStages.find((s) => s.id === deal.stage_id);
  return stage ? stageMilestone(stage) : null;
}

/**
 * The `lead_status` the deal's contact should carry for its current
 * stage, or null when the stage has no milestone (nothing to sync to).
 */
export function leadStatusForDeal(
  deal: Deal,
  sortedStages: PipelineStage[],
): LeadStatus | null {
  const progression = dealProgression(deal, sortedStages);
  return progression ? leadStatusForMilestone(progression) : null;
}

/** Deal value, per-stage progress — used by the board's weighted totals. */
export const MS_PER_DAY = 86_400_000;

export function stageIndex(stageId: string, sortedStages: PipelineStage[]): number {
  return sortedStages.findIndex((s) => s.id === stageId);
}

// ---------------------------------------------------------------
// Formatting helpers (kept tiny — used on cards, table, banner)
// ---------------------------------------------------------------

export function relativeTime(
  iso?: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = now.getTime() - t;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function isPast(iso?: string | null, now: Date = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t < now.getTime();
}

export function shortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function initials(name?: string | null, fallback?: string | null): string {
  const source = (name || fallback || "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

// ---------------------------------------------------------------
// Lead score tier (cold / warm / hot)
// ---------------------------------------------------------------

export function scoreTone(score?: number | null): {
  label: string;
  className: string;
} {
  if (score == null) {
    return { label: "—", className: "bg-muted text-muted-foreground border-border" };
  }
  if (score >= 70) {
    return {
      label: "Hot",
      className: "bg-red-500/15 text-red-400 border-red-500/30",
    };
  }
  if (score >= 40) {
    return {
      label: "Warm",
      className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    };
  }
  return {
    label: "Cold",
    className: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  };
}

// ---------------------------------------------------------------
// Contact source badge (mirrors the Contacts page styling)
// ---------------------------------------------------------------

export const SOURCE_BADGE_STYLES: Record<string, string> = {
  facebook: "bg-blue-950/40 text-blue-300 border-blue-700/50",
  instagram: "bg-pink-950/40 text-pink-300 border-pink-700/50",
  whatsapp: "bg-emerald-950/40 text-emerald-300 border-emerald-700/50",
  website: "bg-violet-950/40 text-violet-300 border-violet-700/50",
  manual: "bg-slate-950/40 text-slate-300 border-slate-700/50",
  google_form: "bg-amber-950/40 text-amber-300 border-amber-700/50",
  meta: "bg-primary/10 text-primary border-primary/30",
};

function resolveSourceKey(
  source?: string | null,
  sourcePlatform?: string | null,
): string | null {
  if (sourcePlatform === "facebook") return "facebook";
  if (sourcePlatform === "instagram") return "instagram";
  const s = (source ?? "").toLowerCase();
  if (s.includes("google")) return "google_form";
  if (s.includes("facebook")) return "facebook";
  if (s.includes("instagram")) return "instagram";
  if (s.includes("whatsapp")) return "whatsapp";
  if (s.includes("website") || s.includes("web")) return "website";
  if (s.includes("manual")) return "manual";
  if (s === "meta" || s.includes("lead ads")) return "meta";
  return null;
}

export function sourceBadgeInfo(
  source?: string | null,
  sourcePlatform?: string | null,
): { key: string; label: string; className: string } | null {
  const key = resolveSourceKey(source, sourcePlatform);
  if (!key) return null;
  const label =
    key === "facebook"
      ? "Facebook"
      : key === "instagram"
        ? "Instagram"
        : key === "whatsapp"
          ? "WhatsApp"
          : key === "google_form"
            ? "Google Form"
            : key === "website"
              ? "Website"
              : key === "manual"
                ? "Manual"
                : "Meta";
  return {
    key,
    label,
    className: SOURCE_BADGE_STYLES[key] ?? SOURCE_BADGE_STYLES.meta,
  };
}

// ---------------------------------------------------------------
// WhatsApp deep link (external fallback when no inbox conversation)
// ---------------------------------------------------------------

export function waLink(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}`;
}

// ---------------------------------------------------------------
// "Needs Attention" classification
// ---------------------------------------------------------------

export type AttentionKind = "overdue_follow_up" | "silent" | "no_activity";

export interface AttentionItem {
  deal: Deal;
  kind: AttentionKind;
  followUp?: FollowUp;
  /** Overdue days (follow-up) or days since last reply / since creation. */
  days: number;
}

/**
 * Ranks open deals that need a human right now:
 *  1. pending follow-up whose due date is in the past,
 *  2. customers we last heard from 5+ days ago (silent),
 *  3. untouched deals older than 7 days with no customer reply (no activity).
 * Won/Lost deals are excluded. Sorted by urgency.
 */
export function attentionItems(
  deals: Deal[],
  followUps: FollowUp[],
  now: Date = new Date(),
): AttentionItem[] {
  const followUpByContact = new Map<string, FollowUp>();
  for (const f of followUps) {
    if (f.status !== "pending" || !f.due_date) continue;
    if (!followUpByContact.has(f.contact_id)) {
      followUpByContact.set(f.contact_id, f);
    }
  }

  const items: AttentionItem[] = [];
  for (const deal of deals) {
    if (deal.status === "won" || deal.status === "lost") continue;
    if (!deal.contact) continue;
    const contact = deal.contact;

    const fu = followUpByContact.get(contact.id);
    if (fu && fu.due_date) {
      const diff = Math.floor(
        (now.getTime() - new Date(fu.due_date).getTime()) / MS_PER_DAY,
      );
      if (diff >= 0) {
        items.push({ deal, kind: "overdue_follow_up", followUp: fu, days: diff });
        continue;
      }
    }

    const age = Math.floor(
      (now.getTime() - new Date(deal.created_at).getTime()) / MS_PER_DAY,
    );
    const lastReply = contact.last_customer_reply_at
      ? new Date(contact.last_customer_reply_at)
      : null;
    if (!lastReply) {
      if (age >= 7) items.push({ deal, kind: "no_activity", days: age });
    } else {
      const silent = Math.floor(
        (now.getTime() - lastReply.getTime()) / MS_PER_DAY,
      );
      if (silent >= 5) items.push({ deal, kind: "silent", days: silent });
    }
  }

  const weight: Record<AttentionKind, number> = {
    overdue_follow_up: 0,
    silent: 1,
    no_activity: 2,
  };
  return items.sort(
    (a, b) => weight[a.kind] - weight[b.kind] || b.days - a.days,
  );
}