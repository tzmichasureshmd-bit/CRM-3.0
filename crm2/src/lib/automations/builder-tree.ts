// ------------------------------------------------------------
// Automation builder step tree: addressing + immutable mutation.
//
// The builder edits a tree, not a list: root steps run in order, and a
// `condition` step nests its children under `branches.yes` /
// `branches.no`. Every mutation is addressed by a StepPath — one
// element per level, each naming the bucket it descends into and the
// index within that bucket.
//
// The addressing rule is: a step's path is its parent's path plus its
// own marker. `childPath` is the only place that rule is written down;
// build paths with it rather than by hand. Getting it wrong doesn't
// throw — the walkers below simply find nothing and return the tree
// unchanged, so the UI silently drops the edit. That is how issue #474
// hid: every keystroke in a step nested under a condition was a no-op.
//
// Lives here rather than in the component so the rules are unit-
// testable in the node test environment (there is no jsdom / DOM
// testing setup in this repo).
// ------------------------------------------------------------

/**
 * Structural minimum the walkers need. Generic in the concrete node
 * type so callers keep their own richer step type end-to-end —
 * `BuilderStep` in the builder satisfies `TreeStep<BuilderStep>`.
 */
export interface TreeStep<T> {
  cid: string
  branches?: { yes: T[]; no: T[] }
}

/** Which bucket new children go into, for insertion. */
export type ParentScope =
  | { kind: "root" }
  | { kind: "branch"; parentCid: string; branch: "yes" | "no" }

/**
 * One level of addressing: which bucket, and the index within it. The
 * first marker of a path is always `root`; every later one names the
 * branch of the step the previous marker resolved to.
 */
export type StepMarker =
  | { kind: "root"; index: number }
  | { kind: "branch"; branch: "yes" | "no"; index: number }

export type StepPath = StepMarker[]

/**
 * Path of the step at `index` within `scope`, where `basePath` is the
 * path of the step that OWNS that scope (`[]` for the root list, the
 * condition's own path for a branch).
 *
 * Callers used to append a branch marker when descending into a
 * condition and then append a second one per child, on the assumption
 * that the first one's index would be "replaced during the walk".
 * Nothing replaced it: the walkers consumed both markers, so an edit
 * addressed the first child of the branch and then looked for the real
 * target inside *that* child's branches — which a `send_buttons` step
 * doesn't have, so the update was dropped (issue #474).
 */
export function childPath(
  basePath: StepPath,
  scope: ParentScope,
  index: number,
): StepPath {
  return [
    ...basePath,
    scope.kind === "root"
      ? { kind: "root", index }
      : { kind: "branch", branch: scope.branch, index },
  ]
}

/**
 * Insert `node` at `index` within `scope`. Searches the whole tree for
 * the scope's owning condition, not just the root list — a condition
 * nested inside another condition's branch is a normal thing to build,
 * and only matching at the top level meant the Add button under it did
 * nothing at all.
 */
export function insertAt<T extends TreeStep<T>>(
  steps: T[],
  scope: ParentScope,
  index: number,
  node: T,
): T[] {
  if (scope.kind === "root") {
    const copy = [...steps]
    copy.splice(index, 0, node)
    return copy
  }
  return steps.map((step) => {
    if (!step.branches) return step
    if (step.cid === scope.parentCid) {
      const bucket = [...step.branches[scope.branch]]
      bucket.splice(index, 0, node)
      return {
        ...step,
        branches: { ...step.branches, [scope.branch]: bucket },
      }
    }
    // Not this condition — keep looking inside both of its branches.
    return {
      ...step,
      branches: {
        yes: insertAt(step.branches.yes, scope, index, node),
        no: insertAt(step.branches.no, scope, index, node),
      },
    }
  })
}

/** Replace the step at `path` with `updater`'s result. */
export function mapAtPath<T extends TreeStep<T>>(
  steps: T[],
  path: StepPath,
  updater: (step: T) => T,
): T[] {
  return atPath(steps, path, (bucket, index) =>
    bucket.map((step, i) => (i === index ? updater(step) : step)),
  )
}

// ------------------------------------------------------------
// Scope-addressed operations.
//
// The path functions above are the historical API and stay exactly as
// they are. These are the ones the redesigned builder actually calls,
// and they are addressed by (scope, index) instead of by path — which
// is what the UI has in hand when the user clicks a card.
//
// The difference is not cosmetic. A path has to be DERIVED: the caller
// walks the tree computing one marker per level, and a derivation bug
// doesn't throw, it just quietly addresses the wrong step (issue #474
// was exactly that, and it cost every keystroke inside a condition
// branch). A scope is already sitting in the component that owns the
// list, so there is nothing to derive and nothing to get wrong.
//
// They are kept separate rather than reimplementing paths on top of
// scopes because the path API is still the thing builder-tree.test.ts
// pins, and the two addressing styles document two different eras of
// the builder.
// ------------------------------------------------------------

/** Where a step lives: which bucket, and its slot in that bucket. */
export interface StepLocation {
  scope: ParentScope;
  index: number;
}

/** The `index`-th step in `scope`, or null when there isn't one. */
export function getInScope<T extends TreeStep<T>>(
  steps: T[],
  scope: ParentScope,
  index: number,
): T | null {
  const bucket = resolveBucket(steps, scope);
  return bucket?.[index] ?? null;
}

/**
 * The steps a scope addresses, or null when the scope's owning
 * condition isn't in this tree.
 *
 * The search for the condition is a full walk, not a `.find` on the
 * root list. A condition inside another condition's branch is a normal
 * thing to build, and a root-only lookup made every operation addressed
 * to it resolve to nothing: reading, reordering and dragging steps two
 * forks deep silently did nothing, and because nothing throws, the
 * builder just ignored the user. `insertAt` and the walkers below
 * already recurse for exactly this reason.
 */
function resolveBucket<T extends TreeStep<T>>(
  steps: T[],
  scope: ParentScope,
): T[] | null {
  if (scope.kind === "root") return steps
  const owner = findByCid(steps, scope.parentCid)
  if (!owner?.branches) return null
  return owner.branches[scope.branch]
}

/** The step with this cid, wherever it sits. */
function findByCid<T extends TreeStep<T>>(steps: T[], cid: string): T | null {
  for (const step of steps) {
    if (step.cid === cid) return step
    if (!step.branches) continue
    const yes = findByCid(step.branches.yes, cid)
    if (yes) return yes
    const no = findByCid(step.branches.no, cid)
    if (no) return no
  }
  return null
}

/**
 * Where the step carrying `cid` lives, searching depth-first: the
 * bucket itself, then each condition's YES bucket, then its NO.
 *
 * The builder selects steps by cid rather than by location because a
 * location is index-based — reorder or delete a step and every location
 * below it shifts, so a stored one silently starts pointing at a
 * different card. A cid is minted once and never changes, so the UI
 * holds a cid and asks where it is at the moment of the edit. Returns
 * null once the step is gone, which is how the builder learns to drop
 * a selection.
 */
export function findCidLocation<T extends TreeStep<T>>(
  steps: T[],
  cid: string,
  scope: ParentScope = { kind: "root" },
): StepLocation | null {
  const bucket = resolveBucket(steps, scope);
  if (!bucket) return null;

  for (let index = 0; index < bucket.length; index++) {
    const step = bucket[index];
    if (step.cid === cid) return { scope, index };
    // A condition's own branches are searched with its own cid as the
    // scope anchor — the same identity `insertAt` matches on, so the
    // two can never disagree about which node a branch belongs to.
    if (!step.branches) continue;
    for (const branch of ["yes", "no"] as const) {
      const found = findCidLocation(steps, cid, {
        kind: "branch",
        parentCid: step.cid,
        branch,
      });
      if (found) return found;
    }
  }
  return null;
}

/**
 * Whether `cid` appears anywhere inside these steps or the branches
 * they own.
 *
 * Used to refuse an illegal drop: moving a condition into its own YES
 * branch would detach the branch from the tree the finder walks (the
 * inserted node is no longer reachable from the root, so it becomes
 * invisible AND unsaveable), which is the kind of data loss a drag
 * gesture must never be able to cause.
 */
export function containsCid<T extends TreeStep<T>>(steps: T[], cid: string): boolean {
  return steps.some(
    (step) =>
      step.cid === cid ||
      (!!step.branches &&
        (containsCid(step.branches.yes, cid) || containsCid(step.branches.no, cid))),
  );
}

/** Replace the `index`-th step in `scope` with `updater`'s result. */
export function updateInScope<T extends TreeStep<T>>(
  steps: T[],
  scope: ParentScope,
  index: number,
  updater: (step: T) => T,
): T[] {
  if (scope.kind === "root") {
    if (!steps[index]) return steps;
    return steps.map((step, i) => (i === index ? updater(step) : step));
  }
  return steps.map((step) => {
    if (!step.branches) return step;
    if (step.cid === scope.parentCid) {
      return {
        ...step,
        branches: {
          ...step.branches,
          [scope.branch]: step.branches[scope.branch].map((child, i) =>
            i === index ? updater(child) : child,
          ),
        },
      };
    }
    // Not the owning condition — keep looking inside both of its
    // branches, because a condition nested in a condition is a normal
    // thing to build.
    return {
      ...step,
      branches: {
        yes: updateInScope(step.branches.yes, scope, index, updater),
        no: updateInScope(step.branches.no, scope, index, updater),
      },
    };
  });
}

/** Drop the `index`-th step in `scope`, and with it any branch it owns. */
export function removeInScope<T extends TreeStep<T>>(
  steps: T[],
  scope: ParentScope,
  index: number,
): T[] {
  if (scope.kind === "root") {
    if (!steps[index]) return steps;
    return steps.filter((_, i) => i !== index);
  }
  return steps.map((step) => {
    if (!step.branches) return step;
    if (step.cid === scope.parentCid) {
      return {
        ...step,
        branches: {
          ...step.branches,
          [scope.branch]: step.branches[scope.branch].filter(
            (_, i) => i !== index,
          ),
        },
      };
    }
    return {
      ...step,
      branches: {
        yes: removeInScope(step.branches.yes, scope, index),
        no: removeInScope(step.branches.no, scope, index),
      },
    };
  });
}

/** Swap the `index`-th step in `scope` with its neighbour in `direction`. */
export function moveInScope<T extends TreeStep<T>>(
  steps: T[],
  scope: ParentScope,
  index: number,
  direction: -1 | 1,
): T[] {
  const target = index + direction;
  // Both slots must exist, which is what keeps a "Move up" on the first
  // card (and "Move down" on the last) a no-op instead of a crash or a
  // silent wrap-around.
  if (target < 0) return steps;
  if (!getInScope(steps, scope, index) || !getInScope(steps, scope, target))
    return steps;

  const a = getInScope(steps, scope, index) as T;
  const b = getInScope(steps, scope, target) as T;
  return updateInScope(updateInScope(steps, scope, index, () => b), scope, target, () => a);
}

/**
 * Copy of the `index`-th step in `scope`, inserted directly after it.
 *
 * `clone` mints the copy because duplicating a condition has to
 * produce a condition whose YES/NO children are all new nodes too: a
 * cid identifies exactly one step in the tree (the builder selects,
 * edits and drags by cid, so two steps sharing one would leave one of
 * them unselectable). The caller owns id minting, which keeps this
 * file free of runtime dependencies and unit-testable in the node
 * test environment.
 */
export function duplicateInScope<T extends TreeStep<T>>(
  steps: T[],
  scope: ParentScope,
  index: number,
  clone: (step: T) => T,
): T[] {
  const source = getInScope(steps, scope, index);
  if (!source) return steps;
  return insertAt(steps, scope, index + 1, clone(source));
}

/**
 * Lift a step out of one bucket and drop it into another, at
 * `toIndex`. This is what a drag between lists does — main list into
 * a YES branch, or out of a branch and back onto the main list.
 *
 * The caller owns the index arithmetic: lifting a node out shifts
 * every later slot in ITS OWN bucket down by one, so a caller dragging
 * downward inside a single list must pass `toIndex - 1`. Doing that
 * bookkeeping here would mean this function also had to know where
 * the step came from, which is more state than a tree walker needs.
 */
export function moveToScope<T extends TreeStep<T>>(
  steps: T[],
  from: StepLocation,
  to: ParentScope,
  toIndex: number,
): T[] {
  const node = getInScope(steps, from.scope, from.index);
  if (!node) return steps;
  // Checked BEFORE the lift: a destination that doesn't resolve would
  // otherwise swallow the step — lifted out of its bucket, then
  // inserted nowhere. A drag gesture must never be able to delete a
  // step, and the UI cannot normally produce this case (a drop targets
  // a rendered lane), so refusing it is free.
  if (!resolveBucket(steps, to)) return steps;
  const cleared = removeInScope(steps, from.scope, from.index);
  // Bounded against the CLEARED tree: after the lift an append lands at
  // its new length, which is a legal insertion point.
  return insertAt(cleared, to, Math.max(0, Math.min(toIndex, cleared.length)), node);
}

/** Drop the step at `path`. */
export function removeAt<T extends TreeStep<T>>(
  steps: T[],
  path: StepPath,
): T[] {
  return atPath(steps, path, (bucket, index) =>
    bucket.filter((_, i) => i !== index),
  )
}

/** Swap the step at `path` with its neighbour in `direction`. */
export function moveAt<T extends TreeStep<T>>(
  steps: T[],
  path: StepPath,
  direction: -1 | 1,
): T[] {
  return atPath(steps, path, (bucket, index) => {
    const target = index + direction
    if (target < 0 || target >= bucket.length) return bucket
    const copy = [...bucket]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    return copy
  })
}

/**
 * Walk to the bucket the last marker of `path` addresses and hand it,
 * plus the target index, to `edit`. One traversal shared by every
 * mutation above so they cannot drift apart on how a path resolves.
 *
 * A path that doesn't resolve (stale index, unknown branch, a marker
 * pointing into a step with no branches) returns the tree untouched.
 */
function atPath<T extends TreeStep<T>>(
  steps: T[],
  path: StepPath,
  edit: (bucket: T[], index: number) => T[],
): T[] {
  if (path.length === 0) return steps
  const [head, ...rest] = path

  // Last marker: `steps` is the bucket that holds the target.
  if (rest.length === 0) return edit(steps, head.index)

  // Otherwise descend through the step this marker names, into the
  // branch the NEXT marker names.
  const next = rest[0]
  if (next.kind !== "branch") return steps
  return steps.map((step, i) => {
    if (i !== head.index || !step.branches) return step
    return {
      ...step,
      branches: {
        ...step.branches,
        [next.branch]: atPath(step.branches[next.branch], rest, edit),
      },
    }
  })
}