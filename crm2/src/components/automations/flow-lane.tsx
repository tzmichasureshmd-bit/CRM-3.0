"use client"

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { ReactNode } from "react"

import type { ParentScope } from "@/lib/automations/builder-tree"
import type { BuilderStep } from "@/lib/automations/builder-model"
import type { AutomationStepType } from "@/types"
import { cn } from "@/lib/utils"
import { AddStepMenu } from "./add-step-menu"
import { BranchForks } from "./condition-branches"
import { SortableStep, StepCard } from "./step-card"

// ------------------------------------------------------------
// One linear run of steps — the main canvas, or one of a condition's
// two branches.
//
// The vertical line between cards used to be a bare 2px div, so a
// branch read as "two cards floating under a condition" with nothing
// marking either of them as downstream of it. Here the connector
// carries the flow THROUGH the add-step pill, which turns a stack of
// cards into a sequence you can follow with your eye and makes the
// affordance unambiguously "insert here" instead of "add below".
//
// A condition is the one card that does not grow the trailing pill: it
// ends in two branches, never in a single next step, so its children
// provide the way forward instead.
// ------------------------------------------------------------

export interface LaneHandlers {
  selectedCid: string | null
  onSelect: (cid: string) => void
  onInsert: (scope: ParentScope, index: number, type: AutomationStepType) => void
  onDuplicate: (scope: ParentScope, index: number) => void
  onDelete: (scope: ParentScope, index: number) => void
}

export function FlowLane({
  steps,
  scope,
  className,
  emptyState,
  ...handlers
}: LaneHandlers & {
  steps: BuilderStep[]
  scope: ParentScope
  /** Rendered in place of nothing when the lane holds no steps. */
  emptyState?: ReactNode
  className?: string
}) {
  return (
    <SortableContext items={steps.map((s) => s.cid)} strategy={verticalListSortingStrategy}>
      <div className={cn("flex w-full flex-col items-center", className)}>
        {steps.length === 0 ? (
          <Connector>
            <AddStepMenu variant="dot" onPick={(type) => handlers.onInsert(scope, 0, type)} />
          </Connector>
        ) : null}

        {steps.length === 0 ? emptyState : null}

        {steps.map((step, index) => (
          <LaneItem
            key={step.cid}
            step={step}
            index={index}
            scope={scope}
            {...handlers}
          />
        ))}
      </div>
    </SortableContext>
  )
}

function LaneItem({
  step,
  index,
  scope,
  ...handlers
}: LaneHandlers & {
  step: BuilderStep
  index: number
  scope: ParentScope
}) {
  return (
    <div className="flex w-full flex-col items-center">
      {/* The cap belongs here, not only on the card itself. `w-full` on
          its own made this box as wide as the whole canvas column
          (~640px), so the card's own `max-w-[22rem]` pinned it to the
          lane's LEFT edge while the trigger, the add-step pill and the
          condition's two branch columns all sat on the lane's centre
          line. A condition therefore forked visibly off to the right of
          the card it belongs to, by half the excess width. Capping the
          box puts the card back on the centre line, where the fork's
          drop lines and the two branch columns meet it. */}
      <div className="w-full max-w-[22rem]">
        <SortableStep
          step={step}
          selected={handlers.selectedCid === step.cid}
          onSelect={() => handlers.onSelect(step.cid)}
          onDuplicate={() => handlers.onDuplicate(scope, index)}
          onDelete={() => handlers.onDelete(scope, index)}
        />
      </div>

      {step.step_type === "condition" ? (
        <BranchForks step={step} {...handlers} />
      ) : (
        <Connector>
          <AddStepMenu
            variant="pill"
            className="max-sm:h-9"
            onPick={(type) => handlers.onInsert(scope, index + 1, type)}
          />
        </Connector>
      )}
    </div>
  )
}

/** The vertical connector that carries the flow between two cards.
 *
 *  The two line stubs are decorative and hidden from assistive tech;
 *  the wrapper is NOT, because the add-step pill lives inside it and is
 *  a real control. Hiding the wrapper would take the button out of the
 *  accessibility tree and make the whole workflow unbuildable with a
 *  keyboard or a screen reader. */
export function Connector({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <span className="h-4 w-px bg-border" aria-hidden />
      {children}
      <span className="h-4 w-px bg-border" aria-hidden />
    </div>
  )
}

/** The card that follows the pointer mid-drag. */
export function StepDragGhost({ step }: { step: BuilderStep }) {
  return (
    // Same measure as the card it replaces (StepCard's own
    // `max-w-[22rem]`). The overlay renders in a portal at the root, so
    // it cannot inherit the canvas's width — pinning it here is what
    // stops the ghost from resizing the moment a drag starts.
    <div className="w-[22rem] max-w-[calc(100vw-2rem)]">
      <StepCard
        step={step}
        selected={false}
        overlay
        onSelect={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />
    </div>
  )
}
