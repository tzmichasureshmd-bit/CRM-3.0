"use client"

import { useTranslations } from "next-intl"
import { CornerDownRight } from "lucide-react"

import type { BuilderStep } from "@/lib/automations/builder-model"
import { cn } from "@/lib/utils"
import { FlowLane, type LaneHandlers } from "./flow-lane"

// ------------------------------------------------------------
// A condition's two branches.
//
// This is the hardest part of the canvas to read, and it is where
// "what happens next" becomes "which path is followed". The old
// version stacked two columns under a bare "Yes" / "No" text label
// with no connection drawn at all, so on a laptop the two columns read
// as two unrelated lists of cards.
//
// Now the fork is drawn: a stub leaves the bottom of the condition,
// splits, and drops into each column beneath a labelled header. The
// same YES / NO language is repeated on the condition card's own
// summary, so the answer is legible without opening anything.
//
// Layout note: a viewport breakpoint cannot decide whether the two
// columns fit, because a condition nested inside another condition's
// branch is a fraction of the screen and `sm:grid-cols-2` would split
// it anyway, leaving two columns too narrow to render a step in. A
// CONTAINER query can — it measures the condition card itself, which is
// the thing that has to hold both columns.
// ------------------------------------------------------------

export function BranchForks({ step, ...handlers }: LaneHandlers & { step: BuilderStep }) {
  const t = useTranslations("Automations.builder")
  const yes = step.branches?.yes ?? []
  const no = step.branches?.no ?? []

  return (
    <div className="@container mt-2 w-full">
      {/* Wide layout: the two-column fork. Drawn to the exact centre of
          each column — the grid below uses `gap-3` (12px), so each
          column centre sits 3px inboard of the quarter marks. The
          calc() offsets are what keeps the fork aligned with the
          columns instead of leaving it 3px adrift of both.

          The split is `@lg` (32rem), not the usual `@sm` (24rem). This
          container is the condition's lane box, which is as wide as the
          canvas column (~640px) and only narrows to the card's 22rem
          (352px) on a phone — so `@lg` is the threshold at which two
          columns plus a 12px gap can actually hold a step card, and
          below it the layout falls back to one stacked column and the
          "two paths" hint. `@sm`'s 24rem would have split a 352px
          card into two 170px columns that cannot render a step. */}
      <div className="relative mx-auto hidden h-6 w-full @lg:block" aria-hidden>
        <span className="absolute top-0 left-1/2 h-3 w-px -translate-x-1/2 bg-border" />
        <span className="absolute top-3 left-[calc(25%-3px)] h-px w-[calc(50%+6px)] bg-border" />
        <span className="absolute top-3 left-[calc(25%-3px)] h-3 w-px bg-border" />
        <span className="absolute top-3 left-[calc(75%+3px)] h-3 w-px bg-border" />
      </div>

      <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
        <BranchColumn
          label={t("branches.yes")}
          caption={t("branches.yesCaption")}
          tone="yes"
        >
          <FlowLane
            steps={yes}
            scope={{ kind: "branch", parentCid: step.cid, branch: "yes" }}
            emptyState={<EmptyPath hint={t("branches.emptyYes")} />}
            {...handlers}
          />
        </BranchColumn>

        <BranchColumn
          label={t("branches.no")}
          caption={t("branches.noCaption")}
          tone="no"
        >
          <FlowLane
            steps={no}
            scope={{ kind: "branch", parentCid: step.cid, branch: "no" }}
            emptyState={<EmptyPath hint={t("branches.emptyNo")} />}
            {...handlers}
          />
        </BranchColumn>
      </div>

      {/* Stacked layout (narrow card): the fork bar is hidden, so this
          replaces it — it is what tells the reader that BOTH columns
          hang off the condition rather than continuing the main
          column. */}
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 px-2 text-center text-sm leading-snug text-muted-foreground @lg:hidden">
        <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t("branches.twoPaths")}
      </p>
    </div>
  )
}

/** The fork bar above is drawn by BranchForks, so a column owns only
 *  its header. `tone` is the colour language shared with the YES / NO
 *  pills on the condition card. */
function BranchColumn({
  label,
  caption,
  tone,
  children,
}: {
  label: string
  caption: string
  tone: "yes" | "no"
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      {/* `max-w-full` + `flex-wrap` are load-bearing. A one-line pill
          holding the label plus a whole caption sentence is wider than
          the column it sits in, and a non-wrapping flex row just
          overflows: the YES caption ran straight through the NO
          column's cards. Wrapping turns that into a two-line pill
          instead. `text-center` because the column centres it. */}
      <div
        className={cn(
          "mb-2 inline-flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-full border px-2.5 py-1 text-center text-xs leading-snug font-semibold tracking-wide uppercase",
          tone === "yes"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
        )}
      >
        {label}
        <span className="font-normal tracking-normal normal-case opacity-70">{caption}</span>
      </div>
      {children}
    </div>
  )
}

/** What a branch looks like before the user has put anything in it.
 *  The "+" that inserts into it is rendered by FlowLane just above. */
function EmptyPath({ hint }: { hint: string }) {
  return (
    <div className="w-full max-w-[22rem] rounded-xl border border-dashed border-border bg-muted/30 px-3 py-3 text-center">
      <p className="text-sm leading-snug text-muted-foreground">{hint}</p>
    </div>
  )
}
