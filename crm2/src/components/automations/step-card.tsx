"use client"

import type { ReactNode } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useTranslations } from "next-intl"
import { Copy, GripVertical, Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { STEP_META, stepColors, stepEyebrow } from "@/lib/automations/step-meta"
import { cn } from "@/lib/utils"
import type { BuilderStep } from "@/lib/automations/builder-model"
import { StepIconChip, summarizeStep } from "./step-summary"
import { useResources } from "./resources"

// ------------------------------------------------------------
// A step on the canvas.
//
// Reads top-to-bottom as: what KIND of step is this (eyebrow), what is
// it called (name), and what will it actually do (summary). The
// previous card showed a raw config value in that third slot, so a user
// could tell a card was "a wait" but not "a wait of how long".
//
// Split in two on purpose. `SortableStep` owns the dnd-kit hook and the
// drag transform; `StepCard` is presentational and knows nothing about
// dragging, which is what lets the DragOverlay ghost reuse it without
// registering a second sortable node under the same id.
// ------------------------------------------------------------

/** A step card wired up for dragging. */
export function SortableStep(props: {
  step: BuilderStep
  selected: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const t = useTranslations("Automations.builder")
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.step.cid })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Hidden rather than removed: an unmounted drag source loses its
      // measurement and the list jumps. `pointer-events-none` stops the
      // ghost from being re-dragged.
      className={cn(isDragging && "pointer-events-none opacity-40")}
    >
      <StepCard
        {...props}
        dragHandle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t("dragHandle")}
            title={t("dragHandle")}
            className="flex h-6 w-5 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </button>
        }
      />
    </div>
  )
}

/**
 * The card itself.
 *
 * `dragHandle` is omitted for the DragOverlay ghost, which must not
 * carry dnd-kit wiring. `overlay` additionally suppresses the hover
 * treatment and drops the interactive controls.
 */
export function StepCard({
  step,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  dragHandle,
  overlay = false,
  className,
}: {
  step: BuilderStep
  selected: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
  dragHandle?: ReactNode
  overlay?: boolean
  className?: string
}) {
  const t = useTranslations("Automations.builder")
  const lookups = useResources()
  const colors = stepColors(step.step_type)
  const Icon = STEP_META[step.step_type].icon
  const summary = summarizeStep(step, t, lookups)

  return (
    <div
      className={cn(
        // `max-w-[22rem]` is the canvas's one measure. The trigger node
        // and the empty state are already capped at it; without the same
        // cap here the step cards stretched to the full width of the
        // `max-w-2xl` canvas column (~640px on a wide monitor) while
        // the trigger stayed 352px, so the two halves of the same
        // column no longer lined up. The card is also a viewport-
        // independent unit now, which is what keeps `truncate` doing
        // its job at every window size.
        "group/step relative w-full max-w-[22rem] rounded-xl border bg-card text-left transition-[border-color,box-shadow] duration-150",
        overlay
          ? "border-primary/40 shadow-xl"
          : selected
            ? "border-transparent"
            : "border-border shadow-xs hover:border-foreground/25",
        className
      )}
      style={selected && !overlay ? { boxShadow: `0 0 0 2px ${colors.ring}` } : undefined}
    >
      {/* Type accent. A rail rather than a border colour, so the
          selection ring (same box) and the type hue (same edge) stay
          two independent signals instead of fighting for one. */}
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[3px] rounded-full"
        style={{ background: colors.solid }}
      />

      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className="flex w-full cursor-pointer items-start gap-2.5 py-2.5 pr-2 pl-3.5 text-left"
      >
        <StepIconChip
          icon={Icon}
          solid={colors.solid}
          soft={colors.soft}
          size={30}
          iconSize={15}
          className="mt-0.5"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span
              className="text-xs leading-tight font-semibold tracking-wide uppercase"
              style={{ color: colors.text }}
            >
              {t(`eyebrows.${stepEyebrow(step.step_type)}`)}
            </span>
            {!summary.configured && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs leading-tight font-semibold text-amber-700 dark:text-amber-400">
                {t("needsSetup")}
              </span>
            )}
          </span>
          <span className="truncate text-sm leading-tight font-semibold text-foreground">
            {t(`steps.${step.step_type}`)}
          </span>
          <span
            className={cn(
              "truncate text-sm leading-snug",
              summary.configured
                ? "text-muted-foreground"
                : "text-muted-foreground italic"
            )}
            title={summary.text}
          >
            {summary.text}
          </span>
        </span>
      </button>

      {/* Controls. Present in the DOM either way (tabbable, announced),
          visually recessive until hover or keyboard focus — and always
          visible below `sm`, because a touch device never fires hover
          and a control that only exists on hover does not exist at all.

          These sit in the normal flow, in their own row, rather than
          absolutely positioned over the card. Overlaying them put a
          ~104px cluster on top of the eyebrow and the title, so the
          two lines that name the step were covered by an opaque
          backdrop the moment the pointer arrived — and on a touch
          device the `mt-auto` escape hatch did nothing at all, because
          the card is a block, not a flex column, so the controls fell
          flush against the border with no padding.

          `opacity` is what reveals them, and opacity is not a layout
          property: the row is always measured, so revealing the
          controls never reflows the canvas under the cursor. */}
      {!overlay && (
        <div
          className={cn(
            "flex items-center justify-end gap-0.5 px-3.5 pb-2.5",
            "opacity-0 transition-opacity duration-150 group-hover/step:opacity-100 group-focus-within/step:opacity-100",
            "max-sm:opacity-100"
          )}
        >
          {dragHandle}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onSelect}
            aria-label={t("editStep")}
            title={t("editStep")}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDuplicate}
            aria-label={t("duplicateStep")}
            title={t("duplicateStep")}
            className="text-muted-foreground hover:text-foreground"
          >
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDelete}
            aria-label={t("deleteStep")}
            title={t("deleteStep")}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  )
}
