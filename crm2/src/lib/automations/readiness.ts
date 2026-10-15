import type { AutomationTriggerType } from "@/types";
import type { BuilderStep } from "./builder-model";
import {
  validateStepsForActivation,
  validateTriggerForActivation,
  type ValidationIssue,
} from "./validate";

// ------------------------------------------------------------
// Activation readiness, as data.
//
// The rules themselves are NOT reimplemented here — they come from
// `validate.ts`, the exact module the activation API runs, so a
// workflow this calls "ready" can never be rejected by the server and
// one it calls "not ready" can never be activated. What this file adds
// is the part the old builder lacked: turning those issues into
// something the canvas and the config panel can render BEFORE the
// user presses Activate.
//
// The only translation is message -> i18n key. `validate.ts` speaks
// English because it is also used server-side; showing its raw
// `message` in a Korean UI was the one place a translated surface
// leaked English. `path` ends in a stable field name
// (`steps[0].branches` traversal aside, the suffix is always
// `.text`, `.tag_id`, `.url`, ...), which is all we need to look up a
// localised sentence — with a generic fallback for anything new, so
// adding a validation rule can never crash the panel.
// ------------------------------------------------------------

/** Trailing field name on an issue path -> `Automations.readiness.*` key. */
const STEP_FIELD_KEYS: Record<string, string> = {
  text: "text",
  interactive: "interactive",
  template_name: "template",
  tag_id: "tag",
  agent_id: "agent",
  field: "field",
  value: "value",
  pipeline_id: "pipeline",
  stage_id: "stage",
  title: "title",
  amount: "amount",
  unit: "unit",
  subject: "subject",
  operand: "operand",
  url: "url",
};

const TRIGGER_FIELD_KEYS: Record<string, string> = {
  keywords: "triggerKeywords",
  match_type: "triggerMatchType",
  schedule: "triggerSchedule",
  tag_id: "triggerTag",
  reply_ids: "triggerReplyIds",
};

function suffixOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? path : path.slice(dot + 1);
}

function keysForStepIssues(issues: ValidationIssue[]): string[] {
  const keys: string[] = [];
  for (const issue of issues) {
    const key = STEP_FIELD_KEYS[suffixOf(issue.path)] ?? "generic";
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function triggerIssueKeys(issues: ValidationIssue[]): string[] {
  const keys: string[] = [];
  for (const issue of issues) {
    const key = TRIGGER_FIELD_KEYS[suffixOf(issue.path)] ?? "triggerGeneric";
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

export interface StepReadiness {
  cid: string;
  /** `Automations.readiness.*` keys, in field order. */
  keys: string[];
}

export interface ReadinessReport {
  /** Empty when the trigger is fully configured. */
  triggerKeys: string[];
  /** Problems that belong to no single step, e.g. an empty workflow. */
  workflowKeys: string[];
  /** Only steps that have at least one problem. */
  steps: StepReadiness[];
  /** True when a live workflow would activate as-is. */
  ready: boolean;
  /** Total outstanding problems across the workflow, trigger and steps. */
  total: number;
}

/**
 * Runs each step through the activation validator IN ISOLATION.
 *
 * `validateStepsForActivation` walks conditions' branches internally and
 * reports a `steps[i]`-style index path that says nothing about which
 * card the user is looking at, so it cannot drive per-card warnings.
 * Validating one step at a time yields the same rules with an index
 * that maps to a real `cid` — which is what the readiness bar needs in
 * order to say "3 steps need attention" and let the user jump to one.
 *
 * A step nested inside a condition's branch is validated the same way
 * as a top-level one, because the engine treats a branch exactly like
 * the main line: it runs when the parent condition resolves that way.
 */
export function stepReadiness(step: BuilderStep): StepReadiness | null {
  const keys = keysForStepIssues(
    validateStepsForActivation([
      { step_type: step.step_type, step_config: step.step_config ?? {} },
    ]),
  );
  return keys.length > 0 ? { cid: step.cid, keys } : null;
}

export function computeReadiness(
  steps: BuilderStep[],
  triggerType: AutomationTriggerType,
  triggerConfig: Record<string, unknown>,
): ReadinessReport {
  const triggerKeys = triggerIssueKeys(
    validateTriggerForActivation(triggerType, triggerConfig),
  );

  const flagged: StepReadiness[] = [];
  const visit = (line: BuilderStep[]) => {
    for (const step of line) {
      const result = stepReadiness(step);
      if (result) flagged.push(result);
      if (step.step_type === "condition" && step.branches) {
        visit(step.branches.yes ?? []);
        visit(step.branches.no ?? []);
      }
    }
  };
  visit(steps);

  // The whole-tree pass exists for the problems the per-step walk cannot
  // express, which today means exactly one: an automation with no steps
  // at all. The server rejects activating it ("active automations need
  // at least one step") and a trigger-only workflow does nothing but
  // burn a log row every time it fires, so reporting it as ready would
  // be the one lie this panel is not allowed to tell. A step-attributed
  // issue is skipped here — `visit` above already covers those, by cid.
  const workflowKeys: string[] = [];
  for (const issue of validateStepsForActivation(
    steps.map((s) => ({ step_type: s.step_type, step_config: s.step_config ?? {} })),
  )) {
    if (issue.path.includes("[")) continue;
    const key = issue.path === "steps" ? "noSteps" : "generic";
    if (!workflowKeys.includes(key)) workflowKeys.push(key);
  }

  const total =
    triggerKeys.length +
    workflowKeys.length +
    flagged.reduce((n, s) => n + s.keys.length, 0);
  return { triggerKeys, workflowKeys, steps: flagged, ready: total === 0, total };
}

/** The step's own readiness, for the config panel's inline warning.
 *  Always an array so callers can render `.length` without a guard. */
export function stepIssueKeys(step: BuilderStep): string[] {
  return stepReadiness(step)?.keys ?? [];
}
