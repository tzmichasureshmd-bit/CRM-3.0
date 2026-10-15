"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Plus, Search } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  ADDABLE_STEPS,
  STEP_META,
  groupStepsByCategory,
  stepColors,
} from "@/lib/automations/step-meta"
import type { AutomationStepType } from "@/types"
import { cn } from "@/lib/utils"
import { StepIconChip } from "./step-summary"

// ------------------------------------------------------------
// The Add Step menu.
//
// This is the single most important screen in the builder: it is where
// a new user decides what their workflow can even do. The old version
// was thirteen bare names in one flat list — you had to already know
// the product's vocabulary ("is it `send_buttons` or `send_list`?") to
// pick anything, which made the whole feature unreachable for the
// audience it was built for.
//
// Now every option carries icon + name + a sentence about what it
// does, grouped by intent (talk to the customer / update my CRM /
// control what happens next) with a type-ahead filter. Nothing here is
// hidden behind a submenu, so a first-time user can read the whole
// vocabulary of the builder on one screen.
// ------------------------------------------------------------

export function AddStepMenu({
  onPick,
  /** Visual weight: the pill between cards, or the dashed circle. */
  variant = "pill",
  className,
}: {
  onPick: (type: AutomationStepType) => void
  variant?: "pill" | "dot"
  className?: string
}) {
  const t = useTranslations("Automations.builder")
  const [query, setQuery] = useState("")

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (type: AutomationStepType) => {
      if (!q) return true
      // Match on the translated name and the explanation, so typing
      // "tag" finds Add Tag and typing "wait" finds Wait — searching
      // the English blurb directly would break under translation.
      const name = t(`steps.${type}`).toLowerCase()
      const blurb = t(`blurbs.${type}`).toLowerCase()
      return name.includes(q) || blurb.includes(q)
    }
    return groupStepsByCategory(ADDABLE_STEPS.filter(matches))
  }, [query, t])

  const total = groups.reduce((n, g) => n + g.types.length, 0)

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        // Reset the filter between openings so the menu is never
        // remembered as "empty" because of a stale query.
        if (!open) setQuery("")
      }}
    >
      <DropdownMenuTrigger
        className={cn(
          variant === "pill"
            ? "group/add inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-all outline-none hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-primary data-[popup-open]:bg-primary/15 data-[popup-open]:text-primary"
            : "flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-border bg-background text-muted-foreground transition-all outline-none hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-primary data-[popup-open]:bg-primary/20 data-[popup-open]:text-primary",
          className
        )}
        aria-label={t("addStep.label")}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {variant === "pill" ? <span>{t("addStep.label")}</span> : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="center"
        sideOffset={10}
        // The popup defaults to `w-(--anchor-width)`, and the anchor is
        // an 8px-wide circle or a short pill — which collapsed the
        // old menu to a 32px column. An explicit width plus a
        // viewport cap is what makes the descriptions readable and
        // keeps the menu on-screen on a phone. `w-88` is the canvas's
        // one measure (22rem), so the menu is exactly as wide as the
        // card it is adding to and never has to re-wrap its blurbs.
        className="w-88 max-w-[calc(100vw-1.5rem)] overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("addStep.search")}
            aria-label={t("addStep.search")}
            className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
          />
        </div>

        <div className="max-h-[min(26rem,55vh)] overflow-y-auto overscroll-contain p-1">
          {total === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t("addStep.noResults")}
            </p>
          ) : (
            groups.map((group) => (
              <DropdownMenuGroup key={group.id}>
                <DropdownMenuLabel className="px-2 pt-2.5 pb-1 text-xs leading-tight font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(group.labelKey)}
                </DropdownMenuLabel>
                {group.types.map((type) => {
                  const colors = stepColors(type)
                  const Icon = STEP_META[type].icon
                  return (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => onPick(type)}
                      // Two lines of content per row: the stock item
                      // classes centre everything on one line, so the
                      // alignment and padding are overridden here.
                      className="items-start gap-2.5 px-2 py-2"
                    >
                      <StepIconChip
                        icon={Icon}
                        solid={colors.solid}
                        soft={colors.soft}
                        size={30}
                        iconSize={15}
                        className="mt-0.5"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5 text-left">
                        <span className="text-sm leading-tight font-medium text-foreground">
                          {t(`steps.${type}`)}
                        </span>
                        <span className="text-xs leading-snug text-muted-foreground">
                          {t(`blurbs.${type}`)}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
