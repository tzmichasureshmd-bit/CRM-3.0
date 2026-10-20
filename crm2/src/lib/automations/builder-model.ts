// ------------------------------------------------------------
// The builder's data layer: the in-memory step tree, its defaults,
// and the two conversions that bridge it to the API.
//
// This used to live inside automation-builder.tsx, which meant the
// pages (`/automations/new`, `/automations/[id]/edit`) and the
// builder's own presentational children all had to import the whole
// 1500-line component just to reach a type or `toApiSteps`. Pulling
// the data layer out lets the canvas, the add-step menu and the config
// panel depend on shapes rather than on the orchestrator.
//
// Nothing about the wire format changed: `toApiSteps` and
// `fromServerSteps` are the same two functions, moved. automation-builder
// re-exports them so existing imports keep working.
// ------------------------------------------------------------

import type {
  AutomationStepType,
  AutomationTriggerType,
  InteractiveMessagePayload,
} from "@/types";
import {
  blankButtonsPayload,
  blankListPayload,
} from "@/components/interactive/interactive-builder";

/**
 * A step as the builder holds it: a `cid` the UI can address, the
 * server's `step_type` / `step_config` verbatim, and — for a
 * `condition` — its two child lists. The cid is client-only; the API
 * assigns real UUIDs server-side.
 */
export interface BuilderStep {
  /** Client id; the API assigns real UUIDs server-side. */
  cid: string;
  step_type: AutomationStepType;
  step_config: Record<string, unknown>;
  branches?: { yes: BuilderStep[]; no: BuilderStep[] };
}

export interface BuilderInitial {
  id?: string;
  name: string;
  description: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  steps: BuilderStep[];
}

export function cid(): string {
  return (
    "c_" +
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36))
  );
}

// The send_buttons / send_list step_config IS an InteractiveMessagePayload,
// but step_config is typed generically as Record<string, unknown>. These two
// helpers hold the single unavoidable structural cast in one place so a
// payload-shape change has one seam to update instead of four scattered
// `as unknown as` sites.
export function toStepConfig(p: unknown): Record<string, unknown> {
  return p as Record<string, unknown>;
}

export function asInteractive(
  cfg: Record<string, unknown>
): InteractiveMessagePayload {
  return cfg as unknown as InteractiveMessagePayload;
}

/** A brand-new step's default config, matching what the engine expects. */
export function blankConfig(type: AutomationStepType): Record<string, unknown> {
  switch (type) {
    case "send_message":
      return { text: "" };
    case "send_buttons":
      return toStepConfig(blankButtonsPayload());
    case "send_list":
      return toStepConfig(blankListPayload());
    case "send_template":
      return { template_name: "", language: "en_US" };
    case "add_tag":
    case "remove_tag":
      return { tag_id: "" };
    case "assign_conversation":
      return { mode: "round_robin" };
    case "update_contact_field":
      return { field: "name", value: "" };
    case "create_deal":
      return { pipeline_id: "", stage_id: "", title: "", value: 0 };
    case "wait":
      return { amount: 1, unit: "hours" };
    case "condition":
      return { subject: "tag_presence", operand: "", value: "" };
    case "send_webhook":
      return { url: "", headers: {}, body_template: "" };
    case "close_conversation":
      return {};
    default:
      return {};
  }
}

/** A fresh step of `type`, with a condition's two branch lists ready. */
export function makeStep(type: AutomationStepType): BuilderStep {
  return {
    cid: cid(),
    step_type: type,
    step_config: blankConfig(type),
    branches: type === "condition" ? { yes: [], no: [] } : undefined,
  };
}

/**
 * Structural deep copy that re-mints every cid. Used by "Duplicate":
 * a copy has to be a genuinely separate node, because the builder
 * addresses steps by cid and two steps sharing one would leave the
 * second unselectable, undraggable and unaddressable.
 */
export function cloneStep(step: BuilderStep): BuilderStep {
  return {
    cid: cid(),
    step_type: step.step_type,
    // Structured clone would be ideal but isn't available in every
    // runtime this file has to load in; a JSON round-trip is exact for
    // these configs, which are plain JSON all the way to Postgres.
    step_config: JSON.parse(JSON.stringify(step.step_config)) as Record<
      string,
      unknown
    >,
    branches: step.branches
      ? {
          yes: step.branches.yes.map(cloneStep),
          no: step.branches.no.map(cloneStep),
        }
      : undefined,
  };
}

// ------------------------------------------------------------
// Serialize builder tree → API payload (flattened shape)
// ------------------------------------------------------------

export interface ApiStep {
  step_type: string;
  step_config: Record<string, unknown>;
  branches?: { yes?: ApiStep[]; no?: ApiStep[] };
}

export function toApiSteps(steps: BuilderStep[]): ApiStep[] {
  return steps.map((s) => ({
    step_type: s.step_type,
    step_config: s.step_config,
    branches: s.branches
      ? { yes: toApiSteps(s.branches.yes), no: toApiSteps(s.branches.no) }
      : undefined,
  }));
}

/**
 * Convert server-returned step tree (from loadStepsTree) into the
 * builder-local shape with fresh client ids.
 */
export interface ServerStepNode {
  id: string;
  step_type: string;
  step_config: Record<string, unknown>
  branches: { yes: ServerStepNode[]; no: ServerStepNode[] }
}

export function fromServerSteps(nodes: ServerStepNode[]): BuilderStep[] {
  return nodes.map((n) => ({
    cid: cid(),
    step_type: n.step_type as AutomationStepType,
    step_config: n.step_config ?? {},
    branches:
      n.step_type === "condition"
        ? {
            yes: fromServerSteps(n.branches?.yes ?? []),
            no: fromServerSteps(n.branches?.no ?? []),
          }
        : undefined,
  }));
}
