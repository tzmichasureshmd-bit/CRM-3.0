"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ArrowLeft, Loader2 } from "lucide-react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  cloneStep,
  makeStep,
  toApiSteps,
  type BuilderInitial,
  type BuilderStep,
} from "@/lib/automations/builder-model"
import {
  containsCid,
  duplicateInScope,
  findCidLocation,
  getInScope,
  insertAt,
  moveToScope,
  removeInScope,
  updateInScope,
  type ParentScope,
} from "@/lib/automations/builder-tree"
import { computeReadiness } from "@/lib/automations/readiness"
import { cn } from "@/lib/utils"
import type { AutomationStepType, AutomationTriggerType } from "@/types"
import { ConfigPanel, type ConfigTarget } from "./config-panel"
import { FlowLane, StepDragGhost } from "./flow-lane"
import { ResourcesProvider } from "./resources"
import { TriggerNode } from "./trigger-node"

// The data layer used to live in this file. Re-exported because the new
// and edit pages, and the builder's test, import these from here.
export {
  fromServerSteps,
  toApiSteps,
  type ApiStep,
  type BuilderInitial,
  type BuilderStep,
  type ServerStepNode,
} from "@/lib/automations/builder-model"

// ------------------------------------------------------------
// The builder shell.
//
// This file used to be 1,581 lines: the data model, the step tree, the
// resource loaders, the add-step menu, the trigger form, thirteen
// per-step config forms, the card markup, and the save logic — all in
// one component. It is now the orchestrator only: state, mutations, and
// layout. Everything visual lives in a sibling, and everything reusable
// lives in `lib/automations`.
//
// What actually changed for the user:
//
//   * the canvas draws its own flow — trigger at the top, connectors
//     between cards, a real fork under every condition
//   * steps can be dragged, not just nudged up and down with arrows
//   * editing happens in one panel (docked on desktop, a sheet on
//     mobile) instead of expanding a card in place, so the canvas stops
//     reflowing under the user's cursor
//   * a live readiness bar says whether this would activate, and which
//     steps are stopping it — before the server says no
//
// The save payload, the endpoints, the request method and the router
// behaviour are untouched.
// ------------------------------------------------------------

export function AutomationBuilder({ initial }: { initial: BuilderInitial }) {
  const router = useRouter()
  const t = useTranslations("Automations.builder")
  const isEditing = !!initial.id

  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>(
    initial.trigger_type,
  )
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    initial.trigger_config,
  )
  const [isActive, setIsActive] = useState(initial.is_active)
  const [steps, setSteps] = useState<BuilderStep[]>(initial.steps)
  const [saving, setSaving] = useState(false)

  /** The single "what is being edited" pointer. A cid, not a location:
   *  locations shift under every insert and delete, a cid doesn't. */
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<BuilderStep | null>(null)

  const readiness = useMemo(
    () => computeReadiness(steps, triggerType, triggerConfig),
    [steps, triggerType, triggerConfig],
  )

  const target: ConfigTarget = useMemo(() => {
    if (selected === "trigger") return { kind: "trigger" }
    if (!selected) return null
    const found = findCidLocation(steps, selected)
    if (!found) return null
    return { kind: "step", step: getInScope(steps, found.scope, found.index)! };
  }, [selected, steps]);

  // --- Step tree mutations (immutable, scope-addressed) ---

  const insertStep = useCallback(
    (scope: ParentScope, index: number, type: AutomationStepType) => {
      const node = makeStep(type);
      setSteps((prev) => insertAt(prev, scope, index, node));
      // Select it so the panel opens on what was just created. A step
      // that is dropped in and left unconfigured is exactly the state
      // the old builder hid until the user clicked the card twice.
      setSelected(node.cid);
    },
    [],
  );

  const deleteStep = useCallback((scope: ParentScope, index: number) => {
    setSteps((prev) => removeInScope(prev, scope, index));
    setSelected(null);
  }, []);

  const duplicateStep = useCallback((scope: ParentScope, index: number) => {
    // The copy is minted out here and used for BOTH the tree and the
    // selection, because the state updater that inserts it runs during a
    // later render: a cid captured inside the updater is still null when
    // the next line reads it, and cloning twice mints two different cids
    // so the selected one addresses nothing at all. Either way the copy
    // lands on the canvas with no editor open and the panel still
    // showing the original.
    const source = getInScope(steps, scope, index);
    if (!source) return;
    const copy = cloneStep(source);
    setSteps((prev) => duplicateInScope(prev, scope, index, () => copy));
    setSelected(copy.cid);
  }, [steps]);

  const updateStep = useCallback((next: BuilderStep) => {
    setSteps((prev) => {
      const found = findCidLocation(prev, next.cid);
      if (!found) return prev;
      return updateInScope(prev, found.scope, found.index, () => next);
    });
  }, []);

  // --- Drag & drop ---
  //
  // `pointerWithin` rather than the default closest-centre: the lanes
  // are nested (a branch is a lane inside a condition), and closest
  // centre happily reports a step in the OTHER branch, which makes a
  // drop land somewhere the pointer never was.

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragStart(event: DragStartEvent) {
    const cid = String(event.active.id);
    const found = findCidLocation(steps, cid);
    if (!found) return;
    setDragging(getInScope(steps, found.scope, found.index) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;
    const from = findCidLocation(steps, String(active.id));
    const to = findCidLocation(steps, String(over.id));
    if (!from || !to) return;

    const dragged = getInScope(steps, from.scope, from.index);
    if (!dragged) return;
    // A condition cannot be dropped inside its own branches: the
    // inserted node would leave the tree the finder walks, so it would
    // vanish from the canvas and from the saved payload.
    if (to.scope.kind === "branch" && containsCid([dragged], to.scope.parentCid)) {
      return;
    }

    // Same lane = a reorder; different lane = a move, which is how a
    // step gets into or out of a condition's branch.
    let sameLane = false;
    if (from.scope.kind === "root" && to.scope.kind === "root") {
      sameLane = true;
    } else if (from.scope.kind === "branch" && to.scope.kind === "branch") {
      sameLane = from.scope.parentCid === to.scope.parentCid;
    }

    // Dropping downwards has to skip the slot the dragged step is
    // leaving, otherwise the node lands on top of itself and the list
    // appears not to move. `moveToScope` lifts first, so its target
    // index is an index into the already-shortened list.
    const insertAtIndex =
      sameLane && from.index < to.index ? to.index + 1 : to.index;

    setSteps((prev) => moveToScope(prev, from, to.scope, insertAtIndex));
  }

  // --- Save ---

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: name || "Untitled automation",
        description: description || null,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        is_active: isActive,
        steps: toApiSteps(steps),
      };

      const res = isEditing
        ? await fetch(`/api/automations/${initial.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/automations`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // If the server blocked activation with validation issues,
        // surface the first concrete problem so the user can fix it
        // without opening DevTools for the full array.
        const firstIssue: { path?: string; message?: string } | undefined =
          body?.issues?.[0];
        if (firstIssue?.message) {
          toast.error(firstIssue.message, {
            description: firstIssue.path ? `at ${firstIssue.path}` : undefined,
          });
        } else {
          toast.error(body?.error ?? t("toasts.saveFailed"));
        }
        return;
      }
      toast.success(isEditing ? t("toasts.saved") : t("toasts.created"));
      if (!isEditing && body?.automation?.id) {
        router.replace(`/automations/${body.automation.id}/edit`);
      }
    } finally {
      setSaving(false);
    }
  }

  const laneHandlers = {
    selectedCid: selected,
    onSelect: setSelected,
    onInsert: insertStep,
    onDuplicate: duplicateStep,
    onDelete: deleteStep,
  };

  return (
    <ResourcesProvider>
      <div className="fixed inset-0 flex flex-col bg-background">
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 py-3 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={() => router.push("/automations")}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("backToAutomations")}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("untitled")}
            aria-label={t("untitled")}
            className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:bg-muted focus:outline-none sm:text-base"
          />
          <ReadinessBadge
            ready={readiness.ready}
            total={readiness.total}
            jumpTarget={
              // The trigger is configured in the panel, not on the
              // canvas, so an unconfigured trigger has to be the first
              // landing spot — otherwise the badge reads "2 problems",
              // jumps into a fine step, and the user is sent to the
              // wrong place.
              readiness.triggerKeys.length > 0
                ? "trigger"
                : (readiness.steps[0]?.cid ?? null)
            }
            onJump={setSelected}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{t("active")}</span>
            <Switch
              checked={isActive}
              onCheckedChange={(v) => setIsActive(!!v)}
              aria-label={t("activeAria")}
            />
          </div>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEditing ? t("save") : t("saveDraft")}
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragging(null)}
          >
            <div className="relative min-w-0 flex-1 overflow-y-auto">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:20px_20px]"
              />
              <div className="relative mx-auto flex max-w-2xl flex-col items-center px-4 py-8">
                <div className="w-full max-w-[22rem]">
                  <TriggerNode
                    type={triggerType}
                    config={triggerConfig}
                    selected={selected === "trigger"}
                    onSelect={() => setSelected("trigger")}
                  />
                </div>
                <FlowLane
                  steps={steps}
                  scope={{ kind: "root" }}
                  className="pt-2"
                  emptyState={
                    <EmptyCanvas
                      onAdd={() => insertStep({ kind: "root" }, 0, "send_message")}
                    />
                  }
                  {...laneHandlers}
                />
              </div>
            </div>

            <ConfigPanel
              target={target}
              onClose={() => setSelected(null)}
              name={name}
              description={description}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              triggerType={triggerType}
              triggerConfig={triggerConfig}
              onTriggerChange={(nextType, nextConfig) => {
                setTriggerType(nextType);
                setTriggerConfig(nextConfig);
              }}
              onStepChange={updateStep}
              onDeleteStep={
                target?.kind === "step"
                  ? () => {
                      const found = findCidLocation(steps, target.step.cid);
                      if (found) deleteStep(found.scope, found.index);
                    }
                  : undefined
              }
              onDuplicateStep={
                target?.kind === "step"
                  ? () => {
                      const found = findCidLocation(steps, target.step.cid);
                      if (found) duplicateStep(found.scope, found.index);
                    }
                  : undefined
              }
            />

            <DragOverlay dropAnimation={null}>
              {dragging ? <StepDragGhost step={dragging} /> : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </ResourcesProvider>
  );
}

/**
 * The answer to "can I turn this on yet?", plus a way to act on it.
 *
 * A workflow that is half configured used to look identical to a
 * finished one until the server rejected the activation. This is a
 * preview of that same check, so the first activation of a new workflow
 * is not a coin flip.
 */
function ReadinessBadge({
  ready,
  total,
  jumpTarget,
  onJump,
}: {
  ready: boolean
  total: number
  /** A step cid, or `"trigger"`. Null when there is nothing to jump to. */
  jumpTarget: string | null
  onJump: (cid: string) => void
}) {
  const t = useTranslations("Automations.builder")

  if (ready) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs leading-tight font-medium text-emerald-700 dark:text-emerald-400">
        {t("readiness.ready")}
      </span>
    )
  }

  // A button, not a label: "2 problems need attention" is only useful
  // if it takes you to one of them. When nothing owns a problem — a
  // workflow with no steps at all — there is nowhere to jump, so this
  // degrades to a plain label rather than a button that does nothing
  // when pressed.
  //
  // `inline-flex` has to be in the base, not at `sm`. The two variants
  // used to differ (`hidden sm:inline-flex` for the ready one), so
  // below `sm` the not-ready badge fell back to `display: inline`,
  // where `gap` and `py-1` are both inert — the text sat on the
  // border with no padding around it, and the one badge that tells the
  // user their workflow cannot be activated was the only one that
  // rendered broken. It is also the one they most need to read.
  const className =
    "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/12 px-2.5 py-1 text-xs leading-tight font-medium text-amber-700 dark:text-amber-400"
  if (!jumpTarget) {
    return <span className={className}>{t("readiness.incomplete", { count: total })}</span>
  }

  return (
    <button
      type="button"
      onClick={() => onJump(jumpTarget)}
      className={cn(className, "transition-colors hover:bg-amber-500/20")}
    >
      {t("readiness.incomplete", { count: total })}
    </button>
  )
}

/**
 * Shown when a workflow has no steps at all.
 *
 * The alternative was an empty canvas with one dashed "+" in it, which
 * does not tell a first-time user what an automation IS. Two sentences
 * and a button get them to a working state faster than a menu does.
 */
function EmptyCanvas({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations("Automations.builder")
  return (
    <div className="mt-4 w-full max-w-[22rem] rounded-xl border border-dashed border-border bg-card/60 px-5 py-6 text-center">
      <p className="text-sm font-medium text-foreground">
        {t("emptyCanvas.title")}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {t("emptyCanvas.body")}
      </p>
      <Button size="sm" className="mt-4" onClick={onAdd}>
        {t("emptyCanvas.action")}
      </Button>
    </div>
  );
}
