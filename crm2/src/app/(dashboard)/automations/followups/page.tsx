"use client"

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import {
  Activity,
  Archive,
  Bot,
  CalendarDays,
  Clock,
  Eye,
  Filter,
  History,
  Layers,
  Loader2,
  MessageSquare,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { describeError } from "@/lib/errors"
import { useTranslations } from "next-intl"
import type {
  AiFollowup,
  AiFollowupExecution,
  AiFollowupStatus,
  AiFollowupTriggerType,
  CustomField,
  Tag,
} from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyState } from "@/components/shared"

const TRIGGER_TYPES: { value: AiFollowupTriggerType; labelKey: string }[] = [
  { value: "manual", labelKey: "triggers.manual" },
  { value: "new_contact", labelKey: "triggers.new_contact" },
  { value: "tag_added", labelKey: "triggers.tag_added" },
  { value: "deal_created", labelKey: "triggers.deal_created" },
  { value: "no_response", labelKey: "triggers.no_response" },
  { value: "keyword", labelKey: "triggers.keyword" },
]

const STATUS_STYLES: Record<AiFollowupStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  archived: "bg-muted text-muted-foreground",
}

const EXECUTION_STATUS_STYLES: Record<string, string> = {
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  stopped: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  waiting: "bg-secondary text-secondary-foreground",
}

const CHANNELS = ["whatsapp", "instagram", "facebook", "email"]

type AudienceType = "all" | "tags" | "custom_field"
type CustomFieldOperator = "is" | "is_not" | "contains"

interface CustomFieldFilter {
  fieldId: string
  operator: CustomFieldOperator
  value: string
}

type FollowupFormData = {
  name: string
  trigger_type: AiFollowupTriggerType
  status: AiFollowupStatus
  delay_hours: number
  max_followups: number
  channel: string
  use_ai: boolean
  message: string
  conditions: string
  audience_type: AudienceType
  tagIds: string[]
  custom_field: CustomFieldFilter
  schedule_start: string
  schedule_end: string
  quiet_start: string
  quiet_end: string
}

const EMPTY_FORM: FollowupFormData = {
  name: "",
  trigger_type: "manual",
  status: "draft",
  delay_hours: 24,
  max_followups: 3,
  channel: "",
  use_ai: false,
  message: "",
  conditions: "",
  audience_type: "all",
  tagIds: [],
  custom_field: { fieldId: "", operator: "is", value: "" },
  schedule_start: "",
  schedule_end: "",
  quiet_start: "",
  quiet_end: "",
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function formFromFollowup(f: AiFollowup): FollowupFormData {
  const cfg = asRecord(f.trigger_config)
  const audience = asRecord(cfg.audience)
  const schedule = asRecord(cfg.schedule)
  const customField = asRecord(audience.customField)
  const cfgMessage = typeof cfg.message === "string" ? cfg.message : ""
  const prompt = f.ai_system_prompt ?? ""
  const useAi = !cfgMessage && !!prompt
  const audienceType: AudienceType =
    audience.type === "tags" || audience.type === "custom_field"
      ? audience.type
      : "all"
  const operator =
    customField.operator === "is_not" || customField.operator === "contains"
      ? customField.operator
      : "is"

  return {
    name: f.name,
    trigger_type: f.trigger_type,
    status: f.status,
    delay_hours: f.delay_hours,
    max_followups: f.max_followups,
    channel: typeof cfg.channel === "string" ? cfg.channel : "",
    use_ai: useAi,
    message: useAi ? prompt : cfgMessage,
    conditions: typeof cfg.conditions === "string" ? cfg.conditions : "",
    audience_type: audienceType,
    tagIds: Array.isArray(audience.tagIds)
      ? (audience.tagIds as string[]).filter((id) => typeof id === "string")
      : [],
    custom_field: {
      fieldId: typeof customField.fieldId === "string" ? customField.fieldId : "",
      operator,
      value: typeof customField.value === "string" ? customField.value : "",
    },
    schedule_start: typeof schedule.starts_at === "string" ? schedule.starts_at : "",
    schedule_end: typeof schedule.ends_at === "string" ? schedule.ends_at : "",
    quiet_start:
      typeof schedule.quiet_hours_start === "string" ? schedule.quiet_hours_start : "",
    quiet_end:
      typeof schedule.quiet_hours_end === "string" ? schedule.quiet_hours_end : "",
  }
}

function buildBody(
  form: FollowupFormData,
  baseConfig: Record<string, unknown> | undefined,
) {
  const config: Record<string, unknown> = { ...baseConfig }
  config.channel = form.channel
  config.audience =
    form.audience_type === "tags"
      ? { type: "tags", tagIds: form.tagIds }
      : form.audience_type === "custom_field"
        ? { type: "custom_field", customField: form.custom_field }
        : { type: "all" }

  if (form.conditions.trim()) config.conditions = form.conditions.trim()
  else delete config.conditions

  const schedule: Record<string, string> = {}
  if (form.schedule_start) schedule.starts_at = form.schedule_start
  if (form.schedule_end) schedule.ends_at = form.schedule_end
  if (form.quiet_start) schedule.quiet_hours_start = form.quiet_start
  if (form.quiet_end) schedule.quiet_hours_end = form.quiet_end
  if (Object.keys(schedule).length > 0) config.schedule = schedule
  else delete config.schedule

  if (form.use_ai) delete config.message
  else config.message = form.message.trim()

  return {
    name: form.name.trim(),
    trigger_type: form.trigger_type,
    status: form.status,
    delay_hours: form.delay_hours,
    max_followups: form.max_followups,
    trigger_config: config,
    ai_system_prompt: form.use_ai ? form.message.trim() : null,
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const record = (body ?? {}) as Record<string, unknown>
    const err = new Error(
      typeof record.error === "string" && record.error
        ? record.error
        : `Request failed (${res.status})`,
    ) as Error & { code?: string }
    if (typeof record.code === "string") err.code = record.code
    throw err
  }
  return body as T
}

export default function AiFollowupsPage() {
  const t = useTranslations("AiFollowups")
  const [followups, setFollowups] = useState<AiFollowup[] | null>(null)
  const [executions, setExecutions] = useState<AiFollowupExecution[]>([])
  const [selectedFollowup, setSelectedFollowup] = useState<AiFollowup | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AiFollowup | null>(null)
  const [historyTarget, setHistoryTarget] = useState<AiFollowup | null>(null)
  const [formData, setFormData] = useState<FollowupFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [statusFilter, setStatusFilter] = useState<AiFollowupStatus | "all">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("list")
  const [tags, setTags] = useState<Tag[]>([])
  const [loadingTags, setLoadingTags] = useState(true)
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [fieldsLoaded, setFieldsLoaded] = useState(false)

  const loadFollowups = useCallback(async () => {
    try {
      const body = await api<{ followups?: AiFollowup[] }>("/api/ai/followups")
      setFollowups(body.followups ?? [])
    } catch (err) {
      setFollowups([])
      toast.error(t("toasts.loadError"), {
        description: describeError(err, t("toasts.loadError")),
      })
    }
  }, [t])

  useEffect(() => {
    void loadFollowups()
  }, [loadFollowups])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    setLoadingTags(true)
    ;(async () => {
      try {
        const { data, error } = await supabase.from("tags").select("id, name").order("name")
        if (error) throw error
        if (!cancelled) setTags((data as Tag[]) ?? [])
      } catch (err) {
        console.error("[AiFollowups] tags load failed:", err)
      } finally {
        if (!cancelled) setLoadingTags(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!dialogOpen || formData.audience_type !== "custom_field" || fieldsLoaded) return
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from("custom_fields")
          .select("*")
          .order("field_name")
        if (error) throw error
        if (!cancelled) {
          setCustomFields((data as CustomField[]) ?? [])
          setFieldsLoaded(true)
        }
      } catch (err) {
        console.error("[AiFollowups] custom fields load failed:", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dialogOpen, formData.audience_type, fieldsLoaded])

  function openCreateDialog() {
    setFormData(EMPTY_FORM)
    setEditMode(false)
    setSelectedFollowup(null)
    setDialogOpen(true)
  }

  function openEditDialog(f: AiFollowup) {
    setFormData(formFromFollowup(f))
    setEditMode(true)
    setSelectedFollowup(f)
    setDialogOpen(true)
  }

  function toggleTag(tagId: string) {
    setFormData((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter((id) => id !== tagId)
        : [...prev.tagIds, tagId],
    }))
  }

  function humanDelay(hours: number): string {
    if (hours < 24) return t("delay.hoursShort", { hours })
    const days = Math.floor(hours / 24)
    const rest = hours % 24
    if (rest === 0) return t("delay.daysShort", { days })
    return t("delay.daysHours", { days, hours: rest })
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      toast.error(t("validation.nameRequired"))
      return
    }
    if (!formData.message.trim()) {
      toast.error(t("validation.messageRequired"))
      return
    }
    if (formData.audience_type === "tags" && formData.tagIds.length === 0) {
      toast.error(t("validation.tagsRequired"))
      return
    }
    if (
      formData.audience_type === "custom_field" &&
      (!formData.custom_field.fieldId || !formData.custom_field.value.trim())
    ) {
      toast.error(t("validation.customFieldRequired"))
      return
    }

    setSaving(true)
    try {
      const body = buildBody(
        formData,
        editMode && selectedFollowup ? selectedFollowup.trigger_config : undefined,
      )
      if (editMode && selectedFollowup) {
        await api(`/api/ai/followups/${selectedFollowup.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        })
        toast.success(t("toasts.updated"))
      } else {
        await api("/api/ai/followups", {
          method: "POST",
          body: JSON.stringify(body),
        })
        toast.success(t("toasts.created"))
      }
      setDialogOpen(false)
      void loadFollowups()
    } catch (err) {
      toast.error(t("toasts.saveError"), {
        description: describeError(err, t("toasts.saveError")),
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api(`/api/ai/followups/${deleteTarget.id}`, { method: "DELETE" })
      toast.success(t("toasts.deleted"))
      setDeleteTarget(null)
      void loadFollowups()
    } catch (err) {
      toast.error(t("toasts.deleteError"), {
        description: describeError(err, t("toasts.deleteError")),
      })
    } finally {
      setDeleting(false)
    }
  }

  async function updateStatus(f: AiFollowup, newStatus: AiFollowupStatus) {
    if (statusBusyId) return
    setStatusBusyId(f.id)
    try {
      await api(`/api/ai/followups/${f.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      })
      toast.success(t(`toasts.${newStatus}`))
      void loadFollowups()
    } catch (err) {
      toast.error(t("toasts.updateError"), {
        description: describeError(err, t("toasts.updateError")),
      })
    } finally {
      setStatusBusyId(null)
    }
  }

  async function loadExecutionHistory(f: AiFollowup) {
    setHistoryTarget(f)
    setLoadingHistory(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("ai_followup_executions")
        .select("*, contacts!inner(name, phone)")
        .eq("followup_id", f.id)
        .order("created_at", { ascending: false })
        .limit(50)
      if (error) throw error
      setExecutions((data ?? []) as AiFollowupExecution[])
    } catch (err) {
      toast.error(t("toasts.historyError"), {
        description: describeError(err, t("toasts.historyError")),
      })
    } finally {
      setLoadingHistory(false)
    }
  }

  const stats = followups
    ? {
        total: followups.length,
        active: followups.filter((f) => f.status === "active").length,
        paused: followups.filter((f) => f.status === "paused").length,
      }
    : { total: 0, active: 0, paused: 0 }

  const filteredFollowups = (followups ?? []).filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false
    const term = searchQuery.trim().toLowerCase()
    if (!term) return true
    return f.name.toLowerCase().includes(term) || f.trigger_type.toLowerCase().includes(term)
  })

  if (followups === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={openCreateDialog} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          {t("create")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">{t("stats.total")}</div>
              <div className="text-xl font-bold text-foreground">{stats.total}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">{t("stats.active")}</div>
              <div className="text-xl font-bold text-foreground">{stats.active}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
              <Pause className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">{t("stats.paused")}</div>
              <div className="text-xl font-bold text-foreground">{stats.paused}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="gap-1">
            <TabsTrigger value="list" className="min-w-24 px-4">
              <Layers className="size-4" />
              {t("tabs.sequences")}
            </TabsTrigger>
            <TabsTrigger value="history" className="min-w-24 px-4">
              <History className="size-4" />
              {t("tabs.history")}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-9 w-44 pl-8 sm:w-56"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as AiFollowupStatus | "all")}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filter.all")}</SelectItem>
                <SelectItem value="draft">{t("filter.draft")}</SelectItem>
                <SelectItem value="active">{t("filter.active")}</SelectItem>
                <SelectItem value="paused">{t("filter.paused")}</SelectItem>
                <SelectItem value="archived">{t("filter.archived")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="list" className="mt-4">
          {followups.length === 0 ? (
            <EmptyState
              icon={Bot}
              title={t("empty.title")}
              description={t("empty.desc")}
              action={
                <Button onClick={openCreateDialog} variant="outline">
                  <Plus className="h-4 w-4" />
                  {t("create")}
                </Button>
              }
            />
          ) : filteredFollowups.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t("noResults")}
              action={
                <Button variant="ghost" onClick={() => { setSearchQuery(""); setStatusFilter("all") }}>
                  {t("clear")}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredFollowups.map((f) => (
                <FollowupCard
                  key={f.id}
                  followup={f}
                  t={t}
                  busy={statusBusyId === f.id}
                  onEdit={() => openEditDialog(f)}
                  onStart={() => updateStatus(f, "active")}
                  onPause={() => updateStatus(f, "paused")}
                  onResume={() => updateStatus(f, "active")}
                  onArchive={() => updateStatus(f, "archived")}
                  onDelete={() => setDeleteTarget(f)}
                  onHistory={() => {
                    void loadExecutionHistory(f)
                    setActiveTab("history")
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-primary" />
                  {historyTarget
                    ? t("history.title") + " — " + historyTarget.name
                    : t("history.selectPrompt")}
                </CardTitle>
                {!historyTarget ? (
                  <Select
                    value=""
                    onValueChange={(val) => {
                      const f = followups.find((x) => x.id === val)
                      if (f) void loadExecutionHistory(f)
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder={t("history.selectFollowup")} />
                    </SelectTrigger>
                    <SelectContent>
                      {followups.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : historyTarget && (
                  <Button variant="outline" size="sm" onClick={() => setHistoryTarget(null)}>
                    {t("history.changeFollowup")}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : historyTarget && executions.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                  <History className="h-5 w-5" />
                  {t("history.empty")}
                </div>
              ) : historyTarget ? (
                <ExecutionTable executions={executions} t={t} />
              ) : (
                <div className="flex h-32 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                  <History className="h-5 w-5" />
                  {t("history.selectPrompt")}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editMode ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
            <DialogDescription>{t("dialog.description")}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6 py-2">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{t("dialog.section.general")}</h3>
                <div className="space-y-2">
                  <Label htmlFor="fu-name">{t("dialog.name")}</Label>
                  <Input
                    id="fu-name"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    placeholder={t("dialog.namePlaceholder")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("dialog.triggerType")}</Label>
                    <Select
                      value={formData.trigger_type}
                      onValueChange={(val) =>
                        setFormData((p) => ({ ...p, trigger_type: val as AiFollowupTriggerType }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRIGGER_TYPES.map((tt) => (
                          <SelectItem key={tt.value} value={tt.value}>
                            {t(tt.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("dialog.status")}</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(val) =>
                        setFormData((p) => ({ ...p, status: val as AiFollowupStatus }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{t("filter.draft")}</SelectItem>
                        <SelectItem value="active">{t("filter.active")}</SelectItem>
                        <SelectItem value="paused">{t("filter.paused")}</SelectItem>
                        <SelectItem value="archived">{t("filter.archived")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{t("dialog.section.settings")}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fu-max">{t("dialog.maxFollowups")}</Label>
                    <Input
                      id="fu-max"
                      type="number"
                      min={1}
                      max={50}
                      value={formData.max_followups}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, max_followups: parseInt(e.target.value) || 1 }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fu-delay">{t("dialog.delayHours")}</Label>
                    <Input
                      id="fu-delay"
                      type="number"
                      min={1}
                      max={720}
                      value={formData.delay_hours}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, delay_hours: parseInt(e.target.value) || 1 }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">{humanDelay(formData.delay_hours)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{t("dialog.section.audience")}</h3>
                <div className="space-y-2">
                  <Label>{t("dialog.audienceType")}</Label>
                  <Select
                    value={formData.audience_type}
                    onValueChange={(val) =>
                      setFormData((p) => ({ ...p, audience_type: val as AudienceType }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("dialog.audienceAll")}</SelectItem>
                      <SelectItem value="tags">{t("dialog.audienceTags")}</SelectItem>
                      <SelectItem value="custom_field">
                        {t("dialog.audienceCustomField")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.audience_type === "tags" && (
                  <div className="space-y-2">
                    <Label>{t("dialog.selectTags")}</Label>
                    {loadingTags ? (
                      <div className="flex h-10 items-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : tags.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("dialog.noTags")}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => {
                          const selected = formData.tagIds.includes(tag.id)
                          return (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => toggleTag(tag.id)}
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                selected
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {tag.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {formData.audience_type === "custom_field" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label>{t("dialog.customFieldLabel")}</Label>
                      <Select
                        value={formData.custom_field.fieldId || "_none"}
                        onValueChange={(val) =>
                          setFormData((p) => ({
                            ...p,
                            custom_field: {
                              ...p.custom_field,
                              fieldId: val && val !== "_none" ? val : "",
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("dialog.customFieldLabel")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">{t("dialog.audienceAll")}</SelectItem>
                          {customFields.map((field) => (
                            <SelectItem key={field.id} value={field.id}>
                              {field.field_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("dialog.operatorIs")}</Label>
                      <Select
                        value={formData.custom_field.operator}
                        onValueChange={(val) =>
                          setFormData((p) => ({
                            ...p,
                            custom_field: { ...p.custom_field, operator: val as CustomFieldOperator },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="is">{t("dialog.operatorIs")}</SelectItem>
                          <SelectItem value="is_not">{t("dialog.operatorIsNot")}</SelectItem>
                          <SelectItem value="contains">{t("dialog.operatorContains")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("dialog.customFieldValue")}</Label>
                      <Input
                        value={formData.custom_field.value}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            custom_field: { ...p.custom_field, value: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{t("dialog.section.message")}</h3>
                <div className="space-y-2">
                  <Label>{t("dialog.channel")}</Label>
                  <Select
                    value={formData.channel || "_any"}
                    onValueChange={(val) =>
                      setFormData((p) => ({ ...p, channel: val && val !== "_any" ? val : "" }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_any">{t("dialog.channelAny")}</SelectItem>
                      {CHANNELS.map((ch) => (
                        <SelectItem key={ch} value={ch}>
                          {t(`dialog.channel${ch.charAt(0).toUpperCase()}${ch.slice(1)}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="fu-ai">{t("dialog.aiToggle")}</Label>
                  <Switch
                    id="fu-ai"
                    checked={formData.use_ai}
                    onCheckedChange={(v) => setFormData((p) => ({ ...p, use_ai: !!v }))}
                  />
                </div>
                {formData.use_ai && (
                  <p className="text-xs text-muted-foreground">{t("dialog.aiHint")}</p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="fu-message">{t("dialog.message")}</Label>
                  <Textarea
                    id="fu-message"
                    value={formData.message}
                    onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                    placeholder={t("dialog.messagePlaceholder")}
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fu-conditions">{t("dialog.conditions")}</Label>
                  <Textarea
                    id="fu-conditions"
                    value={formData.conditions}
                    onChange={(e) => setFormData((p) => ({ ...p, conditions: e.target.value }))}
                    placeholder={t("dialog.conditionsPlaceholder")}
                    rows={2}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">{t("dialog.section.schedule")}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fu-start">{t("dialog.scheduleStart")}</Label>
                    <Input
                      id="fu-start"
                      type="date"
                      value={formData.schedule_start}
                      onChange={(e) => setFormData((p) => ({ ...p, schedule_start: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fu-end">{t("dialog.scheduleEnd")}</Label>
                    <Input
                      id="fu-end"
                      type="date"
                      value={formData.schedule_end}
                      onChange={(e) => setFormData((p) => ({ ...p, schedule_end: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fu-quiet-start">{t("dialog.quietStart")}</Label>
                    <Input
                      id="fu-quiet-start"
                      type="time"
                      value={formData.quiet_start}
                      onChange={(e) => setFormData((p) => ({ ...p, quiet_start: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fu-quiet-end">{t("dialog.quietEnd")}</Label>
                    <Input
                      id="fu-quiet-end"
                      type="time"
                      value={formData.quiet_end}
                      onChange={(e) => setFormData((p) => ({ ...p, quiet_end: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("dialog.quietHours")}</p>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t("dialog.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editMode ? t("dialog.save") : t("dialog.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete.title")}</DialogTitle>
            <DialogDescription>{t("delete.desc", { name: deleteTarget?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t("delete.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function labelForChannel(
  t: ReturnType<typeof useTranslations>,
  channel: string,
): string {
  if (!channel) return ""
  const known = ["whatsapp", "instagram", "facebook", "email"]
  if (!known.includes(channel)) return channel
  return t(`dialog.channel${channel.charAt(0).toUpperCase()}${channel.slice(1)}`)
}

function FollowupCard({
  followup,
  t,
  busy,
  onEdit,
  onStart,
  onPause,
  onResume,
  onArchive,
  onDelete,
  onHistory,
}: {
  followup: AiFollowup
  t: ReturnType<typeof useTranslations>
  busy: boolean
  onEdit: () => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onArchive: () => void
  onDelete: () => void
  onHistory: () => void
}) {
  const statusLabel = t(`filter.${followup.status}`)
  const triggerLabel = t(`triggers.${followup.trigger_type}`)
  const config = asRecord(followup.trigger_config)
  const channel = typeof config.channel === "string" ? config.channel : ""
  const updatedLabel = followup.updated_at
    ? new Date(followup.updated_at).toLocaleDateString()
    : followup.created_at
      ? new Date(followup.created_at).toLocaleDateString()
      : ""

  return (
    <li className="rounded-xl border border-border bg-card transition-colors hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-4 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Bot className="h-5 w-5 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{followup.name}</span>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[followup.status]}`}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {statusLabel}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Filter className="h-3 w-3" />
              {triggerLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {t("card.maxFollowups", { count: followup.max_followups })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t("card.delay", { hours: followup.delay_hours })}
            </span>
            {channel && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {labelForChannel(t, channel)}
              </span>
            )}
            {updatedLabel && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {t("card.updated", { date: updatedLabel })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {followup.status === "draft" && (
            <Button size="sm" variant="outline" onClick={onStart} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {t("actions.start")}
            </Button>
          )}
          {followup.status === "active" && (
            <Button size="sm" variant="outline" onClick={onPause} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
              {t("actions.pause")}
            </Button>
          )}
          {followup.status === "paused" && (
            <Button size="sm" variant="outline" onClick={onResume} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              {t("actions.resume")}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t("actions.more")}
              title={t("actions.more")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onHistory}>
                <Eye className="h-4 w-4" />
                {t("actions.viewHistory")}
              </DropdownMenuItem>
              {followup.status !== "archived" && (
                <DropdownMenuItem onClick={onArchive}>
                  <Archive className="h-4 w-4" />
                  {t("actions.archive")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}

function ExecutionTable({
  executions,
  t,
}: {
  executions: AiFollowupExecution[]
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[680px]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("history.contact")}</TableHead>
            <TableHead>{t("history.status")}</TableHead>
            <TableHead>{t("history.step")}</TableHead>
            <TableHead>{t("history.lastSent")}</TableHead>
            <TableHead>{t("history.nextAction")}</TableHead>
            <TableHead>{t("history.created")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.map((ex) => (
            <TableRow key={ex.id}>
              <TableCell className="max-w-0 truncate font-medium text-foreground">
                <span className="truncate" title={ex.contact_id}>
                  {((ex as unknown as Record<string, unknown>).contacts
                    ? ((ex as unknown as Record<string, unknown>).contacts as { name?: string; phone: string }).name ||
                      ((ex as unknown as Record<string, unknown>).contacts as { phone: string }).phone
                    : ex.contact_id) ?? ""}
                </span>
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${EXECUTION_STATUS_STYLES[ex.status] ?? ""}`}
                >
                  {t(`history.statuses.${ex.status}`)}
                </span>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {ex.current_step} / {ex.total_steps}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground" title={ex.last_sent_at ?? undefined}>
                {ex.last_sent_at ? new Date(ex.last_sent_at).toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground" title={ex.next_action_at ?? undefined}>
                {ex.next_action_at ? new Date(ex.next_action_at).toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground" title={ex.created_at}>
                {new Date(ex.created_at).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
