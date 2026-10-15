"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Info,
  Loader2,
  Play,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { describeError } from "@/lib/errors"
import { STEP_META, stepColors } from "@/lib/automations/step-meta"
import { cn } from "@/lib/utils"
import type { AutomationTriggerType } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

// ------------------------------------------------------------
// Dry-run dialog: "what would this automation do?"
//
// Posts to /api/automations/engine with dry_run: true, which plans the
// run without sending messages or writing logs. It always tests the
// SAVED version of the automation (the server reloads the row), so the
// dialog says so — the builder's unsaved edits are not included.
// ------------------------------------------------------------

interface PlanStep {
  step_id: string
  step_type: string
  status: "would_run" | "skipped" | "blocked"
  detail: string | null
  reason?: string
  children?: PlanStep[]
}

interface PlanSummary {
  total: number
  would_run: number
  skipped: number
  blocked: number
  would_send: number
}

interface DryRunResult {
  automation: {
    id: string
    name: string
    trigger_type: string
    is_active: boolean
  }
  trigger: { matched: boolean; reason: string }
  steps: PlanStep[]
  summary: PlanSummary
  notes: string[]
}

interface DryRunResponse {
  dry_run: boolean
  results: DryRunResult[]
}

interface Option {
  id: string
  name: string
}

export interface TestRunDialogProps {
  automationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TestRunDialog({ automationId, open, onOpenChange }: TestRunDialogProps) {
  const t = useTranslations("Automations.builder")
  const { accountId } = useAuth()

  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [triggerType, setTriggerType] = useState<AutomationTriggerType | null>(null)
  const [contacts, setContacts] = useState<Option[]>([])
  const [tags, setTags] = useState<Option[]>([])

  const [contactId, setContactId] = useState("")
  const [messageText, setMessageText] = useState("")
  const [tagId, setTagId] = useState("")
  const [replyId, setReplyId] = useState("")

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<DryRunResponse | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setLoaded(false)
    setLoadError(null)
    setTriggerType(null)
    setContacts([])
    setTags([])
    setContactId("")
    setMessageText("")
    setTagId("")
    setReplyId("")
    setResult(null)
    setRunError(null)
  }, [])

  useEffect(() => {
    if (!open || !accountId) return
    let cancelled = false
    reset()
    setLoading(true)
    const supabase = createClient()
    void (async () => {
      try {
        const [autoRes, contactsRes, tagsRes] = await Promise.all([
          fetch(`/api/automations/${automationId}`).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(`load failed (${r.status})`)),
          ),
          supabase
            .from("contacts")
            .select("id, name, phone")
            .eq("account_id", accountId)
            .order("name")
            .limit(200),
          supabase.from("tags").select("id, name").order("name").limit(200),
        ])
        if (cancelled) return
        setTriggerType(autoRes.automation.trigger_type as AutomationTriggerType)
        setContacts(
          ((contactsRes.data ?? []) as { id: string; name: string; phone: string }[]).map(
            (c) => ({ id: c.id, name: c.name || c.phone || c.id }),
          ),
        )
        setTags(((tagsRes.data ?? []) as { id: string; name: string }[]).map((g) => ({ id: g.id, name: g.name })))
        setLoaded(true)
      } catch (err) {
        if (cancelled) return
        setLoadError(describeError(err, "The automation could not be loaded for testing."))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, accountId, automationId, reset])

  async function runTest() {
    if (!triggerType) return
    setRunning(true)
    setRunError(null)
    setResult(null)
    try {
      const res = await fetch("/api/automations/engine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dry_run: true,
          automation_id: automationId,
          trigger_type: triggerType,
          contact_id: contactId || null,
          context: {
            ...(messageText ? { message_text: messageText } : {}),
            ...(tagId ? { tag_id: tagId } : {}),
            ...(replyId ? { interactive_reply_id: replyId } : {}),
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRunError(body?.error ?? describeError(null, "The test run request failed."))
        return
      }
      setResult(body as DryRunResponse)
    } catch (err) {
      setRunError(describeError(err, "The test run request failed."))
    } finally {
      setRunning(false)
    }
  }

  const showTagPicker = triggerType === "tag_added"
  const showReplyPicker = triggerType === "interactive_reply"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Test run</DialogTitle>
          <DialogDescription>
            Previews the saved automation step by step. No messages are sent and
            nothing is written to the logs.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          </div>
        )}

        {loadError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
        )}

        {loaded && triggerType && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="test-contact">Test contact (optional)</Label>
                <Select
                  value={contactId}
                  onValueChange={(value) => setContactId(value ?? "")}
                >
                  <SelectTrigger id="test-contact">
                    <SelectValue placeholder="No contact — config only" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Steps that need a contact are blocked until one is picked.
                </p>
              </div>

              {showTagPicker ? (
                <div className="space-y-1.5">
                  <Label htmlFor="test-tag">Tag the trigger listens for</Label>
                  <Select
                    value={tagId}
                    onValueChange={(value) => setTagId(value ?? "")}
                  >
                    <SelectTrigger id="test-tag">
                      <SelectValue placeholder="Select a tag…" />
                    </SelectTrigger>
                    <SelectContent>
                      {tags.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {showReplyPicker ? (
                <div className="space-y-1.5">
                  <Label htmlFor="test-reply">Button / list reply id</Label>
                  <Input
                    id="test-reply"
                    value={replyId}
                    onChange={(e) => setReplyId(e.target.value)}
                    placeholder="yes"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="test-message">Test message</Label>
              <Textarea
                id="test-message"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Hi, I'd like a quote please"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Used by keyword triggers and message-content conditions.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={runTest} disabled={running}>
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Play className="h-4 w-4" aria-hidden />
                )}
                Run test
              </Button>
              <p className="text-xs text-muted-foreground">
                Tests the saved version — save your changes first to test them.
              </p>
            </div>

            {runError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {runError}
              </p>
            )}

            {result && (
              <div className="space-y-3">
                {result.results.map((r) => (
                  <div
                    key={r.automation.id}
                    className="space-y-3 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {r.automation.name}
                      </span>
                      {r.automation.is_active ? (
                        <Badge variant="secondary" className="h-5 px-2 text-[11px] leading-none">
                          Live
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="h-5 px-2 text-[11px] leading-none text-muted-foreground"
                        >
                          Paused
                        </Badge>
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          r.trigger.matched
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-500",
                        )}
                      >
                        {r.trigger.matched ? (
                          <CheckCircle2 className="h-3 w-3" aria-hidden />
                        ) : (
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                        )}
                        {r.trigger.matched ? "Trigger matches" : "Trigger would not fire"}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">{r.trigger.reason}</p>

                    {r.steps.length > 0 && (
                      <>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <SummaryChip label="would run" value={r.summary.would_run} />
                          <SummaryChip label="blocked" value={r.summary.blocked} tone="danger" />
                          <SummaryChip label="skipped" value={r.summary.skipped} />
                          <SummaryChip label="messages" value={r.summary.would_send} />
                        </div>
                        <ul className="space-y-2">
                          {r.steps.map((step) => (
                            <StepPlanNode key={step.step_id} node={step} t={t} />
                          ))}
                        </ul>
                      </>
                    )}

                    {r.steps.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Nothing would run — this automation has no steps.
                      </p>
                    )}

                    <ul className="space-y-1 border-t border-border pt-3">
                      {r.notes.map((note) => (
                        <li
                          key={note}
                          className="flex items-start gap-1.5 text-xs text-muted-foreground"
                        >
                          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "danger"
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        tone === "danger" && value > 0
          ? "border-red-500/30 bg-red-500/10 text-red-500"
          : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      <span className="tabular-nums">{value}</span> {label}
    </span>
  )
}

function StepPlanNode({
  node,
  t,
  depth = 0,
}: {
  node: PlanStep
  t: ReturnType<typeof useTranslations>
  depth?: number
}) {
  const known = node.step_type in STEP_META
  const meta = STEP_META[node.step_type as keyof typeof STEP_META]
  const label = known ? t(`steps.${node.step_type}` as "steps.send_message") : node.step_type

  return (
    <li>
      <div
        className={cn(
          "flex items-start gap-2 rounded-md px-2 py-1.5",
          node.status === "blocked" && "bg-red-500/5",
          node.status === "skipped" && "opacity-60",
        )}
        style={depth > 0 ? { marginLeft: 0 } : undefined}
      >
        <PlanStatusIcon status={node.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-medium text-foreground">{label}</span>
            <StatusWord status={node.status} />
          </div>
          {node.detail && (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{node.detail}</p>
          )}
          {node.reason && (
            <p className="mt-0.5 break-words text-xs text-red-400">{node.reason}</p>
          )}
        </div>
        {meta && depth === 0 && (
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded"
            style={{
              background: stepColors(node.step_type as keyof typeof STEP_META).soft,
              color: stepColors(node.step_type as keyof typeof STEP_META).solid,
            }}
            aria-hidden
          >
            <meta.icon className="h-3 w-3" />
          </span>
        )}
      </div>
      {node.children && node.children.length > 0 && (
        <ul className="ml-4 space-y-1 border-l border-border pl-3">
          {node.children.map((child) => (
            <StepPlanNode key={child.step_id} node={child} t={t} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function PlanStatusIcon({ status }: { status: PlanStep["status"] }) {
  if (status === "would_run") {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
  }
  if (status === "blocked") {
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
  }
  return <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
}

function StatusWord({ status }: { status: PlanStep["status"] }) {
  const text =
    status === "would_run" ? "would run" : status === "blocked" ? "would fail" : "skipped"
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wide",
        status === "would_run" && "text-primary",
        status === "blocked" && "text-red-400",
        status === "skipped" && "text-muted-foreground",
      )}
    >
      {text}
    </span>
  )
}
