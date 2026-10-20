"use client"

import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, ChevronDown, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { InteractiveBuilder } from "@/components/interactive/interactive-builder"
import { DOCK_PANEL_QUERY, useMatchMedia } from "@/hooks/use-match-media"
import {
  asInteractive,
  toStepConfig,
  type BuilderStep,
} from "@/lib/automations/builder-model"
import { STEP_META, TRIGGER_COLORS, stepColors, stepEyebrow } from "@/lib/automations/step-meta"
import { stepIssueKeys, triggerIssueKeys } from "@/lib/automations/readiness"
import { validateTriggerForActivation } from "@/lib/automations/validate"
import { cn } from "@/lib/utils"
import type { AutomationTriggerType } from "@/types"
import {
  AgentSelect,
  ContactFieldSelect,
  DealPipelineFields,
  FIELD_CLASS,
  Field,
  SendTemplateFields,
  TagSelect,
} from "./resources"
import { StepIconChip } from "./step-summary"

// ------------------------------------------------------------
// The configuration panel — the only place in the builder where
// anything is edited.
//
// Two shells, one body:
//
//   >= lg   docked as a right-hand column beside the canvas
//   < lg   a bottom sheet over the canvas
//
// One body means a step configured on a phone is configured exactly the
// way it is on a desktop, and the mobile layout gets a full-width form
// with a keyboard-aware sheet for free.
//
// The shell is chosen in JS rather than by `hidden lg:block` on two
// copies. Hiding one would leave two controlled copies of the same form
// in the DOM — duplicate `label[for]`, duplicate ids, and the invisible
// one still bound to the same state. Mounting exactly one avoids all of
// that; see `useMatchMedia`.
//
// The brief for this panel was "no technical JSON, no confusing
// fields". Concretely: every control is labelled in the user's language,
// every control says what it does, the header repeats the step's
// one-line purpose so the user never has to look back at the canvas to
// remember what they are editing, and readiness problems are shown as a
// localized sentence instead of a validator's English message. No
// config object is ever rendered as a string.
// ------------------------------------------------------------

export type ConfigTarget =
  | { kind: "trigger" }
  | { kind: "step"; step: BuilderStep }
  | null

export function ConfigPanel({
  target,
  onClose,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  triggerType,
  triggerConfig,
  onTriggerChange,
  onStepChange,
  onDeleteStep,
  onDuplicateStep,
}: {
  target: ConfigTarget
  onClose: () => void
  name: string
  description: string
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  triggerType: AutomationTriggerType
  triggerConfig: Record<string, unknown>
  onTriggerChange: (type: AutomationTriggerType, config: Record<string, unknown>) => void
  onStepChange: (step: BuilderStep) => void
  onDeleteStep?: () => void
  onDuplicateStep?: () => void
}) {
  const t = useTranslations("Automations.builder")
  const docked = useMatchMedia(DOCK_PANEL_QUERY)
  const open = target !== null

  const body = (
    <ConfigBody
      target={target}
      name={name}
      description={description}
      onNameChange={onNameChange}
      onDescriptionChange={onDescriptionChange}
      triggerType={triggerType}
      triggerConfig={triggerConfig}
      onTriggerChange={onTriggerChange}
      onStepChange={onStepChange}
      onDeleteStep={onDeleteStep}
      onDuplicateStep={onDuplicateStep}
    />
  )

  if (docked) {
    return (
      <aside
        className="hidden w-[23rem] shrink-0 border-l border-border bg-muted/15 lg:block"
        aria-label={t("configPanel.label")}
      >
        {/* `h-full` + `min-h-0`, not `sticky` + a hard-coded
            `100dvh - var(--app-header-h)`. Two things were wrong with
            the arithmetic: `--app-header-h` is not defined anywhere in
            this app, so the fallback always won, and the fallback
            (3.5rem) is smaller than the real header (36px of control
            plus `py-3` either side and a border ≈ 61px), so the panel
            was a few pixels taller than the row it lives in and spilled
            past the bottom of the viewport. It was also `sticky` inside
            an ancestor that never scrolls, which does nothing.

            The row above is a flex item that is already exactly the
            height of the space under the header, so `h-full` tracks the
            real header height at every breakpoint and at every zoom
            level, and `min-h-0` lets the form below it actually scroll. */}
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {body}
        </div>
      </aside>
    )
  }

  return (
    // A definite height, because `h-full` inside the panel resolves
    // against it. With only `max-h-[88dvh]` the sheet's height was
    // auto, so the percentage had nothing to resolve against, the
    // panel grew to its content, and `max-h` then clipped the bottom
    // of it — taking the delete/duplicate footer with it, and leaving
    // the form's fields overlapping the footer where it did show.
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[88dvh] max-h-[88dvh] gap-0 overflow-hidden p-0"
      >
        <SheetTitle className="sr-only">{t("configPanel.label")}</SheetTitle>
        <SheetDescription className="sr-only">{t("configPanel.label")}</SheetDescription>
        {body}
      </SheetContent>
    </Sheet>
  )
}

function ConfigBody({
  target,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  triggerType,
  triggerConfig,
  onTriggerChange,
  onStepChange,
  onDeleteStep,
  onDuplicateStep,
}: {
  target: ConfigTarget
  name: string
  description: string
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  triggerType: AutomationTriggerType
  triggerConfig: Record<string, unknown>
  onTriggerChange: (type: AutomationTriggerType, config: Record<string, unknown>) => void
  onStepChange: (step: BuilderStep) => void
  onDeleteStep?: () => void
  onDuplicateStep?: () => void
}) {
  const t = useTranslations("Automations.builder")

  // Unconditional from here down: an early return above these calls
  // would make the hook count depend on `target`, which is exactly the
  // kind of thing that survives review and then throws "rendered more
  // hooks than during the previous render" the first time a user opens
  // a step.
  if (!target) {
    // Not a dead end: this is where the workflow's own identity is
    // edited. The name also lives in the header, but the description has
    // no other home, and the old builder's description field is what
    // explains a workflow to whoever inherits it six months later.
    return (
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4">
        <Field label={t("details.name")}>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t("details.namePlaceholder")}
            aria-label={t("details.name")}
          />
        </Field>
        <Field label={t("details.description")} hint={t("details.hint")}>
          <Textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder={t("details.descriptionPlaceholder")}
            aria-label={t("details.description")}
            rows={4}
          />
        </Field>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("configPanel.emptyBody")}
        </p>
      </div>
    )
  }

  if (target.kind === "trigger") {
    return (
      <PanelFrame
        eyebrow={t("configPanel.whenItStarts")}
        title={t(`triggers.${triggerType}.label`)}
        description={t(`triggers.${triggerType}.hint`)}
        icon={Zap}
        solid={TRIGGER_COLORS.solid}
        soft={TRIGGER_COLORS.soft}
        issueKeys={triggerIssueKeys(validateTriggerForActivation(triggerType, triggerConfig))}
      >
        <TriggerConfigFields
          type={triggerType}
          config={triggerConfig}
          onChange={onTriggerChange}
        />
      </PanelFrame>
    )
  }

  const { step } = target
  const colors = stepColors(step.step_type)
  return (
    <PanelFrame
      eyebrow={t(`eyebrows.${stepEyebrow(step.step_type)}`)}
      title={t(`steps.${step.step_type}`)}
      description={t(`blurbs.${step.step_type}`)}
      icon={STEP_META[step.step_type].icon}
      solid={colors.solid}
      soft={colors.soft}
      issueKeys={stepIssueKeys(step)}
      onDelete={onDeleteStep}
      onDuplicate={onDuplicateStep}
    >
      <StepConfigFields step={step} onChange={onStepChange} />
    </PanelFrame>
  )
}

/** The panel's shared chrome: what am I editing, what is still missing,
 *  the form, then the destructive actions. */
function PanelFrame({
  eyebrow,
  title,
  description,
  icon: Icon,
  solid,
  soft,
  issueKeys,
  children,
  onDelete,
  onDuplicate,
}: {
  eyebrow: string
  title: string
  description: string
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
  solid: string
  soft: string
  /** `Automations.readiness.*` keys. */
  issueKeys: string[]
  children: ReactNode
  onDelete?: () => void
  onDuplicate?: () => void
}) {
  const t = useTranslations("Automations.builder")
  const r = useTranslations("Automations.readiness")

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-start gap-3 border-b border-border p-4">
        <StepIconChip icon={Icon} solid={solid} soft={soft} size={36} iconSize={18} />
        <div className="min-w-0 flex-1">
          <div
            className="text-xs leading-tight font-semibold tracking-wide uppercase"
            style={{ color: solid }}
          >
            {eyebrow}
          </div>
          <div className="mt-1 text-sm leading-tight font-semibold text-foreground">{title}</div>
          <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{description}</p>
        </div>
      </div>

      {issueKeys.length > 0 ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-amber-500/25 bg-amber-500/8 px-4 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="min-w-0 text-sm leading-snug">
            <span className="font-medium text-foreground">{t("configPanel.notReady")}</span>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
              {issueKeys.map((key) => (
                <li key={key}>{r(key as Parameters<typeof r>[0])}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">{children}</div>

      {onDelete || onDuplicate ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border p-3">
          {onDuplicate ? (
            <Button variant="ghost" size="sm" onClick={onDuplicate}>
              {t("duplicateStep")}
            </Button>
          ) : (
            <span />
          )}
          {onDelete ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              {t("deleteStep")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------
// Trigger fields
// ------------------------------------------------------------

const TRIGGER_OPTIONS: AutomationTriggerType[] = [
  "new_message_received",
  "first_inbound_message",
  "keyword_match",
  "interactive_reply",
  "new_contact_created",
  "conversation_assigned",
  "tag_added",
  "time_based",
]

function TriggerConfigFields({
  type,
  config,
  onChange,
}: {
  type: AutomationTriggerType
  config: Record<string, unknown>
  onChange: (type: AutomationTriggerType, config: Record<string, unknown>) => void
}) {
  const t = useTranslations("Automations.builder")

  return (
    <div className="space-y-4">
      <Field label={t("triggerType")} hint={t("triggerTypeHint")}>
        <EnumSelect
          value={type}
          onChange={(next) => onChange(next as AutomationTriggerType, config)}
          options={TRIGGER_OPTIONS.map((option) => ({
            value: option,
            label: t(`triggers.${option}.label`),
          }))}
        />
      </Field>

      {type === "keyword_match" ? (
        <KeywordMatchFields config={config} onChange={(next) => onChange(type, next)} />
      ) : null}
      {type === "interactive_reply" ? (
        <ListDraftField
          label={t("replyIds")}
          hint={t("replyIdsHelp")}
          placeholder={t("replyIdsPlaceholder")}
          seed={asStringArray(config.reply_ids).join(", ")}
          onCommit={(reply_ids) => onChange(type, { ...config, reply_ids })}
        />
      ) : null}
      {type === "tag_added" ? (
        <Field label={t("config.tagLabel")} hint={t("config.tagHint")}>
          <TagSelect
            value={asString(config.tag_id)}
            onChange={(tag_id) => onChange(type, { ...config, tag_id })}
          />
        </Field>
      ) : null}
      {type === "time_based" ? (
        <Field label={t("schedule")} hint={t("scheduleHint")}>
          <Input
            placeholder={t("schedulePlaceholder")}
            value={asString(config.schedule)}
            onChange={(e) => onChange(type, { ...config, schedule: e.target.value })}
          />
        </Field>
      ) : null}
    </div>
  )
}

/** Comma-separated keyword entry.
 *
 *  Held in a local draft and parsed on blur / Enter rather than on every
 *  keystroke: parsing inline strips the trailing comma and space the
 *  user is mid-way through typing, which makes multi-word,
 *  comma-separated entry impossible to type at all. */
function KeywordMatchFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}) {
  const t = useTranslations("Automations.builder")

  return (
    <>
      <ListDraftField
        label={t("keywords")}
        hint={t("keywordsHint")}
        placeholder={t("keywordsPlaceholder")}
        seed={asStringArray(config.keywords).join(", ")}
        onCommit={(keywords) => onChange({ ...config, keywords })}
      />
      <Field label={t("config.matchType")} hint={t("config.matchTypeHint")}>
        <EnumSelect
          value={asString(config.match_type) || "contains"}
          onChange={(next) => onChange({ ...config, match_type: next })}
          options={[
            { value: "contains", label: t("config.matchContains") },
            { value: "exact", label: t("config.matchExact") },
          ]}
        />
      </Field>
    </>
  )
}

/**
 * A comma-separated list field that keeps its own draft text.
 *
 * Split out because the keyword trigger, the interactive-reply trigger
 * and (later) condition operands all want identical behaviour, and
 * three copies of the same parse-on-blur logic is three chances to
 * regress the trailing-comma case.
 */
function ListDraftField({
  label,
  hint,
  placeholder,
  seed,
  onCommit,
}: {
  label: string
  hint?: string
  placeholder?: string
  /** The canonical value, joined for display. */
  seed: string
  onCommit: (parsed: string[]) => void
}) {
  const draft = useListDraft(seed, onCommit)
  return (
    <Field label={label} hint={hint}>
      <Input
        value={draft.value}
        placeholder={placeholder}
        onChange={(e) => draft.set(e.target.value)}
        onBlur={draft.commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            draft.commit()
          }
        }}
      />
    </Field>
  )
}

/**
 * Keeps a draft string in sync with the canonical value held in the tree.
 *
 * The `editing` flag is what makes this usable: the parse on commit
 * re-formats `"a, b"` into `"a,b"`, and a naive sync would yank that
 * space back out from under the cursor on the very next keystroke. While
 * the field has focus the tree's value is ignored; when it loses focus
 * the normalised form wins.
 */
function useListDraft(seed: string, onCommit: (parsed: string[]) => void) {
  const [value, setValue] = useState(seed)
  const [editing, setEditing] = useState(false)

  // The handler closes over the current step's config, which changes
  // identity on every keystroke elsewhere in the panel; a ref keeps it
  // out of the way. Synced in an effect rather than during render — a
  // ref written during render is a value the renderer is not allowed to
  // depend on, and the commit always happens from a user event, long
  // after effects have run.
  const commitRef = useRef(onCommit)
  useEffect(() => {
    commitRef.current = onCommit
  })

  // Adopt the canonical value while the field is idle, as state
  // adjustment during render rather than in an effect: selecting a
  // different step must not leave the previous step's keywords in the
  // box, and an effect that writes state on every seed change is one
  // render behind the value it is trying to show.
  const [syncedSeed, setSyncedSeed] = useState(seed)
  if (!editing && seed !== syncedSeed) {
    setSyncedSeed(seed)
    setValue(seed)
  }

  return {
    value,
    set(next: string) {
      setEditing(true)
      setValue(next)
    },
    commit() {
      const parsed = value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
      setEditing(false)
      setValue(parsed.join(", "))
      commitRef.current(parsed)
    },
  }
}

// ------------------------------------------------------------
// Step fields
// ------------------------------------------------------------

function StepConfigFields({
  step,
  onChange,
}: {
  step: BuilderStep
  onChange: (step: BuilderStep) => void
}) {
  const t = useTranslations("Automations.builder")
  const cfg = step.step_config
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...step, step_config: { ...cfg, ...patch } })

  switch (step.step_type) {
    case "send_message":
      return (
        <Field label={t("config.messageText")} hint={t("config.messageTextHint")}>
          <Textarea
            value={asString(cfg.text)}
            onChange={(e) => set({ text: e.target.value })}
            placeholder={t("config.placeholderMessageText")}
            className="min-h-28 resize-y"
          />
        </Field>
      )

    case "send_buttons":
    case "send_list":
      // The whole step_config IS the interactive payload, so the shared
      // builder edits it in place — including Meta's limits and the
      // phone preview, which the old inline form did not have.
      return (
        <InteractiveBuilder
          value={asInteractive(cfg)}
          onChange={(payload) => onChange({ ...step, step_config: toStepConfig(payload) })}
        />
      )

    case "send_template":
      return (
        <SendTemplateFields
          templateName={asString(cfg.template_name)}
          language={asString(cfg.language)}
          onChange={set}
        />
      )

    case "add_tag":
    case "remove_tag":
      return (
        <Field label={t("config.tagLabel")} hint={t("config.tagHint")}>
          <TagSelect
            value={asString(cfg.tag_id)}
            onChange={(tag_id) => set({ tag_id })}
          />
        </Field>
      )

    case "assign_conversation":
      return (
        <>
          <Field label={t("config.modeLabel")} hint={t("config.modeHint")}>
            <EnumSelect
              value={asString(cfg.mode) || "round_robin"}
              onChange={(mode) => set({ mode })}
              options={[
                { value: "round_robin", label: t("config.modes.round_robin") },
                { value: "specific", label: t("config.modes.specific") },
              ]}
            />
          </Field>
          {cfg.mode === "specific" ? (
            <Field label={t("config.agentLabel")} hint={t("config.agentHint")}>
              <AgentSelect
                value={asString(cfg.agent_id)}
                onChange={(agent_id) => set({ agent_id })}
              />
            </Field>
          ) : null}
        </>
      )

    case "update_contact_field":
      return (
        <>
          <Field label={t("config.fieldLabel")} hint={t("config.fieldHint")}>
            <ContactFieldSelect
              value={asString(cfg.field)}
              onChange={(field) => set({ field })}
            />
          </Field>
          <Field label={t("config.valueLabel")} hint={t("config.valueHint")}>
            <Input
              value={asString(cfg.value)}
              onChange={(e) => set({ value: e.target.value })}
              placeholder={t("config.placeholderValue")}
            />
          </Field>
        </>
      )

    case "create_deal":
      return (
        <>
          <DealPipelineFields
            pipelineId={asString(cfg.pipeline_id)}
            stageId={asString(cfg.stage_id)}
            onChange={set}
          />
          <Field label={t("config.titleLabel")} hint={t("config.titleHint")}>
            <Input
              value={asString(cfg.title)}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={t("config.placeholderTitle")}
            />
          </Field>
          <Field label={t("config.valueLabel")} hint={t("config.dealValueHint")}>
            <Input
              type="number"
              min={0}
              value={typeof cfg.value === "number" ? cfg.value : 0}
              onChange={(e) => set({ value: Number(e.target.value) })}
            />
          </Field>
        </>
      )

    case "wait":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("config.amountLabel")}>
            <Input
              type="number"
              min={1}
              value={typeof cfg.amount === "number" ? cfg.amount : 1}
              onChange={(e) => set({ amount: Math.max(1, Number(e.target.value)) })}
            />
          </Field>
          <Field label={t("config.unitLabel")}>
            <EnumSelect
              value={asString(cfg.unit) || "hours"}
              onChange={(unit) => set({ unit })}
              options={[
                { value: "minutes", label: t("config.units.minutes") },
                { value: "hours", label: t("config.units.hours") },
                { value: "days", label: t("config.units.days") },
              ]}
            />
          </Field>
        </div>
      )

    case "condition": {
      const subject = asString(cfg.subject) || "tag_presence"
      return (
        <>
          <Field
            label={t("config.subjectLabel")}
            hint={t(`config.subjectHints.${subject}` as Parameters<typeof t>[0])}
          >
            <EnumSelect
              value={subject}
              onChange={(next) => set({ subject: next })}
              options={[
                { value: "tag_presence", label: t("config.subjects.tag_presence") },
                { value: "contact_field", label: t("config.subjects.contact_field") },
                { value: "message_content", label: t("config.subjects.message_content") },
                { value: "time_of_day", label: t("config.subjects.time_of_day") },
              ]}
            />
          </Field>
          <Field
            label={t("config.operandLabel")}
            hint={t(`config.operandHints.${subject}` as Parameters<typeof t>[0])}
          >
            <Input
              placeholder={t(`config.operandPlaceholders.${subject}` as Parameters<typeof t>[0])}
              value={asString(cfg.operand)}
              onChange={(e) => set({ operand: e.target.value })}
            />
          </Field>
          {subject === "contact_field" || subject === "message_content" ? (
            <Field label={t("config.valueLabel")} hint={t("config.conditionValueHint")}>
              <Input
                value={asString(cfg.value)}
                onChange={(e) => set({ value: e.target.value })}
              />
            </Field>
          ) : null}
        </>
      )
    }

    case "send_webhook":
      return (
        <>
          <Field label={t("config.urlLabel")} hint={t("config.urlHint")}>
            <Input
              placeholder="https://example.com/hook"
              value={asString(cfg.url)}
              onChange={(e) => set({ url: e.target.value })}
            />
          </Field>
          <Field label={t("config.bodyTemplateLabel")} hint={t("config.bodyTemplateHint")}>
            <Textarea
              value={asString(cfg.body_template)}
              onChange={(e) => set({ body_template: e.target.value })}
              placeholder={t("config.placeholderBody")}
              className="min-h-24 resize-y font-mono text-xs"
            />
          </Field>
        </>
      )

    case "close_conversation":
      // Nothing to configure, so the panel says so rather than showing
      // an empty form the user has to guess at.
      return (
        <p className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          {t("config.closeConversationHint")}
        </p>
      )

    default:
      return null
  }
}

// ------------------------------------------------------------
// Small local helpers
// ------------------------------------------------------------

/**
 * A native `<select>` in the panel's own field style.
 *
 * Native rather than the Base UI `Select`: on a phone a native select
 * opens the OS picker, which is the one interaction a user never has to
 * learn. The chevron is drawn by hand because `appearance-none` is what
 * lets the arrow be positioned at all.
 */
function EnumSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(FIELD_CLASS, "appearance-none pr-8")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
