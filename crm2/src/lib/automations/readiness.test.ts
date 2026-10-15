import { describe, expect, it } from "vitest"
import { computeReadiness, stepIssueKeys, triggerIssueKeys } from "./readiness"
import type { BuilderStep } from "./builder-model"

// ------------------------------------------------------------
// Readiness is a promise: whatever this says "ready" for, the
// activation API must accept. It is built on `validate.ts` precisely so
// that can't drift, which makes these tests as much about the
// validator as about the mapping on top of it.
//
// Two failure modes are worth pinning, because both used to happen:
//
//   * reporting a workflow with no steps as ready. The server refuses
//     to activate it, and the badge said the green word
//   * attributing a problem to the wrong card. The canvas is driven by
//     cid, so a per-step pass is the only way a warning can be
//     attached to something clickable
// ------------------------------------------------------------

function step(
  cid: string,
  step_type: BuilderStep["step_type"],
  step_config: Record<string, unknown> = {},
): BuilderStep {
  return { cid, step_type, step_config }
}

function condition(
  cid: string,
  step_config: Record<string, unknown>,
  yes: BuilderStep[] = [],
  no: BuilderStep[] = [],
): BuilderStep {
  return { cid, step_type: "condition", step_config, branches: { yes, no } }
}

const message = (cid = "a") => step(cid, "send_message", { text: "hello" })

describe("computeReadiness — workflow level", () => {
  it("calls an empty workflow not ready", () => {
    // Regression: a trigger-only automation was reported ready, and the
    // server rejects activating it ("active automations need at least
    // one step"). It would also do nothing but write a log row.
    const report = computeReadiness([], "new_message_received", {})
    expect(report.ready).toBe(false)
    expect(report.workflowKeys).toEqual(["noSteps"])
    expect(report.total).toBe(1)
  })

  it("calls a configured workflow with steps ready", () => {
    const report = computeReadiness([message()], "new_message_received", {})
    expect(report.ready).toBe(true)
    expect(report.total).toBe(0)
    expect(report.steps).toEqual([])
    expect(report.workflowKeys).toEqual([])
  })
})

describe("computeReadiness — steps", () => {
  it("flags a step with missing text against its own cid", () => {
    const report = computeReadiness(
      [message("ok"), step("bad", "send_message", { text: "  " })],
      "new_message_received",
      {},
    )
    expect(report.ready).toBe(false)
    expect(report.steps).toEqual([{ cid: "bad", keys: ["text"] }])
    expect(report.total).toBe(1)
  })

  it("reports every missing field of a step separately", () => {
    // Three problems on one card must read as three things to fix, not
    // one vague "invalid" — the panel lists the keys as sentences.
    const report = computeReadiness(
      [step("deal", "create_deal", {})],
      "new_message_received",
      {},
    )
    expect(report.steps[0].keys).toEqual(["pipeline", "stage", "title"])
    expect(report.total).toBe(3)
  })

  it("flags a step nested in a condition branch, by cid", () => {
    // The reason the per-step pass exists: the whole-tree validator
    // reports `steps[0].yes.steps[1]`, which maps to no card at all.
    const report = computeReadiness(
      [
        condition(
          "c1",
          { subject: "status", operand: "open" },
          [message("fine"), step("nested-bad", "add_tag", { tag_id: "" })],
          [step("no-bad", "add_tag", {})],
        ),
      ],
      "new_message_received",
      {},
    )
    const cids = report.steps.map((s) => s.cid).sort()
    expect(cids).toEqual(["nested-bad", "no-bad"])
    expect(report.steps.find((s) => s.cid === "nested-bad")?.keys).toEqual(["tag"])
  })

  it("flags a condition's own fields and its children's separately", () => {
    const report = computeReadiness(
      [condition("c1", { subject: "" }, [step("kid", "add_tag", {})])],
      "new_message_received",
      {},
    )
    expect(report.steps.map((s) => s.cid).sort()).toEqual(["c1", "kid"])
    // Blank subject AND missing operand are two separate problems, and
    // both land on the condition's own card rather than on a child.
    expect(report.steps.find((s) => s.cid === "c1")?.keys).toEqual(["subject", "operand"])
  })

  it("descends two forks deep", () => {
    const report = computeReadiness(
      [
        condition(
          "outer",
          { subject: "a", operand: "b" },
          [condition("inner", { subject: "c", operand: "d" }, [step("deep", "wait", {})])],
        ),
      ],
      "new_message_received",
      {},
    )
    expect(report.steps.map((s) => s.cid)).toEqual(["deep"])
    // A wait with no amount/unit fails both of its rules.
    expect(report.steps[0].keys).toEqual(["amount", "unit"])
  })

  it("flags an unrecognised step type under the generic key", () => {
    // A step type this build doesn't know about can't get a specific
    // sentence, but it must never read as ready.
    const report = computeReadiness(
      [{ cid: "x", step_type: "teleport" as BuilderStep["step_type"], step_config: {} }],
      "new_message_received",
      {},
    )
    expect(report.steps[0].keys).toEqual(["generic"])
    expect(report.ready).toBe(false)
  })

  it("accepts a step type that needs no configuration", () => {
    const report = computeReadiness(
      [step("done", "close_conversation")],
      "new_message_received",
      {},
    )
    expect(report.ready).toBe(true)
  })
})

describe("computeReadiness — trigger", () => {
  it("reports missing trigger configuration", () => {
    const report = computeReadiness([message()], "keyword_match", {})
    expect(report.triggerKeys).toEqual(["triggerKeywords"])
    expect(report.ready).toBe(false)
    expect(report.total).toBe(1)
  })

  it("rejects a keyword list of empty strings", () => {
    // The engine trims before matching, so [""] matches nothing.
    expect(computeReadiness([message()], "keyword_match", { keywords: [""] }).triggerKeys).toEqual(
      ["triggerKeywords"],
    )
  })

  it("accepts a keyword trigger with no explicit match type", () => {
    // "contains" is the runtime default, so a builder that shows the
    // default must not be told it is invalid.
    const report = computeReadiness([message()], "keyword_match", { keywords: ["hi"] })
    expect(report.ready).toBe(true)
  })

  it("counts trigger and step problems together", () => {
    const report = computeReadiness([step("bad", "send_message", {})], "tag_added", {})
    expect(report.triggerKeys).toEqual(["triggerTag"])
    expect(report.steps).toEqual([{ cid: "bad", keys: ["text"] }])
    expect(report.total).toBe(2)
    expect(report.ready).toBe(false)
  })
})

describe("key mapping", () => {
  it("maps trigger issue paths to keys, de-duplicated", () => {
    expect(
      triggerIssueKeys([
        { path: "trigger.keywords", message: "a" },
        { path: "trigger.keywords", message: "b" },
        { path: "trigger.somethingNew", message: "c" },
      ]),
    ).toEqual(["triggerKeywords", "triggerGeneric"])
  })

  it("maps an interactive payload failure to the interactive key", () => {
    expect(stepIssueKeys(step("b", "send_buttons", {}))).toEqual(["interactive"])
  })

  it("returns an empty array for a valid step, so callers can read .length", () => {
    expect(stepIssueKeys(message())).toEqual([])
  })
})
