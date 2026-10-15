"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"

import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type {
  AccountMember,
  CustomField,
  MessageTemplate,
  Tag as TagRecord,
} from "@/types"
import type { StepLookups } from "./step-summary"

// ------------------------------------------------------------
// Account resources (tags, members, approved templates, pipelines).
//
// Loaded once at the builder root and shared via context so the tag /
// agent / template pickers can offer existing resources by name instead
// of asking the user to paste raw UUIDs. Every picker falls back to a
// raw input when its list is empty (fresh account, or an older
// deployment where the table is unreachable), so an automation is
// always authorable — that behaviour is unchanged, it's what keeps the
// builder working on installs with no tags yet.
//
// Extracted from automation-builder.tsx so the step cards, the config
// panel and the add-step menu can all read it without the builder
// orchestrator being in their import graph.
// ------------------------------------------------------------

export interface PipelineOption {
  id: string
  name: string
}

export interface PipelineStageOption {
  id: string
  name: string
  pipeline_id: string
  position: number
}

interface AutomationResources extends StepLookups {
  tags: TagRecord[]
  members: AccountMember[]
  templates: MessageTemplate[]
  customFields: CustomField[]
  pipelines: PipelineOption[]
  stages: PipelineStageOption[]
  /** False once the initial load settles; lets pickers show a quiet
   *  placeholder instead of flashing an empty dropdown. */
  loaded: boolean
}

const ResourcesContext = createContext<AutomationResources>({
  tags: [],
  members: [],
  templates: [],
  customFields: [],
  pipelines: [],
  stages: [],
  loaded: false,
  tagName: () => null,
  agentName: () => null,
  pipelineName: () => null,
  stageName: () => null,
})

export function useResources(): AutomationResources {
  return useContext(ResourcesContext)
}

export function ResourcesProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<TagRecord[]>([])
  const [members, setMembers] = useState<AccountMember[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [pipelines, setPipelines] = useState<PipelineOption[]>([])
  const [stages, setStages] = useState<PipelineStageOption[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    // Tags, templates and custom fields come straight from the DB — RLS
    // scopes them to the caller's account. Only APPROVED templates can
    // actually be sent (anything else 400s at send time), matching the
    // broadcast picker.
    void (async () => {
      const [tagsRes, templatesRes, customFieldsRes, pipelinesRes, stagesRes] =
        await Promise.all([
          supabase.from("tags").select("*").order("name"),
          supabase
            .from("message_templates")
            .select("*")
            .eq("status", "APPROVED")
            .order("name"),
          supabase.from("custom_fields").select("*").order("field_name"),
          supabase.from("pipelines").select("id, name").order("name"),
          supabase
            .from("pipeline_stages")
            .select("id, name, pipeline_id, position")
            .order("position"),
        ])
      if (cancelled) return
      setTags((tagsRes.data as TagRecord[] | null) ?? [])
      setTemplates((templatesRes.data as MessageTemplate[] | null) ?? [])
      setCustomFields((customFieldsRes.data as CustomField[] | null) ?? [])
      setPipelines((pipelinesRes.data as PipelineOption[] | null) ?? [])
      setStages((stagesRes.data as PipelineStageOption[] | null) ?? [])
      if (!cancelled) setLoaded(true)
    })()

    // Members go through the API so we inherit its email-visibility
    // rules (agents/viewers don't see emails). Unreachable on older
    // deployments → pickers fall back to a raw agent-id input.
    void (async () => {
      try {
        const res = await fetch("/api/account/members", { cache: "no-store" })
        if (!res.ok) return
        const json = (await res.json()) as { members?: AccountMember[] }
        if (!cancelled) setMembers(json.members ?? [])
      } catch {
        // Members endpoint absent — caller falls back to raw input.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Resolvers for the summary lines. `?? null` throughout: a summary
  // that can't resolve a name shows it as unavailable rather than
  // rendering "undefined" into a card.
  const value = useMemo<AutomationResources>(() => {
    // Resolvers return the DISPLAY NAME, never the record: the summary
    // lines put whatever these return straight into a card, so handing
    // back a whole row would stringify the object.
    const nameOf =
      <R extends { id: string }>(list: R[], pick: (row: R) => string | null) =>
      (id: string): string | null => {
        const row = list.find((x) => x.id === id)
        return row ? pick(row) : null
      }
    return {
      tags,
      members,
      templates,
      customFields,
      pipelines,
      stages,
      loaded,
      tagName: nameOf(tags, (row) => row.name),
      agentName: (id) => {
        const m = members.find((x) => x.user_id === id)
        return m ? m.full_name || m.email || m.user_id : null
      },
      pipelineName: nameOf(pipelines, (row) => row.name),
      stageName: nameOf(stages, (row) => row.name),
    }
  }, [tags, members, templates, customFields, pipelines, stages, loaded])

  return (
    <ResourcesContext.Provider value={value}>{children}</ResourcesContext.Provider>
  )
}

// ------------------------------------------------------------
// Form primitives
//
// The builder used raw <select> elements styled with an ad-hoc class
// string in four different places. The shared FIELD_CLASS is what
// replaced that: one control height, one focus ring, one disabled
// treatment, so a dropdown can't accidentally look like a text input.
// Base UI's Select is used for the new pickers; native <select> is
// kept where it is already in place, since it behaves correctly on
// mobile and the existing lookups already work.
// ------------------------------------------------------------

export const FIELD_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** Tag dropdown by name + color, storing the tag's id. Falls back to a
 *  raw id input when no tags exist yet. */
export function TagSelect({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  const t = useTranslations("Automations.builder")
  const { tags } = useResources()

  if (tags.length === 0) {
    return (
      <Input
        id={id}
        placeholder={t("tags.placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  const selected = tags.find((tg) => tg.id === value)
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: selected?.color ?? "transparent" }}
        aria-hidden
      />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD_CLASS}
      >
        <option value="">{t("tags.select")}</option>
        {tags.map((tg) => (
          <option key={tg.id} value={tg.id}>
            {tg.name}
          </option>
        ))}
        {/* Preserve a saved tag that's since been deleted so editing an
            existing automation doesn't silently drop it. */}
        {value && !selected && <option value={value}>{t("tags.unknown", { id: value })}</option>}
      </select>
    </div>
  )
}

/** Contact-field dropdown for "Update Contact Field": built-in columns
 *  plus any account custom fields (stored as `custom:<id>`). A saved
 *  custom field that's since been deleted is preserved as a labelled
 *  option so editing an existing automation doesn't silently drop it. */
export function ContactFieldSelect({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  const t = useTranslations("Automations.builder")
  const { customFields } = useResources()
  const customValue = value.startsWith("custom:") ? value : ""
  const knownCustom =
    customValue && customFields.some((f) => `custom:${f.id}` === customValue)

  return (
    <select
      id={id}
      value={value || "name"}
      onChange={(e) => onChange(e.target.value)}
      className={FIELD_CLASS}
    >
      <option value="name">{t("fields.name")}</option>
      <option value="email">{t("fields.email")}</option>
      <option value="company">{t("fields.company")}</option>
      {customFields.length > 0 && (
        <optgroup label={t("fields.customFields")}>
          {customFields.map((f) => (
            <option key={f.id} value={`custom:${f.id}`}>
              {f.field_name}
            </option>
          ))}
        </optgroup>
      )}
      {customValue && !knownCustom && (
        <option value={customValue}>{t("fields.unknown", { id: customValue })}</option>
      )}
    </select>
  )
}

/** Agent dropdown by name, storing the member's user_id. Falls back to
 *  a raw id input when the member list is unavailable. */
export function AgentSelect({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  const t = useTranslations("Automations.builder")
  const { members } = useResources()

  if (members.length === 0) {
    return (
      <Input
        id={id}
        placeholder={t("agents.placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  const selected = members.find((m) => m.user_id === value)
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={FIELD_CLASS}
    >
      <option value="">{t("agents.select")}</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.full_name || m.email || m.user_id}
        </option>
      ))}
      {value && !selected && (
        <option value={value}>{t("agents.unknown", { id: value })}</option>
      )}
    </select>
  )
}

/** Pipeline + stage picker for Create Deal. The automation stores ids
 *  because the engine writes directly to deals, but authors choose by
 *  name. */
export function DealPipelineFields({
  pipelineId,
  stageId,
  onChange,
}: {
  pipelineId: string
  stageId: string
  onChange: (patch: { pipeline_id: string; stage_id: string }) => void
}) {
  const t = useTranslations("Automations.builder")
  const { pipelines, stages } = useResources()

  if (pipelines.length === 0) {
    return (
      <>
        <Field label={t("pipelines.pipelineIdLabel")}>
          <Input
            value={pipelineId}
            onChange={(e) => onChange({ pipeline_id: e.target.value, stage_id: stageId })}
          />
        </Field>
        <Field label={t("pipelines.stageIdLabel")}>
          <Input
            value={stageId}
            onChange={(e) => onChange({ pipeline_id: pipelineId, stage_id: e.target.value })}
          />
        </Field>
      </>
    )
  }

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId)
  const stageOptions = stages.filter((s) => s.pipeline_id === pipelineId)
  const selectedStage = stageOptions.find((s) => s.id === stageId)

  return (
    <>
      <Field label={t("pipelines.pipelineLabel")}>
        <select
          value={pipelineId}
          onChange={(e) => {
            const nextPipelineId = e.target.value
            const firstStage = stages.find((s) => s.pipeline_id === nextPipelineId)
            onChange({ pipeline_id: nextPipelineId, stage_id: firstStage?.id ?? "" })
          }}
          className={FIELD_CLASS}
        >
          <option value="">{t("pipelines.selectPipeline")}</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {pipelineId && !selectedPipeline && (
            <option value={pipelineId}>
              {t("pipelines.unknownPipeline", { id: pipelineId })}
            </option>
          )}
        </select>
      </Field>
      <Field label={t("pipelines.stageLabel")}>
        <select
          value={stageId}
          onChange={(e) => onChange({ pipeline_id: pipelineId, stage_id: e.target.value })}
          className={FIELD_CLASS}
          disabled={!pipelineId || stageOptions.length === 0}
        >
          <option value="">
            {pipelineId
              ? t("pipelines.selectStage")
              : t("pipelines.selectPipelineFirst")}
          </option>
          {stageOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {stageId && pipelineId && !selectedStage && (
            <option value={stageId}>{t("pipelines.unknownStage", { id: stageId })}</option>
          )}
        </select>
      </Field>
    </>
  )
}

/** Template dropdown showing approved templates by name + language,
 *  storing both template_name and language. Falls back to manual name
 *  + language inputs when no approved templates are synced yet. */
export function SendTemplateFields({
  templateName,
  language,
  onChange,
}: {
  templateName: string
  language: string
  onChange: (patch: { template_name: string; language: string }) => void
}) {
  const t = useTranslations("Automations.builder")
  const { templates } = useResources()

  if (templates.length === 0) {
    return (
      <>
        <Field label={t("templates.templateNameLabel")} hint={t("templates.approvedHint")}>
          <Input
            value={templateName}
            onChange={(e) => onChange({ template_name: e.target.value, language })}
          />
        </Field>
        <Field label={t("templates.languageLabel")}>
          <Input
            value={language}
            onChange={(e) => onChange({ template_name: templateName, language: e.target.value })}
          />
        </Field>
      </>
    )
  }

  // Encode name + language in the option value so two templates that
  // share a name across languages stay distinct.
  const toValue = (name: string, lang: string) => `${name}::${lang}`
  const current = templateName ? toValue(templateName, language) : ""
  const hasMatch = templates.some(
    (tmpl) => toValue(tmpl.name, tmpl.language ?? "en_US") === current
  )

  return (
    <Field label={t("templates.templateLabel")} hint={t("templates.approvedHint")}>
      <select
        value={current}
        onChange={(e) => {
          const [name, lang] = e.target.value.split("::")
          onChange({ template_name: name ?? "", language: lang ?? "" })
        }}
        className={FIELD_CLASS}
      >
        <option value="">{t("templates.select")}</option>
        {templates.map((tmpl) => {
          const lang = tmpl.language ?? "en_US"
          return (
            <option key={tmpl.id} value={toValue(tmpl.name, lang)}>
              {tmpl.name} ({lang})
            </option>
          )
        })}
        {current && !hasMatch && (
          <option value={current}>
            {t("templates.unknown", {
              name: templateName,
              lang: language || t("templates.unknownLang"),
            })}
          </option>
        )}
      </select>
    </Field>
  )
}
