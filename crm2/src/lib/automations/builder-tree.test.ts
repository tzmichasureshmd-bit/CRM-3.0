import { describe, expect, it } from "vitest"
import {
  childPath,
  containsCid,
  duplicateInScope,
  findCidLocation,
  getInScope,
  insertAt,
  mapAtPath,
  moveAt,
  moveInScope,
  moveToScope,
  removeAt,
  removeInScope,
  updateInScope,
  type ParentScope,
  type StepPath,
} from "./builder-tree"

interface TestStep {
  cid: string
  step_type: string
  step_config: Record<string, unknown>
  branches?: { yes: TestStep[]; no: TestStep[] }
}

function step(cid: string, step_type = "send_message"): TestStep {
  return { cid, step_type, step_config: {}, branches: undefined }
}

function cond(cid: string, yes: TestStep[] = [], no: TestStep[] = []): TestStep {
  return { cid, step_type: "condition", step_config: {}, branches: { yes, no } }
}

describe("childPath", () => {
  it("addresses root steps with a single root marker", () => {
    expect(childPath([], { kind: "root" }, 2)).toEqual([{ kind: "root", index: 2 }])
  })

  it("addresses branch children relative to the owning condition", () => {
    const condPath: StepPath = [{ kind: "root", index: 0 }]
    const path = childPath(
      condPath,
      { kind: "branch", parentCid: "c1", branch: "yes" },
      1,
    )
    // Exactly one marker per level — the second-child marker must not
    // double up on the branch marker (issue #474).
    expect(path).toEqual([
      { kind: "root", index: 0 },
      { kind: "branch", branch: "yes", index: 1 },
    ])
  })
})

describe("insertAt", () => {
  it("inserts into the root list at the requested index", () => {
    const steps = [step("a"), step("b")]
    const next = insertAt(steps, { kind: "root" }, 1, step("x"))
    expect(next.map((s) => s.cid)).toEqual(["a", "x", "b"])
  })

  it("inserts into a condition branch by cid", () => {
    const steps = [cond("c1", [step("a")])]
    const next = insertAt(
      steps,
      { kind: "branch", parentCid: "c1", branch: "no" },
      0,
      step("x"),
    )
    expect(next[0].branches?.yes.map((s) => s.cid)).toEqual(["a"])
    expect(next[0].branches?.no.map((s) => s.cid)).toEqual(["x"])
  })

  it("finds a condition nested inside another condition's branch", () => {
    const steps = [cond("outer", [cond("inner", [step("a")])])]
    const next = insertAt(
      steps,
      { kind: "branch", parentCid: "inner", branch: "yes" },
      1,
      step("x"),
    )
    const outerYes = next[0].branches?.yes ?? []
    expect(outerYes[0].branches?.yes.map((s) => s.cid)).toEqual(["a", "x"])
  })
})

describe("mapAtPath", () => {
  it("updates a root step", () => {
    const steps = [step("a"), step("b"), step("c")]
    const path = childPath([], { kind: "root" }, 1)
    const next = mapAtPath(steps, path, (s) => ({
      ...s,
      step_config: { text: "edited" },
    }))
    expect(next[0].cid).toBe("a")
    expect(next[1].step_config).toEqual({ text: "edited" })
    expect(next[1].cid).toBe("b")
    expect(next[2].cid).toBe("c")
  })

  it("updates a step inside a condition branch — the not-first child", () => {
    // Regression for issue #474: the old path model consumed an extra
    // branch marker and edited the FIRST child (or nothing) instead of
    // the requested child.
    const steps = [cond("c1", [step("first"), step("second")])]
    const condPath = childPath([], { kind: "root" }, 0)
    const secondPath = childPath(
      condPath,
      { kind: "branch", parentCid: "c1", branch: "yes" },
      1,
    )
    const next = mapAtPath(steps, secondPath, (s) => ({
      ...s,
      step_config: { text: "edited" },
    }))

    const yes = next[0].branches?.yes ?? []
    expect(yes[0].step_config).toEqual({}) // first child untouched
    expect(yes[0].cid).toBe("first")
    expect(yes[1].cid).toBe("second")
    expect(yes[1].step_config).toEqual({ text: "edited" })
  })

  it("updates a step inside a nested condition's branch", () => {
    const steps = [cond("outer", [cond("inner", [step("a"), step("b")])])]
    const outerCondPath = childPath([], { kind: "root" }, 0)
    const innerPath = childPath(
      outerCondPath,
      { kind: "branch", parentCid: "outer", branch: "yes" },
      0,
    )
    const bPath = childPath(
      innerPath,
      { kind: "branch", parentCid: "inner", branch: "yes" },
      1,
    )
    const next = mapAtPath(steps, bPath, (s) => ({
      ...s,
      step_config: { text: "edited" },
    }))

    const innerCond = next[0].branches?.yes?.[0]
    expect(innerCond?.branches?.yes[0].cid).toBe("a")
    expect(innerCond?.branches?.yes[0].step_config).toEqual({}) // untouched
    expect(innerCond?.branches?.yes[1].cid).toBe("b")
    expect(innerCond?.branches?.yes[1].step_config).toEqual({ text: "edited" })
  })
})

describe("removeAt", () => {
  it("removes a branch child at the addressed index", () => {
    const steps = [cond("c1", [step("a"), step("b"), step("c")])]
    const condPath = childPath([], { kind: "root" }, 0)
    const path = childPath(
      condPath,
      { kind: "branch", parentCid: "c1", branch: "yes" },
      1,
    )
    const next = removeAt(steps, path)
    expect(next[0].branches?.yes.map((s) => s.cid)).toEqual(["a", "c"])
  })
})

describe("moveAt", () => {
  it("swaps two branch children", () => {
    const steps = [cond("c1", [step("a"), step("b")])]
    const condPath = childPath([], { kind: "root" }, 0)
    const path = childPath(
      condPath,
      { kind: "branch", parentCid: "c1", branch: "yes" },
      0,
    )
    const next = moveAt(steps, path, 1)
    expect(next[0].branches?.yes.map((s) => s.cid)).toEqual(["b", "a"])
  })

  it("leaves the tree untouched when moving out of range", () => {
    const steps = [cond("c1", [step("a"), step("b")])]
    const condPath = childPath([], { kind: "root" }, 0)
    const path = childPath(
      condPath,
      { kind: "branch", parentCid: "c1", branch: "yes" },
      1,
    )
    const next = moveAt(steps, path, 1)
    expect(next[0].branches?.yes.map((s) => s.cid)).toEqual(["a", "b"])
  })

  it("leaves the tree untouched for a path that doesn't resolve", () => {
    const steps = [step("plain")] // no branches
    const badPath: StepPath = [
      { kind: "root", index: 0 },
      { kind: "branch", branch: "yes", index: 0 },
    ]
    expect(mapAtPath(steps, badPath, (s) => ({ ...s, step_type: "wait" }))[0].step_type).toBe(
      "send_message",
    )
    expect(removeAt(steps, badPath)).toEqual(steps)
  })
})

// ------------------------------------------------------------
// Scope-addressed operations — the API the redesigned builder calls.
// Its whole justification is that addressing can't be silently derived
// wrong, so every test below addresses by (scope, index) directly.
// ------------------------------------------------------------

const ROOT: ParentScope = { kind: "root" }
const yesOf = (parentCid: string): ParentScope => ({
  kind: "branch",
  parentCid,
  branch: "yes",
})
const noOf = (parentCid: string): ParentScope => ({
  kind: "branch",
  parentCid,
  branch: "no",
})

describe("getInScope", () => {
  it("reads from the root list", () => {
    const steps = [step("a"), step("b")]
    expect(getInScope(steps, ROOT, 1)?.cid).toBe("b")
    expect(getInScope(steps, ROOT, 2)).toBeNull()
  })

  it("reads from a condition branch", () => {
    const steps = [cond("c1", [step("a")], [step("b")])]
    expect(getInScope(steps, noOf("c1"), 0)?.cid).toBe("b")
  })

  it("reads from a condition nested inside another condition's branch", () => {
    const steps = [cond("outer", [cond("inner", [step("deep")])])]
    expect(getInScope(steps, yesOf("inner"), 0)?.cid).toBe("deep")
  })

  it("returns null when the owning condition does not exist", () => {
    expect(getInScope([step("a")], yesOf("missing"), 0)).toBeNull()
  })
})

describe("findCidLocation", () => {
  it("finds a root step", () => {
    const steps = [step("a"), step("b")]
    expect(findCidLocation(steps, "b")).toEqual({ scope: ROOT, index: 1 })
  })

  it("finds a step inside a branch and reports the owning branch", () => {
    const steps = [cond("c1", [step("a")], [step("b")])]
    expect(findCidLocation(steps, "b")).toEqual({ scope: noOf("c1"), index: 0 })
  })

  it("finds a step nested two conditions deep", () => {
    // The regression this replaces: a second-level branch was only
    // reachable by hand-deriving a path, so the UI edited the wrong node.
    const steps = [
      cond("outer", [cond("inner", [step("first"), step("second")], [step("skip")])]),
    ]
    expect(findCidLocation(steps, "second")).toEqual({ scope: yesOf("inner"), index: 1 })
    expect(findCidLocation(steps, "skip")).toEqual({ scope: noOf("inner"), index: 0 })
  })

  it("returns null for a cid that is no longer in the tree", () => {
    // How the builder learns to drop a selection after a delete.
    expect(findCidLocation([step("a")], "gone")).toBeNull()
  })
})

describe("containsCid", () => {
  it("finds a top-level step", () => {
    expect(containsCid([step("a"), step("b")], "b")).toBe(true)
  })

  it("finds a step buried in branches", () => {
    const steps = [cond("outer", [cond("inner", [step("deep")])])]
    expect(containsCid(steps, "deep")).toBe(true)
    expect(containsCid(steps, "inner")).toBe(true)
  })

  it("is false for a cid that is absent", () => {
    expect(containsCid([cond("c1", [step("a")])], "other")).toBe(false)
  })
})

describe("updateInScope", () => {
  it("updates a root step", () => {
    const next = updateInScope([step("a"), step("b")], ROOT, 1, (s) => ({
      ...s,
      step_config: { text: "edited" },
    }))
    expect(next[0].step_config).toEqual({})
    expect(next[1].step_config).toEqual({ text: "edited" })
  })

  it("updates a branch child without touching its siblings", () => {
    const next = updateInScope(
      [cond("c1", [step("first"), step("second")])],
      yesOf("c1"),
      1,
      (s) => ({ ...s, step_config: { text: "edited" } }),
    )
    const yes = next[0].branches?.yes ?? []
    expect(yes[0].step_config).toEqual({})
    expect(yes[1].step_config).toEqual({ text: "edited" })
  })

  it("updates inside a condition nested in another condition's branch", () => {
    const next = updateInScope(
      [cond("outer", [cond("inner", [step("a"), step("b")])])],
      yesOf("inner"),
      1,
      (s) => ({ ...s, step_config: { text: "edited" } }),
    )
    expect(next[0].branches?.yes[0].branches?.yes[0].step_config).toEqual({})
    expect(next[0].branches?.yes[0].branches?.yes[1].step_config).toEqual({ text: "edited" })
  })

  it("leaves the tree untouched for an index that does not exist", () => {
    const steps = [step("a")]
    expect(updateInScope(steps, ROOT, 5, (s) => ({ ...s, step_type: "wait" }))).toEqual(steps)
    expect(
      updateInScope([cond("c1", [step("a")])], yesOf("c1"), 5, (s) => ({
        ...s,
        step_type: "wait",
      }))[0].branches?.yes[0].step_type,
    ).toBe("send_message")
  })
})

describe("removeInScope", () => {
  it("removes a root step", () => {
    const steps = [step("a"), step("b"), step("c")]
    expect(removeInScope(steps, ROOT, 1).map((s) => s.cid)).toEqual(["a", "c"])
  })

  it("removes a branch child and leaves the other branch alone", () => {
    const next = removeInScope(
      [cond("c1", [step("a"), step("b")], [step("keep")])],
      yesOf("c1"),
      0,
    )
    expect(next[0].branches?.yes.map((s) => s.cid)).toEqual(["b"])
    expect(next[0].branches?.no.map((s) => s.cid)).toEqual(["keep"])
  })

  it("removes a deeply nested step, and its branches go with it", () => {
    // Deleting a condition must delete the steps hanging off it, or the
    // save would ship children whose parent_step_id no longer exists.
    const steps = [step("before"), cond("outer", [cond("inner", [step("deep")])])]
    const next = removeInScope(steps, yesOf("inner"), 0)
    expect(next[1].branches?.yes[0].branches).toEqual({ yes: [], no: [] })
    expect(next[0].cid).toBe("before")
  })

  it("leaves the tree untouched for an index that does not exist", () => {
    const steps = [step("a")]
    expect(removeInScope(steps, ROOT, 9)).toEqual(steps)
  })
})

describe("moveInScope", () => {
  it("swaps two root steps", () => {
    const next = moveInScope([step("a"), step("b"), step("c")], ROOT, 1, -1)
    expect(next.map((s) => s.cid)).toEqual(["b", "a", "c"])
  })

  it("swaps two branch children", () => {
    const next = moveInScope(
      [cond("c1", [step("a"), step("b")], [step("other")])],
      yesOf("c1"),
      0,
      1,
    )
    expect(next[0].branches?.yes.map((s) => s.cid)).toEqual(["b", "a"])
    expect(next[0].branches?.no.map((s) => s.cid)).toEqual(["other"])
  })

  it("is a no-op past either end of the bucket", () => {
    const steps = [step("a"), step("b")]
    expect(moveInScope(steps, ROOT, 0, -1)).toEqual(steps)
    expect(moveInScope(steps, ROOT, 1, 1)).toEqual(steps)
  })
})

describe("duplicateInScope", () => {
  it("inserts the copy directly after the original", () => {
    const next = duplicateInScope([step("a"), step("b")], ROOT, 0, (s) => ({
      ...s,
      cid: "a-copy",
    }))
    expect(next.map((s) => s.cid)).toEqual(["a", "a-copy", "b"])
  })

  it("copies a condition's branches too, with fresh cids throughout", () => {
    // One cid identifies one step, so a copy that kept the original's
    // child cids would leave the copy's children unselectable.
    const steps = [cond("c1", [step("child")])]
    const next = duplicateInScope(steps, ROOT, 0, (s) => reid(s))
    const yes = next[1].branches?.yes ?? []
    expect(next[1].cid).toBe("c1-copy")
    expect(yes[0].cid).toBe("child-copy")
    expect(yes[0].cid).not.toBe(steps[0].branches?.yes[0].cid)
  })

  it("leaves the tree untouched for an index that does not exist", () => {
    const steps = [step("a")]
    expect(duplicateInScope(steps, ROOT, 3, reid)).toEqual(steps)
  })
})

describe("moveToScope", () => {
  it("moves a root step into a branch", () => {
    const next = moveToScope([step("a"), cond("c1")], { scope: ROOT, index: 0 }, yesOf("c1"), 0)
    expect(next.map((s) => s.cid)).toEqual(["c1"])
    expect(next[0].branches?.yes.map((s) => s.cid)).toEqual(["a"])
  })

  it("moves a branch step back out to the root", () => {
    const next = moveToScope([cond("c1", [step("inner")]), step("tail")], {
      scope: yesOf("c1"),
      index: 0,
    }, ROOT, 1)
    expect(next.map((s) => s.cid)).toEqual(["c1", "inner", "tail"])
    expect(next[0].branches?.yes).toEqual([])
  })

  it("refuses a destination that does not exist rather than dropping the step", () => {
    // The step is lifted out before it is inserted; a destination that
    // can't be resolved would then silently delete it, and a drag must
    // never be able to do that.
    const steps = [step("a")]
    expect(moveToScope(steps, { scope: ROOT, index: 0 }, yesOf("missing"), 0)).toEqual(steps)
  })

  it("clamps a target index past the end of the destination", () => {
    // Dragging into an empty branch addresses index 0, and lifting out
    // of a bucket shrinks that bucket mid-move; neither may throw.
    const next = moveToScope([cond("c1"), step("a")], { scope: ROOT, index: 1 }, yesOf("c1"), 99)
    expect(next.map((s) => s.cid)).toEqual(["c1"])
    expect(next[0].branches?.yes.map((s) => s.cid)).toEqual(["a"])
  })

  it("leaves the tree untouched when the source no longer exists", () => {
    const steps = [step("a")]
    expect(moveToScope(steps, { scope: ROOT, index: 5 }, yesOf("c1"), 0)).toEqual(steps)
  })
})

/** Clone helper standing in for the builder's id minting. */
function reid(s: TestStep): TestStep {
  return {
    ...s,
    cid: `${s.cid}-copy`,
    step_config: { ...s.step_config },
    branches: s.branches
      ? { yes: s.branches.yes.map(reid), no: s.branches.no.map(reid) }
      : undefined,
  }
}