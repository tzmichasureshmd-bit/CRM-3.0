import type { ComponentType, CSSProperties } from "react";
import type { useTranslations } from "next-intl";

import { asInteractive, type BuilderStep } from "@/lib/automations/builder-model";
import { interactivePayloadPreviewText } from "@/lib/whatsapp/interactive";
import { validateStepsForActivation } from "@/lib/automations/validate";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useTranslations>;

// ------------------------------------------------------------
// Turning a step into a sentence a non-technical user can read.
//
// A canvas card has ~90px to say "what does this step actually do with
// my configuration". The old preview answered with the raw value
// (`when tag_presence`, `no text yet`, a bare number for wait), which
// is the vocabulary of the code, not of the workflow. These summaries
// name the things instead: the tag it resolved to, the number of
// minutes, the deal stage.
//
// The lookups are passed in rather than read here because a step config
// stores ids and only the client knows the names — resolving those is
// the resources provider's job, and this module stays pure so it can be
// unit-tested and reused by the list-page preview.
// ------------------------------------------------------------

/** id → display name, for the account resources a step can reference. */
export interface StepLookups {
  tagName: (id: string) => string | null;
  agentName: (id: string) => string | null;
  pipelineName: (id: string) => string | null;
  stageName: (id: string) => string | null;
}

export const EMPTY_LOOKUPS: StepLookups = {
  tagName: () => null,
  agentName: () => null,
  pipelineName: () => null,
  stageName: () => null,
};

export interface StepSummary {
  /** The one line of prose under the step's name. */
  text: string;
  /**
   * False when the step is still missing something the engine will
   * reject at activation. Drives the amber "needs setup" marker, so a
   * half-built workflow looks half-built instead of silently failing
   * on its first live run.
   */
  configured: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Clamp to one line. The card truncates too, but this keeps the copy
 *  in the DOM title attribute honest for truncated text. */
function oneLine(s: string, max = 90): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/** Shown when a step has been added but not configured yet. */
function notYet(t: T, key: string): StepSummary {
  return { text: t(`summaries.notSet.${key}`), configured: false };
}

/** A saved id whose record has since been deleted. Showing a truncated
 *  id is honest — better than pretending the step is configured with
 *  something the user never chose. */
function goneName(t: T, id: string): string {
  return t("summaries.unavailable", { id: id.slice(0, 8) });
}

export function summarizeStep(
  step: BuilderStep,
  t: T,
  lookups: StepLookups = EMPTY_LOOKUPS
): StepSummary {
  const cfg = step.step_config ?? {};

  switch (step.step_type) {
    case "send_message": {
      const text = str(cfg.text);
      return text ? { text: oneLine(`“${text}”`), configured: true } : notYet(t, "text");
    }

    case "send_buttons":
    case "send_list": {
      const preview = interactivePayloadPreviewText(asInteractive(cfg));
      return preview
        ? { text: oneLine(preview), configured: true }
        : notYet(t, "message");
    }

    case "send_template": {
      const name = str(cfg.template_name);
      if (!name) return notYet(t, "template");
      const lang = str(cfg.language);
      return {
        text: oneLine(
          lang
            ? t("summaries.template.withLanguage", { name, lang })
            : t("summaries.template.nameOnly", { name })
        ),
        configured: true,
      };
    }

    case "add_tag":
    case "remove_tag": {
      const id = str(cfg.tag_id);
      if (!id) return notYet(t, "tag");
      return {
        text: oneLine(
          t(step.step_type === "add_tag" ? "summaries.addTag" : "summaries.removeTag", {
            tag: lookups.tagName(id) ?? goneName(t, id),
          })
        ),
        configured: true,
      };
    }

    case "assign_conversation": {
      if (str(cfg.mode) !== "specific") {
        return { text: t("summaries.roundRobin"), configured: true };
      }
      const id = str(cfg.agent_id);
      if (!id) return notYet(t, "agent");
      return {
        text: oneLine(
          t("summaries.assignTo", { agent: lookups.agentName(id) ?? goneName(t, id) })
        ),
        configured: true,
      };
    }

    case "update_contact_field": {
      const field = str(cfg.field);
      const value = str(cfg.value);
      if (!field || !value) return notYet(t, "field");
      return {
        text: oneLine(
          t("summaries.setField", {
            field: field.startsWith("custom:")
              ? field.slice("custom:".length)
              : t(`fields.${field}`, { defaultValue: field }),
            value,
          })
        ),
        configured: true,
      };
    }

    case "create_deal": {
      const title = str(cfg.title);
      const stageId = str(cfg.stage_id);
      if (!str(cfg.pipeline_id) || !stageId || !title) return notYet(t, "deal");
      const stage = lookups.stageName(stageId) ?? goneName(t, stageId);
      const pipeline = lookups.pipelineName(str(cfg.pipeline_id));
      return {
        text: oneLine(
          pipeline
            ? t("summaries.createDealWith", { title, stage, pipeline })
            : t("summaries.createDeal", { title, stage })
        ),
        configured: true,
      };
    }

    case "wait": {
      const amount = Number(cfg.amount);
      const unit = str(cfg.unit);
      if (!Number.isFinite(amount) || amount <= 0 || !unit) return notYet(t, "duration");
      // Dedicated keys rather than `config.units.*` so the count
      // pluralises ("1 day" / "3 days") and reads as a sentence.
      const label = t(`summaries.wait.${unit}`, { count: amount });
      return { text: t("summaries.pauseFor", { count: amount, unit: label }), configured: true };
    }

    case "condition": {
      const subject = str(cfg.subject) || "tag_presence";
      const operand = str(cfg.operand);
      if (!operand) return notYet(t, "rule");
      return {
        text: oneLine(
          t("summaries.ifRule", {
            subject: t(`config.subjects.${subject}`),
            operand,
            value: str(cfg.value),
          })
        ),
        configured: true,
      };
    }

    case "send_webhook": {
      const url = str(cfg.url);
      return url ? { text: oneLine(url, 60), configured: true } : notYet(t, "url");
    }

    case "close_conversation":
      return { text: t("summaries.closeConversation"), configured: true };

    default:
      return { text: "", configured: true };
  }
}

// ------------------------------------------------------------
// Activation readiness.
//
// The API already refuses to activate a workflow with missing config
// (lib/automations/validate.ts) and returns the reason. This runs the
// SAME rules client-side so the builder can point at the problem while
// the user is still looking at the step, instead of after a failed
// save. It is a preview, never a gate: the server's answer still
// decides, and nothing here changes what is sent.
// ------------------------------------------------------------

/**
 * This step's own activation problems, ignoring the steps nested in
 * its branches. Validated in isolation, so the `path` on each issue
 * describes a throwaway one-element array — only `message` is ever
 * displayed.
 */
export function stepIssues(step: BuilderStep): { path: string; message: string }[] {
  return validateStepsForActivation([
    { step_type: step.step_type, step_config: step.step_config ?? {} },
  ]);
}

// ------------------------------------------------------------
// Trigger summary — the sentence under the trigger's name, shared by
// the canvas trigger node and the list page.
// ------------------------------------------------------------

/**
 * The trigger's configuration, as a sentence.
 *
 * `config` is `unknown` rather than `Record<string, unknown>` because
 * the `Automation` row types `trigger_config` as a union of the
 * per-trigger config interfaces, none of which carry an index
 * signature. The fields are read defensively either way — a trigger
 * row can hold a shape this build doesn't know about, and the sentence
 * must degrade to "add a keyword" rather than throw on a page render.
 */
export function describeTrigger(
  triggerType: string,
  config: unknown,
  t: T,
  lookups?: StepLookups
): string {
  const cfg = (config ?? {}) as Record<string, unknown>;
  const words = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  switch (triggerType) {
    case "keyword_match": {
      const k = words(cfg.keywords);
      return k.length > 0
        ? t("summaries.triggerKeywords", { words: k.join(", ") })
        : t("summaries.triggerNeedsKeywords");
    }
    case "tag_added": {
      const id = str(cfg.tag_id);
      if (!id) return t("summaries.triggerNeedsTag");
      return t("summaries.triggerTag", { tag: lookups?.tagName(id) ?? goneName(t, id) });
    }
    case "interactive_reply": {
      const ids = words(cfg.reply_ids);
      return ids.length > 0
        ? t("summaries.triggerReplyIds", { ids: ids.join(", ") })
        : t("summaries.triggerNeedsReplyIds");
    }
    case "time_based": {
      const schedule = str(cfg.schedule);
      return schedule
        ? t("summaries.triggerSchedule", { schedule })
        : t("summaries.triggerNeedsSchedule");
    }
    default:
      // Every remaining trigger needs no configuration, so its
      // catalogue hint is the whole story.
      return t(`triggers.${triggerType}.hint`);
  }
}

// ------------------------------------------------------------
// The coloured icon chip, shared by the step card, the add-step menu
// and the config panel header so one type always looks the same.
// ------------------------------------------------------------

export function StepIconChip({
  icon: Icon,
  solid,
  soft,
  size = 32,
  iconSize = 16,
  className,
}: {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  solid: string;
  soft: string;
  size?: number;
  iconSize?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-lg", className)}
      style={{ width: size, height: size, background: soft, color: solid }}
    >
      {/* Inline sizing, deliberately: the add-step menu lives inside
          DropdownMenuItem, whose `[&_svg:not([class*=size-])]:size-4`
          utility would otherwise force every glyph to 16px. */}
      <Icon className="shrink-0" style={{ width: iconSize, height: iconSize }} />
    </span>
  );
}
