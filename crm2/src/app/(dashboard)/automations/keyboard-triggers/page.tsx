"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Keyboard,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Search,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { useTranslations } from "next-intl"
import type { KeyboardShortcut } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DefaultShortcut {
  action_key: string
  label: string
  description: string
  default_combo: string
}

const DEFAULT_SHORTCUTS: DefaultShortcut[] = [
  {
    action_key: "search",
    label: "Search",
    description: "Open the global search panel",
    default_combo: "Ctrl+K",
  },
  {
    action_key: "send_message",
    label: "Send message",
    description: "Send the current message in the inbox composer",
    default_combo: "Ctrl+Enter",
  },
  {
    action_key: "assign_conversation",
    label: "Assign conversation",
    description: "Assign the active conversation to an agent",
    default_combo: "Ctrl+Shift+A",
  },
  {
    action_key: "add_tag",
    label: "Add tag",
    description: "Add a tag to the current conversation",
    default_combo: "Ctrl+Shift+T",
  },
  {
    action_key: "quick_replies",
    label: "Quick replies",
    description: "Open the quick replies panel",
    default_combo: "Ctrl+Shift+R",
  },
  {
    action_key: "close_panel",
    label: "Close panel",
    description: "Close the currently open panel or dialog",
    default_combo: "Esc",
  },
]

function comboDisplay(keys: string[]) {
  return keys
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1).toLowerCase())
    .join("+")
}

function parseShortcutShortcut(combo: string): string[] {
  return combo
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean)
}

function formatShortcutForInput(keys: string[]): string {
  return keys.join("+")
}

export default function KeyboardTriggersPage() {
  const t = useTranslations("Automations.keyboardTriggers")
  const { accountId, canSendMessages } = useAuth()

  const [items, setItems] = useState<KeyboardShortcut[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCombo, setEditCombo] = useState("")
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++fetchSeq.current
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from("keyboard_shortcuts")
      .select("*")
      .order("created_at", { ascending: false })

    if (accountId) {
      query = query.eq("account_id", accountId)
    }

    const { data, error } = await query
    if (seq !== fetchSeq.current) return
    if (error) {
      toast.error(t("toast.loadError"))
      setLoading(false)
      return
    }

    setItems((data as KeyboardShortcut[]) ?? [])
    setLoading(false)
  }, [accountId, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const merged = DEFAULT_SHORTCUTS.map((def) => {
    const saved = items.find((i) => i.action_key === def.action_key)
    return {
      ...def,
      saved,
      current_combo: saved ? parseShortcutShortcut(saved.shortcut) : parseShortcutShortcut(def.default_combo),
      is_enabled: saved ? saved.is_enabled : true,
    }
  })

  const filtered = merged.filter((s) => {
    const term = search.toLowerCase()
    return (
      !term ||
      s.label.toLowerCase().includes(term) ||
      s.description.toLowerCase().includes(term) ||
      s.action_key.toLowerCase().includes(term) ||
      comboDisplay(s.current_combo).toLowerCase().includes(term)
    )
  })

  function startEdit(actionKey: string) {
    const entry = merged.find((s) => s.action_key === actionKey)
    if (!entry) return
    setEditingId(actionKey)
    setEditCombo(formatShortcutForInput(entry.current_combo))
    setRecording(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()

    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl")
    if (e.shiftKey) parts.push("Shift")
    if (e.altKey) parts.push("Alt")

    const key = e.key
    const meta = new Set(["Control", "Shift", "Alt", "Meta", "Fn"])
    if (!meta.has(key)) {
      const label = key === " " ? "Space" : key === "Escape" ? "Esc" : key.length === 1 ? key.toUpperCase() : key
      parts.push(label)
    }

    if (parts.length > 0) {
      setEditCombo(parts.join("+"))
      setRecording(false)
    }
  }

  async function saveShortcut(actionKey: string) {
    if (!accountId) return
    setSaving(true)
    const supabase = createClient()
    const combo = editCombo.trim()
    if (!combo) {
      toast.error(t("toast.emptyCombo"))
      setSaving(false)
      return
    }

    const existing = items.find(
      (i) => i.action_key === actionKey && i.account_id === accountId,
    )

    if (existing) {
      const { error } = await supabase
        .from("keyboard_shortcuts")
        .update({ shortcut: combo })
        .eq("id", existing.id)
      if (error) {
        toast.error(t("toast.saveError"))
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from("keyboard_shortcuts").insert({
        account_id: accountId,
        user_id: accountId,
        action_key: actionKey,
        shortcut: combo,
        is_enabled: true,
      })
      if (error) {
        toast.error(t("toast.saveError"))
        setSaving(false)
        return
      }
    }

    toast.success(t("toast.saved"))
    setEditingId(null)
    setSaving(false)
    load()
  }

  async function toggleEnabled(actionKey: string, next: boolean) {
    if (!accountId) return
    const existing = items.find(
      (i) => i.action_key === actionKey && i.account_id === accountId,
    )
    const supabase = createClient()

    if (existing) {
      const { error } = await supabase
        .from("keyboard_shortcuts")
        .update({ is_enabled: next })
        .eq("id", existing.id)
      if (error) {
        toast.error(t("toast.saveError"))
        return
      }
    } else {
      const defaultEntry = DEFAULT_SHORTCUTS.find((s) => s.action_key === actionKey)
      const { error } = await supabase.from("keyboard_shortcuts").insert({
        account_id: accountId,
        user_id: accountId,
        action_key: actionKey,
        shortcut: defaultEntry?.default_combo ?? "",
        is_enabled: next,
      })
      if (error) {
        toast.error(t("toast.saveError"))
        return
      }
    }

    load()
  }

  async function resetToDefault(actionKey: string) {
    if (!accountId) return
    const defaultEntry = DEFAULT_SHORTCUTS.find((s) => s.action_key === actionKey)
    if (!defaultEntry) return
    const existing = items.find(
      (i) => i.action_key === actionKey && i.account_id === accountId,
    )
    const supabase = createClient()

    if (existing) {
      const { error } = await supabase
        .from("keyboard_shortcuts")
        .update({ shortcut: defaultEntry.default_combo })
        .eq("id", existing.id)
      if (error) {
        toast.error(t("toast.saveError"))
        return
      }
    }

    toast.success(t("toast.reset"))
    load()
  }

  if (loading) {
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
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Keyboard className="h-4 w-4 text-primary" />
              {t("shortcutsTitle")}
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pl-8 bg-muted text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[25%] min-w-40 text-muted-foreground">
                  {t("table.action")}
                </TableHead>
                <TableHead className="w-[40%] min-w-60 text-muted-foreground">
                  {t("table.description")}
                </TableHead>
                <TableHead className="w-[20%] min-w-40 text-center text-muted-foreground">
                  {t("table.shortcut")}
                </TableHead>
                <TableHead className="w-[15%] min-w-20 text-muted-foreground">
                  {t("table.enabled")}
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={5} className="text-center py-10">
                    <p className="text-sm text-muted-foreground">{t("noResults")}</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((entry) => {
                  const isEditing = editingId === entry.action_key
                  const isDefault = entry.current_combo.join("+") === entry.default_combo

                  return (
                    <TableRow key={entry.action_key} className="border-border hover:bg-muted/50">
                      <TableCell className="truncate font-medium text-foreground">
                        {entry.label}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <p className="truncate" title={entry.description}>
                          {entry.description}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditing ? (
                          <div
                            className="flex items-center justify-center gap-2"
                            onKeyDown={handleKeyDown}
                            tabIndex={-1}
                          >
                            <Input
                              value={editCombo}
                              readOnly
                              onClick={() => setRecording(true)}
                              className="h-8 w-28 cursor-pointer bg-muted text-center font-mono text-xs text-foreground"
                              placeholder={t("dialog.clickToRecord")}
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => startEdit(entry.action_key)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <kbd className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-1 text-xs font-mono text-foreground">
                              {comboDisplay(entry.current_combo)}
                            </kbd>
                            {!isDefault && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => resetToDefault(entry.action_key)}
                                className="text-muted-foreground hover:text-foreground"
                                title={t("dialog.resetDefault")}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={entry.is_enabled}
                          onCheckedChange={(v) => toggleEnabled(entry.action_key, !!v)}
                          aria-label={`${entry.is_enabled ? t("disable") : t("enable")} ${entry.label}`}
                        />
                      </TableCell>
                      <TableCell>
                        {canSendMessages && (
                          isEditing ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => saveShortcut(entry.action_key)}
                              disabled={saving}
                              className="text-primary hover:bg-primary/10 hover:text-primary"
                            >
                              {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => startEdit(entry.action_key)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingId} onOpenChange={(v) => { if (!v) { setEditingId(null); setRecording(false) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dialog.editTitle")}</DialogTitle>
            <DialogDescription>
              {t("dialog.editDesc", { action: merged.find((s) => s.action_key === editingId)?.label ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("dialog.shortcut")}</Label>
              <div
                className={`flex items-center gap-2 rounded-lg border p-3 transition-colors ${
                  recording
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border bg-muted"
                }`}
                onKeyDown={handleKeyDown}
                tabIndex={0}
              >
                <kbd className="inline-flex min-w-[120px] items-center justify-center rounded border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground">
                  {editCombo || t("dialog.pressKeys")}
                </kbd>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRecording(!recording)}
                  className="shrink-0 border-border text-muted-foreground hover:bg-muted"
                >
                  {recording ? t("dialog.recording") : t("dialog.record")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("dialog.shortcutHint")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setEditingId(null); setRecording(false) }}
              disabled={saving}
            >
              {t("dialog.cancel")}
            </Button>
            <Button
              onClick={() => editingId && saveShortcut(editingId)}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t("dialog.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
