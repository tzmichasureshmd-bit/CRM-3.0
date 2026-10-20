"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { hasColumn } from "@/lib/db/schema"
import { describeError } from "@/lib/errors"
import { useAuth } from "@/hooks/use-auth"
import { useTranslations } from "next-intl"
import type { QuickReplyKind } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { SetupRequired, EmptyState } from "@/components/shared"
import {
  InteractiveBuilder,
  blankButtonsPayload,
} from "@/components/interactive/interactive-builder"
import {
  interactivePayloadPreviewText,
  validateInteractivePayload,
  type InteractiveMessagePayload,
} from "@/lib/whatsapp/interactive"

type OptionalColumn = "shortcut" | "channel" | "language" | "category" | "status"

const OPTIONAL_COLUMNS: OptionalColumn[] = [
  "shortcut",
  "channel",
  "language",
  "category",
  "status",
]

interface QuickReplyRow {
  id: string
  title: string
  kind: QuickReplyKind
  content_text?: string | null
  interactive_payload?: InteractiveMessagePayload | null
  shortcut?: string | null
  channel?: string | null
  language?: string | null
  category?: string | null
  status?: string | null
  created_at: string
}

interface DraftState {
  id?: string
  title: string
  kind: QuickReplyKind
  content_text: string
  interactive_payload: InteractiveMessagePayload
  shortcut: string
  category: string
  channel: string
  language: string
  status: string
}

const CATEGORIES = [
  "general",
  "pricing",
  "support",
  "sales",
  "onboarding",
  "follow-up",
]

const CHANNELS = ["whatsapp", "instagram", "facebook", "email"]

const LANGUAGES = ["en", "es", "fr", "pt", "de", "ar", "hi"]

const VARIABLE_HINTS = [
  "{{first_name}}",
  "{{last_name}}",
  "{{phone}}",
  "{{email}}",
  "{{company}}",
]

function emptyDraft(): DraftState {
  return {
    title: "",
    kind: "text",
    content_text: "",
    interactive_payload: blankButtonsPayload(),
    shortcut: "",
    category: "general",
    channel: "",
    language: "",
    status: "active",
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

export default function QuickRepliesPage() {
  const t = useTranslations("Automations.quickReplies")
  const { canSendMessages } = useAuth()

  const [items, setItems] = useState<QuickReplyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [cols, setCols] = useState<Record<OptionalColumn, boolean> | null>(null)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<QuickReplyRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchSeq = useRef(0)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    void Promise.all(
      OPTIONAL_COLUMNS.map(
        async (column) =>
          [column, await hasColumn(supabase, "quick_replies", column)] as const,
      ),
    ).then((results) => {
      if (cancelled) return
      setCols(Object.fromEntries(results) as Record<OptionalColumn, boolean>)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    const seq = ++fetchSeq.current
    setLoading(true)
    try {
      const body = await api<{ quick_replies?: QuickReplyRow[] }>(
        "/api/quick-replies",
      )
      if (seq !== fetchSeq.current) return
      setItems(body.quick_replies ?? [])
    } catch (err) {
      if (seq !== fetchSeq.current) return
      setItems([])
      toast.error(t("toast.loadError"), {
        description: describeError(err, t("toast.loadError")),
      })
    } finally {
      if (seq === fetchSeq.current) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const missingColumns = cols ? OPTIONAL_COLUMNS.filter((c) => !cols[c]) : []
  const missingLabel =
    missingColumns.length === 1
      ? `Column quick_replies.${missingColumns[0]} is missing.`
      : `Columns ${missingColumns
          .map((c) => `quick_replies.${c}`)
          .join(", ")} are missing.`

  const filtered = items.filter((qr) => {
    const term = search.trim().toLowerCase()
    const matchesSearch =
      !term ||
      qr.title.toLowerCase().includes(term) ||
      (qr.content_text ?? "").toLowerCase().includes(term) ||
      (qr.shortcut ?? "").toLowerCase().includes(term)
    const matchesCategory = !categoryFilter || qr.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const categories = Array.from(
    new Set(items.map((qr) => qr.category).filter((c): c is string => !!c)),
  ).sort()

  function openCreate() {
    setDraft(emptyDraft())
  }

  function openEdit(qr: QuickReplyRow) {
    setDraft({
      id: qr.id,
      title: qr.title,
      kind: qr.kind,
      content_text: qr.content_text ?? "",
      interactive_payload: qr.interactive_payload ?? blankButtonsPayload(),
      shortcut: qr.shortcut ?? "",
      category: qr.category ?? "general",
      channel: qr.channel ?? "",
      language: qr.language ?? "",
      status: qr.status ?? "active",
    })
  }

  async function save() {
    if (!draft) return
    if (!draft.title.trim()) {
      toast.error(t("toast.titleRequired"))
      return
    }
    if (draft.kind === "text") {
      if (!draft.content_text.trim()) {
        toast.error(t("toast.messageRequired"))
        return
      }
    } else {
      const check = validateInteractivePayload(draft.interactive_payload)
      if (!check.ok) {
        toast.error(check.error)
        return
      }
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        title: draft.title.trim(),
        kind: draft.kind,
        content_text: draft.kind === "text" ? draft.content_text : null,
        interactive_payload:
          draft.kind === "interactive" ? draft.interactive_payload : null,
      }
      if (cols) {
        if (cols.shortcut) payload.shortcut = draft.shortcut.trim()
        if (cols.channel) payload.channel = draft.channel
        if (cols.language) payload.language = draft.language.trim()
        if (cols.category) payload.category = draft.category.trim() || null
        if (cols.status) payload.status = draft.status || "active"
      }

      if (draft.id) {
        await api(`/api/quick-replies/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        toast.success(t("toast.updated"))
      } else {
        await api("/api/quick-replies", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        toast.success(t("toast.created"))
      }
      setDraft(null)
      void load()
    } catch (err) {
      toast.error(t("toast.saveError"), {
        description: describeError(err, t("toast.saveError")),
      })
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api(`/api/quick-replies/${pendingDelete.id}`, { method: "DELETE" })
      toast.success(t("toast.deleted"))
      setPendingDelete(null)
      void load()
    } catch (err) {
      toast.error(t("toast.deleteError"), {
        description: describeError(err, t("toast.deleteError")),
      })
    } finally {
      setDeleting(false)
    }
  }

  function insertVariable(varName: string) {
    if (!draft) return
    setDraft({ ...draft, content_text: draft.content_text + varName })
  }

  if (loading || !cols) {
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
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        {canSendMessages && (
          <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            {t("create")}
          </Button>
        )}
      </div>

      {missingColumns.length > 0 && (
        <SetupRequired
          feature="Quick Replies"
          migration="077_crm20_stabilization.sql"
          missing={missingLabel}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>
        {cols.category && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                !categoryFilter
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t("all")}
            </button>
            {Array.from(new Set([...CATEGORIES, ...categories])).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors capitalize ${
                  categoryFilter === cat
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={t("emptyTitle")}
            description={t("emptyDesc")}
            action={
              canSendMessages ? (
                <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" />
                  {t("create")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={Search}
            title={t("noResults")}
            description={t("noResultsDesc")}
          />
        )
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {cols.shortcut && (
                  <TableHead className="w-32 text-muted-foreground">{t("table.shortcut")}</TableHead>
                )}
                <TableHead className="text-muted-foreground">{t("table.title")}</TableHead>
                <TableHead className="text-muted-foreground hidden md:table-cell">{t("table.message")}</TableHead>
                {cols.category && (
                  <TableHead className="text-muted-foreground hidden sm:table-cell">{t("table.category")}</TableHead>
                )}
                {cols.channel && (
                  <TableHead className="text-muted-foreground hidden lg:table-cell">{t("table.channel")}</TableHead>
                )}
                {cols.status && (
                  <TableHead className="text-muted-foreground hidden lg:table-cell w-24">{t("table.status")}</TableHead>
                )}
                <TableHead className="text-muted-foreground w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((qr) => {
                const preview =
                  qr.kind === "interactive" && qr.interactive_payload
                    ? interactivePayloadPreviewText(qr.interactive_payload)
                    : (qr.content_text ?? "")
                return (
                  <TableRow key={qr.id} className="border-border hover:bg-muted/50">
                    {cols.shortcut && (
                      <TableCell>
                        {qr.shortcut ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-primary">
                            {qr.shortcut}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-foreground font-medium">
                      {qr.title}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="max-w-xl truncate text-xs text-muted-foreground" title={preview}>
                        {preview}
                      </p>
                    </TableCell>
                    {cols.category && (
                      <TableCell className="hidden sm:table-cell">
                        {qr.category ? (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {qr.category}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    {cols.channel && (
                      <TableCell className="hidden lg:table-cell">
                        {qr.channel ? (
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {qr.channel}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    {cols.status && (
                      <TableCell className="hidden lg:table-cell">
                        {qr.status ? (
                          <Badge
                            variant={qr.status === "active" ? "default" : "secondary"}
                            className="text-[10px] capitalize"
                          >
                            {qr.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {canSendMessages && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(qr)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canSendMessages && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setPendingDelete(qr)}
                            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? t("dialog.editTitle") : t("dialog.createTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("dialog.description")}
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qr-title">{t("dialog.title")}</Label>
                <Input
                  id="qr-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={t("dialog.titlePlaceholder")}
                  className="bg-muted text-foreground"
                />
              </div>

              {cols.shortcut && (
                <div className="space-y-2">
                  <Label htmlFor="qr-shortcut">{t("dialog.shortcut")}</Label>
                  <Input
                    id="qr-shortcut"
                    value={draft.shortcut}
                    onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })}
                    placeholder="/price"
                    className="bg-muted text-foreground font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("dialog.shortcutHint")}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("dialog.kind")}</Label>
                  <Select
                    value={draft.kind}
                    onValueChange={(v) =>
                      setDraft({ ...draft, kind: v as QuickReplyKind })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">{t("dialog.kindText")}</SelectItem>
                      <SelectItem value="interactive">
                        {t("dialog.kindInteractive")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {cols.status && (
                  <div className="space-y-2">
                    <Label>{t("dialog.status")}</Label>
                    <Select
                      value={draft.status || "active"}
                      onValueChange={(v) =>
                        setDraft({ ...draft, status: v ?? "active" })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t("dialog.statusActive")}</SelectItem>
                        <SelectItem value="inactive">{t("dialog.statusInactive")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {draft.kind === "text" ? (
                <div className="space-y-2">
                  <Label htmlFor="qr-message">{t("dialog.message")}</Label>
                  <Textarea
                    id="qr-message"
                    value={draft.content_text}
                    onChange={(e) =>
                      setDraft({ ...draft, content_text: e.target.value })
                    }
                    placeholder={t("dialog.messagePlaceholder")}
                    className="min-h-28 bg-muted text-foreground"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLE_HINTS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t("dialog.interactiveHint")}
                  </p>
                  <InteractiveBuilder
                    value={draft.interactive_payload}
                    onChange={(payload) =>
                      setDraft({ ...draft, interactive_payload: payload })
                    }
                    showPreview={false}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {cols.category && (
                  <div className="space-y-2">
                    <Label htmlFor="qr-category">{t("dialog.category")}</Label>
                    <Input
                      id="qr-category"
                      value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                      placeholder="general"
                      className="bg-muted text-foreground"
                      list="category-options"
                    />
                    <datalist id="category-options">
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>
                )}
                {cols.channel && (
                  <div className="space-y-2">
                    <Label>{t("dialog.channel")}</Label>
                    <Select
                      value={draft.channel || "_any"}
                      onValueChange={(v) =>
                        setDraft({ ...draft, channel: v && v !== "_any" ? v : "" })
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
                )}
              </div>

              {cols.language && (
                <div className="space-y-2">
                  <Label htmlFor="qr-language">{t("dialog.language")}</Label>
                  <Input
                    id="qr-language"
                    value={draft.language}
                    onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                    placeholder="en"
                    className="bg-muted text-foreground"
                    list="language-options"
                  />
                  <datalist id="language-options">
                    {LANGUAGES.map((lang) => (
                      <option key={lang} value={lang} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              {t("dialog.cancel")}
            </Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {draft?.id ? t("dialog.save") : t("dialog.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDesc", { title: pendingDelete?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>
              {t("dialog.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              {t("dialog.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
