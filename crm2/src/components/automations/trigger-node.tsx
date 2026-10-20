"use client"

import { useTranslations } from "next-intl"
import { ChevronRight, Zap } from "lucide-react"

import { TRIGGER_COLORS } from "@/lib/automations/step-meta"
import { describeTrigger, StepIconChip } from "./step-summary"
import { useResources } from "./resources"
import { validateTriggerForActivation } from "@/lib/automations/validate"
import { cn } from "@/lib/utils"
import type { AutomationTriggerType } from "@/types"

// ------------------------------------------------------------
// The trigger node — the top of the canvas and the answer to "when
// does this start?".
//
// It is drawn as a node rather than as form fields on purpose: the
// question a user has about an automation is never "what is the
// trigger_type enum" but "what will make this fire?". Naming the
// trigger in a sentence, with its configuration spelled out underneath
// (the keywords, the tag, the schedule), answers that without opening
// anything. Clicking it opens the same configuration panel every other
// node uses, so there is exactly one place in the builder where
// settings are edited.
// ------------------------------------------------------------

export function TriggerNode({
  type,
  config,
  selected,
  onSelect,
  className,
}: {
  type: AutomationTriggerType
  config: Record<string, unknown>
  selected: boolean
  onSelect: () => void
  className?: string
}) {
  const t = useTranslations("Automations.builder")
  const lookups = useResources()
  const needsConfig = validateTriggerForActivation(type, config).length > 0

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      className={cn(
        "group/trigger relative flex w-full items-start gap-2.5 rounded-xl border border-border bg-card py-2.5 pr-2.5 pl-3.5 text-left shadow-sm transition-[border-color,box-shadow] duration-150 outline-none hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      style={selected ? { boxShadow: `0 0 0 2px ${TRIGGER_COLORS.ring}` } : undefined}
    >
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[3px] rounded-full"
        style={{ background: TRIGGER_COLORS.solid }}
      />

      <StepIconChip
        icon={Zap}
        solid={TRIGGER_COLORS.solid}
        soft={TRIGGER_COLORS.soft}
        size={30}
        iconSize={15}
        className="mt-0.5"
      />

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span
            className="text-xs leading-tight font-semibold tracking-wide uppercase"
            style={{ color: TRIGGER_COLORS.text }}
          >
            {t("canvas.triggerStarts")}
          </span>
          {needsConfig && (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs leading-tight font-semibold text-amber-700 dark:text-amber-400">
              {t("needsSetup")}
            </span>
          )}
        </span>
        <span className="truncate text-sm leading-tight font-semibold text-foreground">
          {t(`triggers.${type}.label`)}
        </span>
        <span
          className={cn(
            "truncate text-sm leading-snug",
            needsConfig ? "text-muted-foreground italic" : "text-muted-foreground"
          )}
          title={describeTrigger(type, config, t, lookups)}
        >
          {describeTrigger(type, config, t, lookups)}
        </span>
      </span>

      <ChevronRight
        className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover/trigger:translate-x-0.5"
        aria-hidden
      />
    </button>
  )
}
